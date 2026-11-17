from contextlib import asynccontextmanager
from typing import Literal

import httpx
import pymupdf
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl

from .config import Settings
from .catalog import Catalog
from .graph import MemoryGraph
from .reader import PaperReader
from .research import MODES, embed_source, research
from .seed import seed
from .store import Store, chunks
from .web import search_web, import_result
from .studio import create_artifact


class SourceInput(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=10, max_length=200_000)
    kind: Literal['paper', 'note'] = 'note'
    url: HttpUrl | None = None


class FindingInput(BaseModel):
    source_id: str
    text: str = Field(min_length=10, max_length=2000)
    supersedes: str | None = None


class QuestionInput(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    mode: Literal['none', 'sources', 'memory'] = 'memory'
    provider: Literal['evidence', 'local', 'gpt'] = 'evidence'
    use_web: bool = False
    expected_source_ids: list[str] = Field(default_factory=list, max_length=20)


class WebInput(BaseModel):
    query: str = Field(min_length=3, max_length=1000)
    papers_only: bool = False


class WebImport(BaseModel):
    search_id: str
    result_id: str


class StudioInput(BaseModel):
    format: Literal['report', 'flashcards', 'quiz', 'mindmap', 'table', 'slides', 'infographic']
    topic: str = Field(min_length=3, max_length=1000)
    source_ids: list[str] = Field(min_length=1, max_length=8)
    provider: Literal['local', 'gpt'] = 'local'


class ReviewInput(BaseModel):
    item_index: int = Field(ge=0)
    verdict: Literal['supported', 'uncertain', 'contradicted']
    note: str = Field(default='', max_length=2000)


class PromoteInput(BaseModel):
    item_index: int = Field(ge=0)
    context_id: str


def create_app(settings=None, graph=None):
    settings = settings or Settings()
    store = Store(settings.db_path)
    graph = graph or MemoryGraph(settings)
    seed(store)
    reader = PaperReader(settings.db_path.parent)
    catalog = Catalog(settings)

    @asynccontextmanager
    async def lifespan(app):
        # A shutdown preserves both databases; no model inference occurs at startup.
        yield
        await graph.close()

    app = FastAPI(title='Research Memory Lab', version='0.1.0', lifespan=lifespan)
    app.state.store, app.state.graph = store, graph

    @app.get('/api/health')
    def health():
        return {'app': 'research-memory-lab', 'status': 'ok'}

    @app.get('/api/config')
    async def config():
        models = []
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(settings.ollama_url + '/api/tags')
                response.raise_for_status()
                models = [m['name'] for m in response.json().get('models', [])]
        except (httpx.HTTPError, ValueError, KeyError):
            pass
        return {'web': {'provider': 'Tavily', 'configured': bool(settings.key('tavily'))}, 'providers': [{'id': 'evidence', 'name': 'Evidence preview', 'model': 'Retrieved excerpts · no generation', 'configured': True},
                              {'id': 'local', 'name': 'Local · Ollama', 'model': settings.local_model, 'configured': settings.local_model in models},
                              {'id': 'gpt', 'name': 'Hosted · GPT', 'model': settings.openai_model, 'configured': bool(settings.key('openai'))}],
                'embedding': {'model': settings.embedding_model, 'configured': settings.embedding_model in models},
                'graph': {'engine': 'Graphiti 0.30.2 · FalkorDB 4.22.0', 'extraction_model': settings.graph_model, 'configured': bool(settings.key('groq'))}}

    @app.get('/api/sources')
    def sources():
        return [{**source, 'has_original': reader.available(source)} for source in store.sources()]

    @app.get('/api/sources/{source_id}/original')
    async def original(source_id: str):
        source = store.source(source_id)
        if not source:
            raise HTTPException(404, 'Source not found.')
        return await reader.original(source)

    @app.get('/api/models')
    def models():
        return catalog.view()

    @app.post('/api/models/refresh')
    async def refresh_models():
        return await catalog.refresh()

    @app.post('/api/sources', status_code=201)
    async def add_source(data: SourceInput):
        if not data.title.strip() or not data.text.strip():
            raise HTTPException(422, 'Title and source text cannot be blank.')
        source = store.add_source(data.title.strip(), data.kind, str(data.url) if data.url else '', data.text.strip())
        try:
            await embed_source(store, graph, source['id'])
        except (httpx.HTTPError, ValueError, KeyError):
            pass  # Stored text remains searchable; the UI shows pending embeddings.
        return store.source(source['id'])

    @app.post('/api/sources/upload', status_code=201)
    async def upload(title: str = Form(..., min_length=1, max_length=180), file: UploadFile = File(...)):
        if not title.strip():
            raise HTTPException(422, 'A source title cannot be blank.')
        content = await file.read(20_000_001)
        if len(content) > 20_000_000:
            raise HTTPException(413, 'Use a PDF or text file smaller than 20 MB.')
        filename = file.filename or ''
        pieces = []
        pages = []
        try:
            if filename.lower().endswith('.pdf'):
                with pymupdf.open(stream=content, filetype='pdf') as doc:
                    if len(doc) > 100:
                        raise HTTPException(422, 'The first version supports PDFs up to 100 pages.')
                    for number, page in enumerate(doc):
                        text = page.get_text().strip()
                        if text:
                            pages.append(text)
                            pieces.extend(chunks(text, number + 1))
                kind = 'paper'
                text = '\n\n'.join(pages)
            elif filename.lower().endswith(('.txt', '.md')):
                text, kind = content.decode('utf-8').strip(), 'note'
                pieces = chunks(text)
            else:
                raise HTTPException(422, 'Upload a PDF, UTF-8 text file or Markdown note.')
        except (pymupdf.FileDataError, UnicodeError, RuntimeError):
            raise HTTPException(422, 'The file could not be read. Scanned PDFs need OCR before import.') from None
        if len(text) < 10:
            raise HTTPException(422, 'No readable text was found. Scanned PDFs need OCR before import.')
        if len(text) > 200_000 or len(pieces) > 250:
            raise HTTPException(422, 'Use a smaller document (up to 200,000 extracted characters).')
        source = store.add_source(title.strip(), kind, '', text, pieces)
        if filename.lower().endswith('.pdf'):
            reader.save(source, content)
        try:
            await embed_source(store, graph, source['id'])
        except (httpx.HTTPError, ValueError, KeyError):
            pass
        return store.source(source['id'])

    @app.post('/api/sources/{source_id}/embed')
    async def embed(source_id: str):
        if not store.source(source_id):
            raise HTTPException(404, 'Source not found.')
        try:
            await embed_source(store, graph, source_id)
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(503, 'Local embeddings are unavailable. Start Ollama and install nomic-embed-text:v1.5.') from None
        return store.source(source_id)

    @app.get('/api/memories')
    def memories():
        return store.memories()

    @app.post('/api/memories', status_code=201)
    def add_finding(data: FindingInput):
        if not store.source(data.source_id):
            raise HTTPException(404, 'Choose an existing source for this finding.')
        if not data.text.strip():
            raise HTTPException(422, 'A finding cannot be blank.')
        try:
            return store.add_memory(data.source_id, data.text.strip(), data.supersedes)
        except ValueError as error:
            raise HTTPException(409, str(error)) from None

    @app.post('/api/memories/{memory_id}/index')
    async def index(memory_id: str):
        memory = next((m for m in store.memories(active=True) if m['id'] == memory_id), None)
        if not memory:
            raise HTTPException(404, 'Active finding not found.')
        if memory['status'] == 'indexed':
            return {'status': 'already_indexed', 'episode_id': memory['episode_id']}
        if memory['status'] == 'indexing':
            raise HTTPException(409, 'This finding is already being indexed.')
        store.graph_status(memory_id, 'indexing')
        try:
            result = await graph.index(memory)
            store.graph_status(memory_id, 'indexed', result['episode_id'])
            store.save_history('index', {'memory_id': memory_id, **result})
            return result
        except Exception:
            store.graph_status(memory_id, 'failed', error='Graph extraction failed. The finding remains saved; retry indexing explicitly.')
            raise HTTPException(503, 'Graph extraction failed. Check FalkorDB, the local embedder and Groq access. Your finding remains saved.') from None

    @app.get('/api/graph')
    async def graph_view():
        try:
            return {**await graph.view(store.memories()), 'status': 'ready'}
        except Exception:
            return {'nodes': [], 'edges': [], 'status': 'unavailable', 'error': 'Start the graph service to explore indexed findings.'}

    def validate_expected(data):
        if len(data.question.strip()) < 3:
            raise HTTPException(422, 'Write a research question with at least three characters.')
        if any(not store.source(source_id) for source_id in data.expected_source_ids):
            raise HTTPException(422, 'Expected evidence must refer to existing sources.')

    @app.post('/api/research')
    async def ask(data: QuestionInput):
        validate_expected(data)
        web = await search_web(store, settings, data.question.strip()) if data.use_web else None
        result = await research(store, graph, settings, data.question.strip(), data.mode, data.provider, data.expected_source_ids, web)
        return store.save_history('research', result)

    @app.post('/api/experiments')
    async def experiment(data: QuestionInput):
        validate_expected(data)
        if data.use_web:
            raise HTTPException(422, 'Import web evidence before comparing conditions. Experiments use a fixed library.')
        snapshot = store.snapshot()
        conditions = []
        for mode in MODES:
            conditions.append(await research(store, graph, settings, data.question.strip(), mode, data.provider, data.expected_source_ids))
        changed = store.snapshot() != snapshot
        return store.save_history('experiment', {'question': data.question.strip(), 'provider': data.provider,
                                                 'expected_source_ids': data.expected_source_ids, 'conditions': conditions,
                                                 'snapshot_changed': changed, **snapshot,
                                                 'protocol': 'v1 · six snippets, 600 characters each · sequential calls · no model retries'})

    @app.post('/api/web/search')
    async def discover(data: WebInput):
        if len(data.query.strip()) < 3:
            raise HTTPException(422, 'Write a search query with at least three characters.')
        return await search_web(store, settings, data.query.strip(), data.papers_only)

    @app.post('/api/web/import', status_code=201)
    async def import_web(data: WebImport):
        source = import_result(store, data.search_id, data.result_id)
        if source['embedding_status'] != 'ready':
            try:
                await embed_source(store, graph, source['id'])
            except (httpx.HTTPError, ValueError, KeyError):
                pass
        return store.source(source['id'])

    @app.post('/api/studio', status_code=201)
    async def studio(data: StudioInput):
        if len(data.topic.strip()) < 3:
            raise HTTPException(422, 'Write a topic with at least three characters.')
        return await create_artifact(store, settings, data.format, data.topic.strip(), data.source_ids, data.provider)

    def artifact_item(artifact_id, item_index):
        artifact = store.history_item(artifact_id, 'artifact')
        if not artifact or artifact['status'] != 'completed' or item_index >= len(artifact['items']):
            raise HTTPException(404, 'Studio item not found.')
        return artifact, artifact['items'][item_index]

    @app.get('/api/studio/{artifact_id}/reviews')
    def reviews(artifact_id: str):
        if not store.history_item(artifact_id, 'artifact'):
            raise HTTPException(404, 'Artifact not found.')
        return store.reviews(artifact_id)

    @app.post('/api/studio/{artifact_id}/reviews', status_code=201)
    def review(artifact_id: str, data: ReviewInput):
        artifact_item(artifact_id, data.item_index)
        return store.add_review(artifact_id, data.item_index, data.verdict, data.note.strip())

    @app.post('/api/studio/{artifact_id}/promote', status_code=201)
    def promote(artifact_id: str, data: PromoteInput):
        artifact, item = artifact_item(artifact_id, data.item_index)
        context = next((c for c in artifact['contexts'] if c['id'] == data.context_id and c['id'] in item['citations']), None)
        if not context or not store.source(context['source_id']):
            raise HTTPException(422, 'Choose one of this item’s cited library sources.')
        try:
            mid = store.promote_review(artifact_id, data.item_index, context['source_id'], item['text'])
            return {'finding_id': mid, 'reviews': store.reviews(artifact_id)}
        except ValueError as error:
            raise HTTPException(409, str(error)) from None

    @app.get('/api/history')
    def history(kind: str | None = None):
        return store.history(kind)

    @app.get('/api/history/{run_id}/export')
    def export(run_id: str):
        run = store.history_item(run_id)
        if not run:
            raise HTTPException(404, 'Saved run not found.')
        if store.history_item(run_id, 'artifact'):
            run = {**run, 'reviews': store.reviews(run_id)}
        return JSONResponse(run, headers={'Content-Disposition': f'attachment; filename="memory-lab-{run_id}.json"'})

    return app
