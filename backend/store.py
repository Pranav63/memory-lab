import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import uuid4


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def chunks(text, page=None):
    # Preserve page provenance. A small overlap keeps sentence boundaries recoverable.
    parts = []
    start = 0
    while start < len(text):
        end = min(start + 1200, len(text))
        if end < len(text):
            boundary = text.rfind(' ', start + 800, end)
            if boundary > start:
                end = boundary
        parts.append({'text': text[start:end], 'page': page})
        if end == len(text):
            break
        start = end - 120
    return parts


class Store:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY, title TEXT, kind TEXT, url TEXT, text TEXT,
                    sha256 TEXT, created_at TEXT, embedding_status TEXT);
                CREATE TABLE IF NOT EXISTS chunks (
                    id TEXT PRIMARY KEY, source_id TEXT REFERENCES sources(id),
                    text TEXT, page INTEGER, embedding TEXT);
                CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, text);
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY, source_id TEXT REFERENCES sources(id), text TEXT,
                    created_at TEXT, supersedes TEXT REFERENCES memories(id), retired_at TEXT,
                    episode_id TEXT, status TEXT, error TEXT);
                CREATE TABLE IF NOT EXISTS history (
                    id TEXT PRIMARY KEY, kind TEXT, payload TEXT, created_at TEXT);
                CREATE TABLE IF NOT EXISTS source_origins (
                    source_id TEXT PRIMARY KEY REFERENCES sources(id), payload TEXT);
                CREATE TABLE IF NOT EXISTS reviews (
                    id TEXT PRIMARY KEY, artifact_id TEXT REFERENCES history(id), item_index INTEGER,
                    verdict TEXT, note TEXT, created_at TEXT, finding_id TEXT REFERENCES memories(id));
                UPDATE memories SET status='failed', error='Indexing was interrupted. Retry explicitly.' WHERE status='indexing';
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def sources(self):
        with self.connect() as db:
            return [self.source_row(r) for r in db.execute('SELECT s.*, o.payload AS origin FROM sources s LEFT JOIN source_origins o ON o.source_id=s.id ORDER BY s.created_at DESC')]

    def source(self, source_id):
        with self.connect() as db:
            row = db.execute('SELECT s.*, o.payload AS origin FROM sources s LEFT JOIN source_origins o ON o.source_id=s.id WHERE s.id=?', (source_id,)).fetchone()
            return self.source_row(row) if row else None

    @staticmethod
    def source_row(row):
        result = dict(row)
        result['origin'] = json.loads(result['origin']) if result.get('origin') else None
        return result

    def import_web_source(self, title, url, text, origin):
        existing = next((s for s in self.sources() if s['url'] == url and s['sha256'] == digest(text)), None)
        if existing:
            return existing
        source = self.add_source(title, 'web', url, text)
        with self.connect() as db:
            db.execute('INSERT INTO source_origins VALUES (?,?)', (source['id'], json.dumps(origin)))
        return self.source(source['id'])

    def add_source(self, title, kind, url, text, pieces=None):
        source_id, timestamp = uuid4().hex[:12], now()
        pieces = pieces or chunks(text)
        with self.connect() as db:
            db.execute('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?)',
                       (source_id, title, kind, url, text, digest(text), timestamp, 'pending'))
            for piece in pieces:
                cid = uuid4().hex[:12]
                db.execute('INSERT INTO chunks VALUES (?,?,?,?,NULL)',
                           (cid, source_id, piece['text'], piece.get('page')))
                db.execute('INSERT INTO search VALUES (?,?)', (cid, title + '\n' + piece['text']))
        return self.source(source_id)

    def set_embeddings(self, source_id, vectors):
        with self.connect() as db:
            rows = db.execute('SELECT id FROM chunks WHERE source_id=? ORDER BY rowid', (source_id,)).fetchall()
            if len(rows) != len(vectors):
                raise ValueError('Embedding count does not match source chunks.')
            for row, vector in zip(rows, vectors):
                db.execute('UPDATE chunks SET embedding=? WHERE id=?', (json.dumps(vector), row['id']))
            db.execute("UPDATE sources SET embedding_status='ready' WHERE id=?", (source_id,))

    def pieces(self, source_id=None):
        with self.connect() as db:
            query = 'SELECT c.*, s.title, s.url, s.kind FROM chunks c JOIN sources s ON c.source_id=s.id'
            params = ()
            if source_id:
                query += ' WHERE c.source_id=?'
                params = (source_id,)
            return [dict(r) for r in db.execute(query + ' ORDER BY c.rowid', params)]

    def keyword(self, question, limit=12):
        stop = {'the', 'a', 'an', 'of', 'to', 'is', 'are', 'in', 'and', 'for', 'what', 'how', 'does', 'we', 'our', 'my', 'with', 'did', 'why'}
        terms = [w for w in re.findall(r'\w+', question.lower()) if w not in stop and len(w) > 1][:20]
        if not terms:
            return []
        match = ' OR '.join('"' + word + '"' for word in terms)
        with self.connect() as db:
            return [r['id'] for r in db.execute('SELECT id FROM search WHERE search MATCH ? ORDER BY rank LIMIT ?', (match, limit))]

    def memories(self, active=False):
        with self.connect() as db:
            where = ' WHERE m.retired_at IS NULL' if active else ''
            return [dict(r) for r in db.execute('SELECT m.*, s.title AS source_title, s.url FROM memories m JOIN sources s ON m.source_id=s.id' + where + ' ORDER BY m.created_at DESC')]

    def add_memory(self, source_id, text, supersedes=None):
        mid, timestamp = uuid4().hex[:12], now()
        with self.connect() as db:
            if supersedes:
                row = db.execute('SELECT * FROM memories WHERE id=? AND retired_at IS NULL', (supersedes,)).fetchone()
                if not row or row['source_id'] != source_id:
                    raise ValueError('The previous finding is not active or belongs to another source.')
                db.execute('UPDATE memories SET retired_at=? WHERE id=?', (timestamp, supersedes))
            db.execute('INSERT INTO memories VALUES (?,?,?,?,?,?,NULL,?,NULL)',
                       (mid, source_id, text, timestamp, supersedes, None, 'saved'))
        return next(m for m in self.memories() if m['id'] == mid)

    def graph_status(self, mid, status, episode=None, error=None):
        with self.connect() as db:
            db.execute('UPDATE memories SET status=?, episode_id=?, error=? WHERE id=?', (status, episode, error, mid))

    def snapshot(self):
        with self.connect() as db:
            corpus = [list(r) for r in db.execute('SELECT id, sha256 FROM sources ORDER BY id')]
            memory = [list(r) for r in db.execute('SELECT id, text, episode_id, status FROM memories WHERE retired_at IS NULL ORDER BY id')]
        return {'corpus_sha256': digest(json.dumps(corpus)), 'memory_sha256': digest(json.dumps(memory))}

    def save_history(self, kind, payload):
        hid = uuid4().hex[:12]
        payload = {**payload, 'id': hid, 'created_at': now()}
        with self.connect() as db:
            db.execute('INSERT INTO history VALUES (?,?,?,?)', (hid, kind, json.dumps(payload), payload['created_at']))
        return payload

    def history(self, kind=None):
        with self.connect() as db:
            query = 'SELECT payload FROM history' + (' WHERE kind=?' if kind else '') + ' ORDER BY created_at DESC LIMIT 40'
            return [json.loads(r['payload']) for r in db.execute(query, (kind,) if kind else ())]

    def history_item(self, run_id, kind=None):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM history WHERE id=?' + (' AND kind=?' if kind else ''), (run_id, kind) if kind else (run_id,)).fetchone()
            return json.loads(row['payload']) if row else None

    def reviews(self, artifact_id):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT * FROM reviews WHERE artifact_id=? ORDER BY created_at DESC', (artifact_id,))]

    def add_review(self, artifact_id, item_index, verdict, note):
        rid = uuid4().hex[:12]
        with self.connect() as db:
            db.execute('INSERT INTO reviews VALUES (?,?,?,?,?,?,NULL)', (rid, artifact_id, item_index, verdict, note, now()))
        return self.reviews(artifact_id)

    def promote_review(self, artifact_id, item_index, source_id, text):
        with self.connect() as db:
            review = db.execute('SELECT * FROM reviews WHERE artifact_id=? AND item_index=? ORDER BY created_at DESC LIMIT 1', (artifact_id, item_index)).fetchone()
            if not review or review['verdict'] != 'supported':
                raise ValueError('Mark the item as supported after reviewing its evidence first.')
            previous = db.execute('SELECT finding_id FROM reviews WHERE artifact_id=? AND item_index=? AND finding_id IS NOT NULL', (artifact_id, item_index)).fetchone()
            if previous:
                return previous['finding_id']
            mid = uuid4().hex[:12]
            db.execute('INSERT INTO memories VALUES (?,?,?,?,NULL,NULL,NULL,?,NULL)', (mid, source_id, text, now(), 'saved'))
            db.execute('UPDATE reviews SET finding_id=? WHERE id=?', (mid, review['id']))
        return mid
