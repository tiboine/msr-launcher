#!/usr/bin/env bash
# Lager mappa som kopieres til minnepinnen:  bash lag-minnepinne.sh [målmappe]
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$SRC/../MSR-Launcher-minnepinne}"
mkdir -p "$OUT/filer"
cp -r "$SRC/minnepinne/." "$OUT/"
cp -r "$SRC/launcher.py" "$SRC/msr-sync.py" "$SRC/install-mint.sh" "$SRC/config.example.json" "$SRC/ui" "$OUT/filer/"
echo "Ferdig: $OUT"
