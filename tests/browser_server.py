from pathlib import Path
import sys
from tempfile import TemporaryDirectory
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.config import Settings
from backend.app import create_app
from backend.store import now
import backend.app
import backend.studio
import httpx
import uvicorn

class OfflineGraph:
    class Embedder:
        async def create_batch(self, texts):
            raise httpx.ConnectError('test offline')
    embedder = Embedder()
    async def close(self): pass
    async def search(self, question, memories): return []
    async def view(self, memories): return {'nodes': [], 'edges': []}

async def test_generator(settings, provider, instructions, payload, schema, max_tokens):
    evidence = payload['evidence']
    quiz = 'multiple-choice' in instructions
    return {'title': 'Browser fixture: research memory', 'summary': 'Deterministic interaction fixture, not generated research.', 'items': [
        {'title': f'Memory concept {n+1}', 'text': f'Research finding {n+1}: inspect citations before preserving generated claims in memory.',
         'group': ['Evidence', 'Evaluation', 'Memory'][n], 'citations': [evidence[n % len(evidence)]['id']],
         'options': ['Inspect citations', 'Ignore sources', 'Trust all claims', 'Discard evidence'] if quiz else [], 'answer': 0 if quiz else -1} for n in range(3)]}, {'model': 'browser-test-fixture', 'usage': {}, 'estimated_cost_usd': None}

async def test_search(store, settings, query, papers_only=False):
    return store.save_history('web', {'query': query, 'papers_only': papers_only, 'provider': 'Browser test fixture', 'usage': {'credits': 0}, 'results': [
        {'id': 'w-fixture', 'source_id': '', 'title': 'Browser fixture: public memory study', 'url': 'https://arxiv.org/abs/2402.17753',
         'text': 'A public study on memory evaluation discusses citations and how evidence should be reviewed.', 'excerpt': 'Public memory evaluation test excerpt.', 'kind': 'web', 'page': None,
         'content_type': 'search excerpt', 'retrieved_at': now(), 'published_at': None}]})

if __name__ == '__main__':
    with TemporaryDirectory(prefix='memory-lab-browser-') as directory:
        settings = Settings()
        settings.db_path = Path(directory) / 'lab.sqlite3'
        settings.values['TAVILY_API_KEY'] = 'browser-test-fixture'
        settings.values['OPENAI_API_KEY'] = 'browser-test-fixture'
        backend.studio.structured_generate = test_generator
        backend.app.search_web = test_search
        uvicorn.run(create_app(settings, OfflineGraph()), host='127.0.0.1', port=8021, log_level='warning')
