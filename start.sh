#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
if [ ! -x .venv/bin/python ]; then
  echo 'Run ./setup.sh once to install Research Memory Lab.'
  exit 1
fi
exec .venv/bin/python scripts/dev.py
