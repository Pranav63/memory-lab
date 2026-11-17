import json
import math
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException

URL = 'https://artificialanalysis.ai/api/v2/language/models/free'


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None


def model(row):
    evaluations, pricing, performance = (row.get(key) or {} for key in ['evaluations', 'pricing', 'performance'])
    return {'id': row['id'], 'name': row['name'], 'slug': row['slug'],
            'creator': (row.get('model_creator') or {}).get('name', 'Unknown'),
            'intelligence': number(evaluations.get('artificial_analysis_intelligence_index')),
            'coding': number(evaluations.get('artificial_analysis_coding_index')),
            'agentic': number(evaluations.get('artificial_analysis_agentic_index')),
            'input_price': number(pricing.get('price_1m_input_tokens')),
            'output_price': number(pricing.get('price_1m_output_tokens')),
            'speed': number(performance.get('median_output_tokens_per_second')),
            'first_token': number(performance.get('median_time_to_first_token_seconds'))}


class Catalog:
    def __init__(self, settings):
        self.settings = settings
        self.path = settings.db_path.parent / 'artificial-analysis.json'

    def view(self):
        saved = json.loads(self.path.read_text()) if self.path.exists() else {'models': [], 'updated_at': None, 'index_version': None}
        return {**saved, 'configured': bool(self.settings.key('artificial_analysis')), 'source': 'Artificial Analysis'}

    async def refresh(self):
        key = self.settings.key('artificial_analysis')
        if not key:
            raise HTTPException(503, 'Add ARTIFICIAL_ANALYSIS_API_KEY to the backend .env, then restart the lab.')
        rows = []
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                for page in range(1, 11):
                    response = await client.get(URL, params={'page': page}, headers={'x-api-key': key})
                    response.raise_for_status()
                    data = response.json()
                    rows.extend(model(row) for row in data['data'])
                    if not data['pagination']['has_more']:
                        break
                else:
                    raise ValueError('Unexpected catalog size')
            saved = {'models': rows, 'updated_at': datetime.now(timezone.utc).isoformat(),
                     'index_version': data['intelligence_index_version']}
        except httpx.HTTPStatusError as error:
            code = error.response.status_code
            detail = 'Artificial Analysis rejected the key.' if code in (401, 403) else 'Artificial Analysis rate limit reached. Try again later.' if code == 429 else 'Artificial Analysis is unavailable. Your previous snapshot is unchanged.'
            raise HTTPException(502, detail) from None
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(502, 'Could not read the Artificial Analysis catalog. Your previous snapshot is unchanged.') from None
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(saved, allow_nan=False))
        temporary.replace(self.path)
        return self.view()
