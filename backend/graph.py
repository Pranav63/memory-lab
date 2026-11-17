import asyncio
import math
import os
from datetime import datetime

import httpx

os.environ['GRAPHITI_TELEMETRY_ENABLED'] = 'false'

from graphiti_core import Graphiti
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.client import EmbedderClient, EmbedderConfig
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.groq_client import GroqClient
from graphiti_core.nodes import EpisodeType

GROUP = 'research_lab'


def cosine(a, b):
    if len(a) != len(b):
        raise ValueError('Embedding dimensions differ.')
    denominator = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
    return sum(x*y for x, y in zip(a, b)) / denominator if denominator else 0.0


class LocalEmbedder(EmbedderClient):
    config = EmbedderConfig(embedding_dim=768)

    def __init__(self, settings):
        self.settings = settings

    async def create_batch(self, input_data_list):
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(self.settings.ollama_url + '/api/embed',
                                         json={'model': self.settings.embedding_model, 'input': input_data_list})
            response.raise_for_status()
            vectors = response.json()['embeddings']
        if len(vectors) != len(input_data_list) or any(len(v) != 768 or not all(math.isfinite(x) for x in v) for v in vectors):
            raise ValueError('Local embedder returned invalid vectors.')
        return vectors

    async def create(self, input_data):
        text = input_data if isinstance(input_data, str) else ' '.join(input_data)
        return (await self.create_batch([text]))[0]


class MemoryGraph:
    def __init__(self, settings):
        self.settings = settings
        self.embedder = LocalEmbedder(settings)
        self.client = None
        self.lock = asyncio.Lock()
        self.index_lock = asyncio.Lock()

    async def get(self):
        async with self.lock:
            if self.client:
                return self.client
            key = self.settings.key('groq')
            if not key:
                raise RuntimeError('Graph extraction needs the existing Groq credential.')
            config = LLMConfig(api_key=key, model=self.settings.graph_model, temperature=0, max_tokens=2048)
            driver = FalkorDriver(host='127.0.0.1', port=self.settings.graph_port, database=GROUP)
            graph = Graphiti(graph_driver=driver, llm_client=GroqClient(config), embedder=self.embedder,
                             cross_encoder=OpenAIRerankerClient(LLMConfig(api_key=key, base_url='https://api.groq.com/openai/v1', model=self.settings.graph_model)),
                             max_coroutines=2)
            try:
                await graph.build_indices_and_constraints()
            except Exception:
                await graph.close()
                raise
            self.client = graph
            return graph

    async def index(self, memory):
        # Serial ingestion avoids racing duplicate resolution. No automatic retry of an episode.
        async with self.index_lock:
            graph = await self.get()
            result = await graph.add_episode(name='Finding ' + memory['id'], episode_body=memory['text'],
                                             source_description=memory['source_title'] + ' · finding ' + memory['id'],
                                             reference_time=datetime.fromisoformat(memory['created_at']),
                                             source=EpisodeType.text, group_id=GROUP,
                                             previous_episode_uuids=[],
                                             custom_extraction_instructions='Extract only relationships explicitly stated in this finding. Preserve qualifications. Do not invent facts.')
            return {'episode_id': result.episode.uuid, 'entities': len(result.nodes), 'relationships': len(result.edges),
                    'engine': 'graphiti-core@0.30.2', 'requested_model': self.settings.graph_model,
                    'embedding_model': self.settings.embedding_model}

    async def search(self, question, memories):
        active = {m['episode_id']: m for m in memories if m['episode_id'] and not m['retired_at']}
        if not active:
            return []
        graph = await self.get()
        edges = await graph.search(question, group_ids=[GROUP], num_results=12)
        contexts = []
        for edge in edges:
            origins = [active[ep] for ep in edge.episodes if ep in active]
            if origins and not edge.invalid_at and not edge.expired_at:
                m = origins[0]
                contexts.append({'id': 'g-' + edge.uuid, 'source_id': m['source_id'], 'title': m['source_title'],
                                 'text': edge.fact, 'url': m['url'], 'kind': 'graph', 'page': None,
                                 'memory_id': m['id'], 'valid_at': edge.valid_at.isoformat() if edge.valid_at else None})
        return contexts

    async def view(self, memories):
        graph = await self.get()
        episodes = [m['episode_id'] for m in memories if m['episode_id'] and not m['retired_at']]
        nodes, _, _ = await graph.driver.execute_query(
            'MATCH (n:Entity) WHERE n.group_id=$group RETURN n.uuid AS id, n.name AS name, n.summary AS summary LIMIT 40', group=GROUP)
        edges, _, _ = await graph.driver.execute_query(
            'MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) WHERE r.group_id=$group RETURN r.uuid AS id, a.uuid AS source, b.uuid AS target, r.fact AS fact, r.episodes AS episodes, r.invalid_at AS invalid_at, r.expired_at AS expired_at LIMIT 80', group=GROUP)
        edges = [e for e in edges if any(ep in episodes for ep in e.get('episodes', [])) and not e.get('invalid_at') and not e.get('expired_at')]
        used = {n for e in edges for n in [e['source'], e['target']]}
        return {'nodes': [n for n in nodes if n['id'] in used], 'edges': edges, 'engine': 'Graphiti · FalkorDB'}

    async def close(self):
        if self.client:
            await self.client.close()
