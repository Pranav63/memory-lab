import asyncio
from unittest.mock import patch

import httpx
import pymupdf
import pytest

from backend.catalog import Catalog
from backend.config import Settings
from backend.reader import arxiv_pdf
from test_lab import client_at


def test_uploaded_original_remains_available_after_restart(tmp_path):
    with pymupdf.open() as doc:
        page = doc.new_page()
        page.insert_text((72, 72), 'The jade paper preserves the original document for in-app reading.')
        pdf = doc.tobytes()
    path = tmp_path / 'lab.sqlite3'
    with client_at(path) as client:
        source = client.post('/api/sources/upload', data={'title': 'Jade paper'}, files={'file': ('jade.pdf', pdf, 'application/pdf')}).json()
    with client_at(path) as client:
        original = client.get('/api/sources/' + source['id'] + '/original')
        assert original.status_code == 200
        assert original.content == pdf
        assert original.headers['content-type'] == 'application/pdf'
        assert original.headers['content-disposition'] == 'inline'
        assert next(s for s in client.get('/api/sources').json() if s['id'] == source['id'])['has_original']
        assert client.get('/api/sources/missing/original').status_code == 404


def test_reader_only_fetches_canonical_arxiv_pdf_urls():
    assert arxiv_pdf('https://arxiv.org/abs/2402.17753') == 'https://arxiv.org/pdf/2402.17753'
    assert arxiv_pdf('https://arxiv.org/pdf/2402.17753v2.pdf') == 'https://arxiv.org/pdf/2402.17753v2'
    for url in ['http://127.0.0.1/abs/2402.17753', 'https://arxiv.org.evil.test/abs/2402.17753', 'https://arxiv.org@evil.test/abs/2402.17753', 'https://arxiv.org/abs/../admin', 'https://arxiv.org/abs/2402.17753/other']:
        assert arxiv_pdf(url) is None


def test_reader_preview_does_not_import_paper_text(tmp_path):
    with client_at(tmp_path / 'lab.sqlite3') as client:
        source = next(s for s in client.get('/api/sources').json() if s['has_original'])
        before = client.app.state.store.snapshot()
        transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b'%PDF-1.7\noriginal-paper-fixture'))
        connection = httpx.AsyncClient(transport=transport)
        with patch('backend.reader.httpx.AsyncClient', return_value=connection):
            assert client.get('/api/sources/' + source['id'] + '/original').status_code == 200
        assert client.app.state.store.snapshot() == before


def test_catalog_paginates_and_preserves_missing_metrics(tmp_path):
    settings = Settings()
    settings.db_path = tmp_path / 'lab.sqlite3'
    settings.values['ARTIFICIAL_ANALYSIS_API_KEY'] = 'private-test-sentinel'
    seen = []
    def handle(request):
        page = int(request.url.params['page'])
        assert request.headers['x-api-key'] == 'private-test-sentinel'
        seen.append(page)
        return httpx.Response(200, json={'data': [{'id': str(page), 'slug': 'model-' + str(page), 'name': 'Measured model', 'evaluations': {'artificial_analysis_intelligence_index': 0 if page == 1 else None}, 'pricing': {}, 'performance': {}}], 'pagination': {'has_more': page == 1}, 'intelligence_index_version': 4.3})
    catalog = Catalog(settings)
    with patch('backend.catalog.httpx.AsyncClient', return_value=httpx.AsyncClient(transport=httpx.MockTransport(handle))):
        result = asyncio.run(catalog.refresh())
    assert seen == [1, 2]
    assert result['models'][0]['intelligence'] == 0
    assert result['models'][1]['intelligence'] is None
    assert result['models'][0]['speed'] is None
    assert result['index_version'] == 4.3
    assert 'private-test-sentinel' not in str(result)
    assert Catalog(settings).view()['updated_at'] == result['updated_at']


def test_failed_catalog_refresh_preserves_previous_snapshot(tmp_path):
    settings = Settings()
    settings.db_path = tmp_path / 'lab.sqlite3'
    settings.values['ARTIFICIAL_ANALYSIS_API_KEY'] = 'private-test-sentinel'
    catalog = Catalog(settings)
    catalog.path.write_text('{"models": [], "updated_at": "previous", "index_version": 4.3}')
    with patch('backend.catalog.httpx.AsyncClient', return_value=httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(401, text='secret-containing-vendor-body')))):
        with pytest.raises(Exception) as error:
            asyncio.run(catalog.refresh())
    assert error.value.status_code == 502
    assert 'secret-containing' not in error.value.detail
    assert catalog.view()['updated_at'] == 'previous'
