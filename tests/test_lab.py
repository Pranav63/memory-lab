import asyncio

import httpx
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Settings
from backend.research import generate, retrieve
from backend.store import Store
from unittest.mock import patch


class OfflineGraph:
    class Embedder:
        async def create_batch(self, text):
            raise httpx.ConnectError('offline')
        async def create(self, text):
            raise httpx.ConnectError('offline')
    embedder = Embedder()
    async def close(self):
        pass
    async def view(self, memories):
        return {'nodes': [], 'edges': [], 'engine': 'test'}
    async def search(self, question, memories):
        return []
    async def index(self, memory):
        raise RuntimeError('offline')


def client_at(path):
    settings = Settings()
    settings.db_path = path
    return TestClient(create_app(settings, OfflineGraph()))


def test_sources_findings_and_revisions_survive_restart(tmp_path):
    path = tmp_path / 'lab.sqlite3'
    with client_at(path) as client:
        source = client.post('/api/sources', json={'title': 'Persistent decision', 'text': 'The research prototype should run all embeddings locally.'}).json()
        old = client.post('/api/memories', json={'source_id': source['id'], 'text': 'For the prototype we prefer local embeddings.'}).json()
        new = client.post('/api/memories', json={'source_id': source['id'], 'text': 'The revised prototype requires local embeddings.', 'supersedes': old['id']}).json()
        assert client.post('/api/memories', json={'source_id': source['id'], 'text': 'Try revising the old version again.', 'supersedes': old['id']}).status_code == 409
    with client_at(path) as restarted:
        rows = restarted.get('/api/memories').json()
        assert next(m for m in rows if m['id'] == old['id'])['retired_at']
        assert next(m for m in rows if m['id'] == new['id'])['supersedes'] == old['id']
        assert restarted.get('/api/sources').json()[0]['title'] == 'Persistent decision'


def test_context_isolation_and_expected_evidence_not_sent_to_generator(tmp_path):
    with client_at(tmp_path / 'lab.sqlite3') as client:
        source = client.post('/api/sources', json={'title': 'Private study', 'text': 'The private study compares retrieval using violet memory with lexical retrieval.'}).json()
        client.post('/api/memories', json={'source_id': source['id'], 'text': 'The violet memory experiment must retain evidence citations.'})
        result = client.post('/api/experiments', json={'question': 'What does the violet memory experiment retain?', 'expected_source_ids': [source['id']]}).json()
        none, sources, memory = result['conditions']
        assert none['contexts'] == [] and none['evidence_recall'] == 0
        assert sources['contexts'] and all(c['kind'] not in ['finding', 'graph'] for c in sources['contexts'])
        assert any(c['kind'] == 'finding' for c in memory['contexts'])
        assert 'expected_source_ids' not in str(memory['contexts'])
        assert memory['evidence_recall'] == 1
        assert result['snapshot_changed'] is False
        exported = client.get('/api/history/' + result['id'] + '/export')
        assert exported.status_code == 200 and exported.json()['conditions'] == result['conditions']


def test_citations_refer_to_supplied_passages(tmp_path):
    with client_at(tmp_path / 'lab.sqlite3') as client:
        result = client.post('/api/research', json={'question': 'How does retrieval memory work?', 'provider': 'evidence', 'mode': 'sources'}).json()
        assert result['contexts']
        ids = {c['id'] for c in result['contexts']}
        assert all(cid in ids for p in result['paragraphs'] for cid in p['citations'])
        assert result['model'] == 'Evidence preview · no generator'


def test_index_failure_preserves_note_and_marks_failure(tmp_path):
    with client_at(tmp_path / 'lab.sqlite3') as client:
        source = client.get('/api/sources').json()[0]
        m = client.post('/api/memories', json={'source_id': source['id'], 'text': 'Keep provenance when research findings are remembered.'}).json()
        assert client.post('/api/memories/' + m['id'] + '/index').status_code == 503
        saved = next(x for x in client.get('/api/memories').json() if x['id'] == m['id'])
        assert saved['status'] == 'failed' and saved['text'] == m['text']


def test_invalid_documents_and_nonexistent_sources(tmp_path):
    with client_at(tmp_path / 'lab.sqlite3') as client:
        assert client.post('/api/sources/upload', data={'title': 'Broken PDF'}, files={'file': ('broken.pdf', b'not a pdf', 'application/pdf')}).status_code == 422
        assert client.post('/api/sources/upload', data={'title': 'Unknown file'}, files={'file': ('x.exe', b'a valid length of bytes', 'application/octet-stream')}).status_code == 422
        assert client.post('/api/memories', json={'source_id': 'missing', 'text': 'A finding without a valid source.'}).status_code == 404
        assert client.post('/api/sources', json={'title': 'Bad URL', 'text': 'Enough text for a source.', 'url': 'javascript:alert(1)'}).status_code == 422
        assert client.post('/api/experiments', json={'question': 'What is memory?', 'expected_source_ids': ['missing']}).status_code == 422


def test_retired_findings_do_not_enter_current_context(tmp_path):
    store = Store(tmp_path / 'lab.sqlite3')
    s = store.add_source('Revision', 'note', '', 'A revision source about embeddings.')
    old = store.add_memory(s['id'], 'The basalt experiment uses an obsolete remote provider.')
    store.add_memory(s['id'], 'The basalt experiment now uses local embeddings.', old['id'])
    contexts, _, _ = asyncio.run(retrieve(store, OfflineGraph(), 'What does the basalt experiment use?', 'memory'))
    assert all('obsolete' not in c['text'] for c in contexts)
    assert any('local embeddings' in c['text'] for c in contexts)


def test_pdf_upload_preserves_page_provenance(tmp_path):
    import pymupdf
    with pymupdf.open() as doc:
        page = doc.new_page()
        page.insert_text((72, 72), 'The amber study uses page-level citations for reproducibility.')
        pdf = doc.tobytes()
    with client_at(tmp_path / 'lab.sqlite3') as client:
        result = client.post('/api/sources/upload', data={'title': 'Amber paper'}, files={'file': ('amber.pdf', pdf, 'application/pdf')})
        assert result.status_code == 201
        answer = client.post('/api/research', json={'question': 'What does the amber study use?', 'mode': 'sources'}).json()
        assert any(c['source_id'] == result.json()['id'] and c['page'] == 1 for c in answer['contexts'])


def test_generator_rejects_invented_citations():
    settings = Settings()
    settings.values['OPENAI_API_KEY'] = 'test-only-sentinel'
    def handler(request):
        assert 'expected_source_ids' not in request.content.decode()
        return httpx.Response(200, json={'status': 'completed', 'model': settings.openai_model, 'output': [{'content': [{'type': 'output_text', 'text': '{"paragraphs":[{"text":"A claim","citations":["not-retrieved"]}]}'}]}]})
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with patch('backend.research.httpx.AsyncClient', return_value=client):
        try:
            asyncio.run(generate(settings, 'gpt', 'A research question?', [{'id': 'valid', 'text': 'Evidence'}]))
            assert False, 'Unknown citations must be rejected'
        except ValueError as e:
            assert 'outside the retrieved context' in str(e)


def test_export_can_retrieve_a_run_beyond_the_history_window(tmp_path):
    store = Store(tmp_path / 'lab.sqlite3')
    original = store.save_history('research', {'question': 'First question'})
    for i in range(45):
        store.save_history('research', {'question': f'Later question {i}'})
    assert len(store.history()) == 40
    assert store.history_item(original['id']) == original


def test_interrupted_index_is_recoverable_after_restart(tmp_path):
    path = tmp_path / 'lab.sqlite3'
    store = Store(path)
    s = store.add_source('Source', 'note', '', 'A source that supports a finding.')
    m = store.add_memory(s['id'], 'A saved finding that was interrupted during indexing.')
    store.graph_status(m['id'], 'indexing')
    restarted = Store(path)
    assert restarted.memories()[0]['status'] == 'failed'
    assert 'interrupted' in restarted.memories()[0]['error']
