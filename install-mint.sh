#!/usr/bin/env bash
# Installerer MSR Launcher på en Linux Mint-maskin (Cinnamon).
#
# Bruk (fra mappa med launcheren):
#   sudo ./install-mint.sh <brukernavn>          # f.eks. sudo ./install-mint.sh makerspace
#   sudo ./install-mint.sh <brukernavn> --no-lock  # uten å låse skrivebordsbakgrunnen
#
# Kan kjøres på nytt for å oppdatere — innstillingene i /etc/msr-launcher beholdes.
set -euo pipefail

USERNAME="${1:-}"
LOCK=1
[[ "${2:-}" == "--no-lock" ]] && LOCK=0

if [[ $EUID -ne 0 ]]; then echo "Kjør med sudo."; exit 1; fi
if [[ -z "$USERNAME" ]] || ! id "$USERNAME" &>/dev/null; then
  echo "Oppgi brukernavnet til makerspace-kontoen, f.eks.: sudo $0 makerspace"; exit 1
fi
USER_HOME="$(getent passwd "$USERNAME" | cut -d: -f6)"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST=/opt/msr-launcher
ETC=/etc/msr-launcher
VAR=/var/lib/msr-launcher

echo "==> Avhengigheter"
apt-get update -qq
apt-get install -y -qq python3 python3-gi gir1.2-gtk-3.0 >/dev/null
# WebKit: nyere Mint har 4.1, eldre 4.0
apt-get install -y -qq gir1.2-webkit2-4.1 >/dev/null 2>&1 || apt-get install -y -qq gir1.2-webkit2-4.0 >/dev/null

PY=/usr/bin/python3
if ! $PY -c "import webview" 2>/dev/null; then
  if ! apt-get install -y -qq python3-webview >/dev/null 2>&1; then
    echo "    python3-webview finnes ikke i apt – bruker venv + pip"
    apt-get install -y -qq python3-venv python3-pip >/dev/null
    $PY -m venv --system-site-packages "$DEST/venv"
    "$DEST/venv/bin/pip" install -q pywebview
    PY="$DEST/venv/bin/python"
  fi
fi

echo "==> Kopierer filer til $DEST"
mkdir -p "$DEST"
cp -r "$SRC/launcher.py" "$SRC/config.example.json" "$SRC/ui" "$DEST/"

cat > /usr/local/bin/msr-launcher <<EOF
#!/bin/sh
exec $PY $DEST/launcher.py "\$@"
EOF
chmod 755 /usr/local/bin/msr-launcher

echo "==> Innstillinger i $ETC/settings.json"
mkdir -p "$ETC" "$VAR"
if [[ ! -f "$ETC/settings.json" ]]; then
  read -rp "    Adresse til oppsett-fila (tom = bruk innebygd eksempel): " CFG_URL || true
  read -rp "    PIN for å avslutte launcheren (tom = av): " PIN || true
  cat > "$ETC/settings.json" <<EOF
{
  "config_url": "${CFG_URL:-}",
  "admin_pin": "${PIN:-}",
  "machine_name": "$(hostname)",
  "fullscreen": true,
  "wallpaper_path": "$VAR/wallpaper.jpg"
}
EOF
fi
chmod 644 "$ETC/settings.json"
chown "$USERNAME" "$VAR"

echo "==> Menyoppføring, skrivebordsikon og autostart"
cat > /usr/share/applications/msr-launcher.desktop <<'EOF'
[Desktop Entry]
Type=Application
Name=MSR Launcher
Comment=Startskjermen til Makerspace Ringebu
Exec=msr-launcher
Icon=applications-engineering
Categories=Utility;
EOF
install -d -o "$USERNAME" -g "$USERNAME" "$USER_HOME/.config/autostart"
cp /usr/share/applications/msr-launcher.desktop "$USER_HOME/.config/autostart/"
echo "X-GNOME-Autostart-Delay=2" >> "$USER_HOME/.config/autostart/msr-launcher.desktop"
chown "$USERNAME:$USERNAME" "$USER_HOME/.config/autostart/msr-launcher.desktop"
DESKTOP_DIR="$(sudo -u "$USERNAME" xdg-user-dir DESKTOP 2>/dev/null || echo "$USER_HOME/Desktop")"
if [[ -d "$DESKTOP_DIR" ]]; then
  install -m 755 -o "$USERNAME" -g "$USERNAME" /usr/share/applications/msr-launcher.desktop "$DESKTOP_DIR/"
  sudo -u "$USERNAME" gio set "$DESKTOP_DIR/msr-launcher.desktop" metadata::trusted true 2>/dev/null || true
fi

if [[ $LOCK -eq 1 ]]; then
  echo "==> Låser skrivebordsbakgrunnen (dconf)"
  if [[ ! -f "$VAR/wallpaper.jpg" ]]; then
    for f in /usr/share/backgrounds/linuxmint/default_background.jpg /usr/share/backgrounds/linuxmint/*.jpg; do
      [[ -f "$f" ]] && { cp "$f" "$VAR/wallpaper.jpg"; break; }
    done
    chown "$USERNAME" "$VAR/wallpaper.jpg" 2>/dev/null || true
  fi
  mkdir -p /etc/dconf/profile /etc/dconf/db/local.d/locks
  if [[ ! -f /etc/dconf/profile/user ]]; then
    printf 'user-db:user\nsystem-db:local\n' > /etc/dconf/profile/user
  elif ! grep -q 'system-db:local' /etc/dconf/profile/user; then
    echo 'system-db:local' >> /etc/dconf/profile/user
  fi
  cat > /etc/dconf/db/local.d/10-msr-launcher <<EOF
[org/cinnamon/desktop/background]
picture-uri='file://$VAR/wallpaper.jpg'
picture-options='zoom'
EOF
  cat > /etc/dconf/db/local.d/locks/10-msr-launcher <<'EOF'
/org/cinnamon/desktop/background/picture-uri
/org/cinnamon/desktop/background/picture-options
EOF
  dconf update
fi

echo
echo "Ferdig! Logg inn som $USERNAME for å se launcheren."
echo "Innstillinger: $ETC/settings.json   ·   Programfiler: $DEST"
