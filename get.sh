#!/usr/bin/env bash
# Laster ned siste versjon av MSR Launcher og installerer den.
# Bruk:  wget -qO- https://raw.githubusercontent.com/tiboine/msr-launcher/main/get.sh | sudo bash -s -- <brukernavn>
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo "Kjør med sudo."; exit 1; fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "==> Laster ned MSR Launcher"
wget -qO "$TMP/msr.tar.gz" https://github.com/tiboine/msr-launcher/archive/refs/heads/main.tar.gz
tar -xzf "$TMP/msr.tar.gz" -C "$TMP"
bash "$TMP/msr-launcher-main/install-mint.sh" "$@"
