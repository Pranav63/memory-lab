import os
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


class Settings:
    def __init__(self):
        self.values = {**dotenv_values(ROOT / '.env'), **os.environ}
        self.db_path = Path(self.values.get('LAB_DB', str(ROOT / 'artifacts/lab.sqlite3')))
        self.ollama_url = self.values.get('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
        self.embedding_model = 'nomic-embed-text:v1.5'
        self.local_model = self.values.get('LOCAL_MODEL', 'glm4-en:latest')
        self.openai_model = self.values.get('OPENAI_MODEL', 'gpt-5.2-2025-12-11')
        self.openai_url = self.values.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
        self.graph_port = int(self.values.get('GRAPH_PORT', '6390'))
        self.graph_model = self.values.get('GRAPH_MODEL', 'openai/gpt-oss-120b')

    def key(self, provider):
        prefix = provider.upper()
        if self.values.get(f'{prefix}_API_KEY'):
            return self.values[f'{prefix}_API_KEY']
        path = self.values.get(f'{prefix}_ENV_FILE', '')
        name = self.values.get(f'{prefix}_KEY_NAME', f'{prefix}_API_KEY')
        return (dotenv_values(path).get(name) or '') if path and Path(path).is_file() else ''
