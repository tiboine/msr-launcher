#!/usr/bin/env bash
# MSR Launcher — installer fra minnepinne.
# Start:  høyreklikk i minnepinne-mappa → «Åpne i terminal» →  sudo bash INSTALLER.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [[ $EUID -ne 0 ]]; then
  echo "Trenger administrator-tilgang – skriv inn passordet ditt (det vises ikke mens du skriver):"
  exec sudo bash "$HERE/INSTALLER.sh" "$@"
fi
bash "$HERE/filer/install-mint.sh" "$@"
status=$?
echo
if [[ $status -eq 0 ]]; then
  echo "✔ Ferdig. Logg ut og inn igjen som makerspace-brukeren for å se startskjermen."
else
  echo "✘ Noe gikk galt (feilkode $status). Ta bilde av teksten over og send den videre."
fi
read -rp "Trykk Enter for å lukke …" _ < /dev/tty || true
