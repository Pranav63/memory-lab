from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi import HTTPException

from .store import now


async def search_web(store, settings, query, papers_only=False):
    key = settings.key('tavily')
    if not key:
        raise HTTPException(503, 'Internet search needs a Tavily connection on the backend.')
    payload = {'query': query, 'search_depth': 'basic', 'max_results': 5, 'topic': 'general',
               'include_answer': False, 'include_raw_content': 'text', 'include_published_date': True,
               'include_usage': True, 'auto_parameters': False}
    if papers_only:
        payload['include_domains'] = ['arxiv.org', 'aclanthology.org', 'openreview.net']
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post('https://api.tavily.com/search', headers={'Authorization': 'Bearer ' + key}, json=payload)
            response.raise_for_status()
            data = response.json()
        results = []
        for item in data.get('results', [])[:5]:
            url = item.get('url', '')
            parsed = urlsplit(url)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
                continue
            raw = item.get('raw_content')
            content = (raw or item.get('content') or '').strip()
            if len(content) < 10:
                continue
            results.append({'id': 'w-' + uuid4().hex[:12], 'source_id': '', 'title': str(item.get('title') or parsed.hostname)[:180],
                            'url': url, 'text': content[:40_000], 'excerpt': str(item.get('content') or content)[:1000],
                            'kind': 'web', 'page': None, 'content_type': 'page extract' if raw else 'search excerpt',
                            'published_at': item.get('published_date'), 'retrieved_at': now()})
        return store.save_history('web', {'query': query, 'papers_only': papers_only, 'provider': 'Tavily',
                                         'results': results, 'usage': data.get('usage', {}), 'request_id': data.get('request_id')})
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(502, 'Internet search failed. Check the Tavily connection or quota and retry explicitly.') from None


def import_result(store, search_id, result_id):
    search = store.history_item(search_id, 'web')
    result = next((r for r in search['results'] if r['id'] == result_id), None) if search else None
    if not result:
        raise HTTPException(404, 'Choose a result from a saved internet search.')
    origin = {'search_id': search_id, 'result_id': result_id, 'query': search['query'], 'provider': search['provider'],
              'retrieved_at': result['retrieved_at'], 'published_at': result['published_at'], 'content_type': result['content_type']}
    return store.import_web_source(result['title'], result['url'], result['text'], origin)
