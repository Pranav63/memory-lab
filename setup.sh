#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python -m pip install -e '.[dev]'
npm install --prefix frontend
ollama pull nomic-embed-text:v1.5
docker compose up -d --wait
echo 'Installed. Run ./start.sh to open the frontend and backend.'
