import re
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from fastapi.responses import FileResponse


def arxiv_pdf(url):
    parsed = urlsplit(url or '')
    if parsed.scheme == 'https' and parsed.netloc in ('arxiv.org', 'www.arxiv.org'):
        match = re.fullmatch(r'/(?:abs|pdf)/(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?/?', parsed.path)
        if match:
            return 'https://arxiv.org/pdf/' + match[1]
    return None


class PaperReader:
    def __init__(self, directory):
        self.directory = directory / 'papers'

    def path(self, source):
        return self.directory / (source['id'] + '.pdf')

    def available(self, source):
        return self.path(source).is_file() or bool(arxiv_pdf(source['url']))

    def save(self, source, content):
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path(source).write_bytes(content)

    async def original(self, source):
        path = self.path(source)
        if not path.exists():
            url = arxiv_pdf(source['url'])
            if not url:
                raise HTTPException(404, 'Original PDF unavailable. Upload the full paper to read it here.')
            try:
                # Fetch only the canonical arXiv host, without following arbitrary redirects.
                async with httpx.AsyncClient(timeout=45) as client:
                    async with client.stream('GET', url) as response:
                        response.raise_for_status()
                        content = bytearray()
                        async for piece in response.aiter_bytes():
                            content.extend(piece)
                            if len(content) > 20_000_000:
                                raise HTTPException(413, 'This PDF exceeds the 20 MB reader limit.')
                if not content.startswith(b'%PDF-'):
                    raise ValueError('Not a PDF')
            except (httpx.HTTPError, ValueError):
                raise HTTPException(502, 'The original paper could not be loaded from arXiv. You can upload its PDF instead.') from None
            self.save(source, content)
        return FileResponse(path, media_type='application/pdf', headers={'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff'})
