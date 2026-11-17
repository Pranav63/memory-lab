import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHILDREN = []


def check(url, app):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return json.load(response).get('app') == app
    except (OSError, ValueError):
        return False


def occupied(port):
    with socket.socket() as sock:
        return sock.connect_ex(('127.0.0.1', port)) == 0


def cleanup():
    for child in CHILDREN:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
    for child in CHILDREN:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)


def stop(*_):
    cleanup()
    raise SystemExit(0)


os.chdir(ROOT)
if check('http://127.0.0.1:8020/api/health', 'research-memory-lab') and check('http://127.0.0.1:5180/api/health', 'research-memory-lab'):
    print('Research Memory Lab is already running: http://127.0.0.1:5180')
    raise SystemExit(0)
for port in [8020, 5180]:
    if occupied(port):
        raise SystemExit(f'Port {port} is occupied. Stop the existing service before starting this workspace.')
if not (ROOT / 'frontend/node_modules').exists():
    raise SystemExit('Run ./setup.sh once to install the project dependencies.')
subprocess.run(['docker', 'compose', 'up', '-d', '--wait'], check=True)
for sig in [signal.SIGINT, signal.SIGTERM]:
    signal.signal(sig, stop)
try:
    CHILDREN.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:create_app', '--factory', '--host', '127.0.0.1', '--port', '8020'], start_new_session=True))
    CHILDREN.append(subprocess.Popen(['npm', 'run', 'dev'], cwd=ROOT / 'frontend', start_new_session=True))
    for _ in range(120):
        if any(c.poll() is not None for c in CHILDREN):
            raise RuntimeError('A service exited during startup. Read its error above.')
        if check('http://127.0.0.1:8020/api/health', 'research-memory-lab') and check('http://127.0.0.1:5180/api/health', 'research-memory-lab'):
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Startup timed out.')
    print('\nResearch Memory Lab: http://127.0.0.1:5180\nBackend: http://127.0.0.1:8020\nCtrl+C stops frontend and backend. The graph volume stays saved.\n', flush=True)
    while all(c.poll() is None for c in CHILDREN):
        time.sleep(.5)
    raise SystemExit('A Research Memory Lab service exited. Read its error above.')
finally:
    cleanup()
