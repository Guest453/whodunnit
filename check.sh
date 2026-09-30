#!/usr/bin/env bash
# Syntax-check the browser files the way a browser loads them.
set -e
cd C:/Users/cesus/whodunnit
echo "== node --check =="
node --check case.js
node --check game.js
echo "case.js + game.js: syntax OK"
