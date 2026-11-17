from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings
from backend.store import Store
from backend.studio import validate_artifact
from test_lab import OfflineGraph


def setup(tmp_path):
    settings = Settings()
    settings.db_path = tmp_path / 'lab.sqlite3'
    settings.values['TAVILY_API_KEY'] = 'test-only-key'
    return settings, TestClient(create_app(settings, OfflineGraph()))


def test_search_snapshot_import_is_explicit_deduplicated_and_persistent(tmp_path):
    settings, client = setup(tmp_path)
    before = client.get('/api/sources').json()
    def handler(request):
        assert request.headers['authorization'] == 'Bearer test-only-key'
        assert b'"search_depth":"basic"' in request.content
        return httpx.Response(200, json={'results': [
            {'title': 'A public paper', 'url': 'https://arxiv.org/abs/2402.17753', 'content': 'A short discovery excerpt.', 'raw_content': 'The full extracted page studies memory evaluation and its limitations.'},
            {'title': 'Bad scheme', 'url': 'javascript:alert(1)', 'content': 'This should never become a link.'}], 'usage': {'credits': 1}})
    transport = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.web.httpx.AsyncClient', return_value=transport):
        response = client.post('/api/web/search', json={'query': 'memory evaluation'})
    assert response.status_code == 200
    search = response.json()
    assert len(search['results']) == 1 and search['usage']['credits'] == 1
    assert client.get('/api/sources').json() == before
    result = search['results'][0]
    imported = client.post('/api/web/import', json={'search_id': search['id'], 'result_id': result['id']}).json()
    assert imported['kind'] == 'web' and imported['origin']['content_type'] == 'page extract'
    assert imported['origin']['retrieved_at'] == result['retrieved_at']
    again = client.post('/api/web/import', json={'search_id': search['id'], 'result_id': result['id']}).json()
    assert again['id'] == imported['id']
    assert client.post('/api/web/import', json={'search_id': search['id'], 'result_id': 'fabricated'}).status_code == 404
    restarted = Store(settings.db_path)
    assert restarted.source(imported['id'])['origin']['search_id'] == search['id']
    assert restarted.history_item(search['id'], 'web') == search


def test_web_failure_has_no_silent_fallback_and_experiments_reject_live_search(tmp_path):
    settings, client = setup(tmp_path)
    settings.values['TAVILY_API_KEY'] = ''
    settings.values['TAVILY_ENV_FILE'] = ''
    assert client.post('/api/research', json={'question': 'What is memory?', 'use_web': True}).status_code == 503
    assert client.get('/api/history?kind=research').json() == []
    assert client.post('/api/experiments', json={'question': 'What is memory?', 'use_web': True}).status_code == 422
    assert client.post('/api/web/search', json={'query': '   '}).status_code == 422


def data_for(contexts, quiz=False):
    return {'title': 'A research artifact', 'summary': 'Study notes from selected passages.', 'items': [
        {'title': f'Question {n}', 'text': 'Local memory retrieval requires citation review.', 'group': 'Memory', 'citations': [contexts[0]['id']],
         'options': ['A','B','C','D'] if quiz else [], 'answer': 1 if quiz else -1} for n in range(3)]}


@pytest.mark.parametrize('invalid', ['invented', 'uncited', 'bad-answer', 'duplicate-options'])
def test_studio_rejects_invalid_citations_and_quiz_answers(invalid):
    contexts = [{'id': 'valid'}]
    data = data_for(contexts, quiz=True)
    if invalid == 'invented':
        data['items'][0]['citations'] = ['unknown']
    elif invalid == 'uncited':
        data['items'][0]['citations'] = []
    elif invalid == 'bad-answer':
        data['items'][0]['answer'] = 4
    else:
        data['items'][0]['options'] = ['A','A','C','D']
    with pytest.raises(ValueError):
        validate_artifact(data, 'quiz', contexts)


def test_artifacts_reviews_and_guarded_memory_promotion_survive_restart(tmp_path):
    settings, client = setup(tmp_path)
    source = client.get('/api/sources').json()[0]
    captured = {}
    async def generator(settings, provider, instructions, payload, schema, max_tokens):
        captured.update(payload)
        return data_for(payload['evidence']), {'model': 'test-generator', 'usage': {}, 'estimated_cost_usd': None}
    with patch('backend.studio.structured_generate', side_effect=generator):
        result = client.post('/api/studio', json={'format': 'report', 'topic': 'memory retrieval', 'source_ids': [source['id']], 'provider': 'local'})
    assert result.status_code == 201
    a = result.json()
    assert a['status'] == 'completed' and {c['source_id'] for c in captured['evidence']} == {source['id']}
    assert a['source_snapshot'][0]['sha256'] == source['sha256']
    assert len(a['evidence_sha256']) == 64
    payload = {'item_index': 0, 'context_id': a['items'][0]['citations'][0]}
    url = '/api/studio/' + a['id']
    assert client.post(url + '/promote', json=payload).status_code == 409
    client.post(url + '/reviews', json={'item_index': 0, 'verdict': 'supported', 'note': 'Checked the cited passage.'})
    assert client.post(url + '/promote', json={**payload, 'context_id': 'other'}).status_code == 422
    promoted = client.post(url + '/promote', json=payload).json()
    assert client.post(url + '/promote', json=payload).json()['finding_id'] == promoted['finding_id']
    client.post(url + '/reviews', json={'item_index': 0, 'verdict': 'contradicted', 'note': 'Scope needs revision.'})
    assert client.post(url + '/promote', json=payload).status_code == 409
    restarted = Store(settings.db_path)
    reviews = restarted.reviews(a['id'])
    assert len(reviews) == 2 and reviews[0]['verdict'] == 'contradicted'
    assert any(r['finding_id'] == promoted['finding_id'] for r in reviews)
    assert any(m['id'] == promoted['finding_id'] and m['source_id'] == source['id'] for m in restarted.memories())
    assert restarted.history_item(a['id'], 'artifact')['contexts'] == a['contexts']
    export = client.get('/api/history/' + a['id'] + '/export').json()
    assert export['items'] == a['items'] and export['reviews'] == reviews


def test_failed_generation_is_saved_without_memory_or_source_mutation(tmp_path):
    settings, client = setup(tmp_path)
    sources = client.get('/api/sources').json()
    memories = client.get('/api/memories').json()
    async def invalid(*args):
        data = data_for([{'id': 'invented'}])
        return data, {'model': 'test'}
    with patch('backend.studio.structured_generate', side_effect=invalid):
        a = client.post('/api/studio', json={'format': 'report', 'topic': 'memory evaluation', 'source_ids': [sources[0]['id']]}).json()
    assert a['status'] == 'failed' and not a['items']
    assert client.get('/api/sources').json() == sources
    assert client.get('/api/memories').json() == memories
    assert client.post('/api/studio/' + a['id'] + '/reviews', json={'item_index': 0, 'verdict': 'supported'}).status_code == 404
    assert client.post('/api/studio', json={'format': 'quiz', 'topic': 'memory', 'source_ids': ['missing']}).status_code == 422


def test_library_plus_web_answer_keeps_web_provenance_without_import(tmp_path):
    settings, client = setup(tmp_path)
    before = client.get('/api/sources').json()
    search = client.app.state.store.save_history('web', {'query': 'memory evaluation', 'results': [
        {'id': 'web-result', 'source_id': '', 'title': 'Memory paper', 'text': 'A public paper discusses memory evaluation.', 'url': 'https://arxiv.org/abs/2402.17753', 'kind': 'web', 'page': None}], 'usage': {'credits': 1}})
    async def fake_search(*args):
        return search
    with patch('backend.app.search_web', side_effect=fake_search):
        a = client.post('/api/research', json={'question': 'How is memory evaluated?', 'use_web': True}).json()
    assert a['web_search_id'] == search['id'] and a['search_usage']['credits'] == 1
    web = next(c for c in a['contexts'] if c['kind'] == 'web')
    assert web['search_id'] == search['id']
    assert client.get('/api/sources').json() == before


def test_flashcard_generation_uses_question_and_answer_text_without_quiz_fields(tmp_path):
    settings, client = setup(tmp_path)
    source = client.get('/api/sources').json()[0]
    async def generator(settings, provider, instructions, payload, schema, max_tokens):
        assert payload['format'] == 'flashcards'
        props = schema['properties']['items']['items']['properties']
        assert 'options' not in props and 'answer' not in props
        assert props['citations']['items']['enum'] == [c['id'] for c in payload['evidence']]
        assert schema['properties']['items']['minItems'] == 3
        data = data_for(payload['evidence'])
        for item in data['items']:
            del item['options']
            del item['answer']
        return data, {'model': 'local-test', 'usage': {}, 'estimated_cost_usd': None}
    with patch('backend.studio.structured_generate', side_effect=generator):
        a = client.post('/api/studio', json={'format': 'flashcards', 'topic': 'memory evaluation', 'source_ids': [source['id']]}).json()
    assert a['status'] == 'completed'
    assert all(i['options'] == [] and i['answer'] == -1 for i in a['items'])
