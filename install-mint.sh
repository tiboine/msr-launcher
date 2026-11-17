#!/usr/bin/env bash
# Installerer MSR Launcher på en Linux Mint-maskin (Cinnamon).
#
# Bruk (fra mappa med launcheren):
#   sudo bash install-mint.sh                    # spør etter brukeren
#   sudo bash install-mint.sh <brukernavn>       # f.eks. makerspace
#   sudo ./install-mint.sh <brukernavn> --no-lock  # uten å låse skrivebordsbakgrunnen
#
# Kan kjøres på nytt for å oppdatere — innstillingene i /etc/msr-launcher beholdes.
set -euo pipefail

USERNAME="${1:-}"
LOCK=1
[[ "${2:-}" == "--no-lock" ]] && LOCK=0

if [[ $EUID -ne 0 ]]; then echo "Kjør med sudo, f.eks.:  sudo bash $0"; exit 1; fi

# Uten brukernavn: vis brukerne på maskinen og spør
if [[ -z "$USERNAME" ]]; then
  mapfile -t USERS < <(getent passwd | awk -F: '$3 >= 1000 && $3 < 60000 && $6 ~ /^\/home\// {print $1}')
  echo
  echo "Hvilken konto er makerspace-kontoen (den launcheren skal starte på)?"
  for i in "${!USERS[@]}"; do echo "  $((i + 1))) ${USERS[$i]}"; done
  read -rp "Skriv nummer eller brukernavn: " CHOICE < /dev/tty
  if [[ "$CHOICE" =~ ^[0-9]+$ ]] && (( CHOICE >= 1 && CHOICE <= ${#USERS[@]} )); then
    USERNAME="${USERS[$((CHOICE - 1))]}"
  else
    USERNAME="$CHOICE"
  fi
fi
if [[ -z "$USERNAME" ]] || ! id "$USERNAME" &>/dev/null; then
  echo "Fant ikke brukeren «$USERNAME». Prøv igjen."; exit 1
fi
echo "==> Installerer for brukeren: $USERNAME"
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
cp -r "$SRC/launcher.py" "$SRC/msr-sync.py" "$SRC/config.example.json" "$SRC/ui" "$DEST/"

cat > /usr/local/bin/msr-launcher <<EOF
#!/bin/sh
exec $PY $DEST/launcher.py "\$@"
EOF
chmod 755 /usr/local/bin/msr-launcher

echo "==> Innstillinger i $ETC/settings.json"
mkdir -p "$ETC" "$VAR"
if [[ ! -f "$ETC/settings.json" ]]; then
  DEFAULT_URL="https://www.makerspaceringebu.no/wp-json/msr-launcher/v1/config"
  read -rp "    Adresse til oppsettet [$DEFAULT_URL]: " CFG_URL < /dev/tty || true
  CFG_URL="${CFG_URL:-$DEFAULT_URL}"
  read -rp "    PIN for vedlikehold (tom = av): " PIN < /dev/tty || true
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

echo "==> Synk-tjeneste (Firefox-regler + bakgrunn, hvert 15. min)"
cat > /etc/systemd/system/msr-sync.service <<EOF
[Unit]
Description=MSR: hent oppsett fra nettsiden (Firefox-regler, bakgrunn)
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 $DEST/msr-sync.py
EOF
cat > /etc/systemd/system/msr-sync.timer <<'EOF'
[Unit]
Description=MSR: hent oppsett jevnlig

[Timer]
OnBootSec=20s
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now msr-sync.timer >/dev/null
systemctl start msr-sync.service || echo "    (synk feilet – sjekk: journalctl -u msr-sync)"

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
echo "Firefox-regler: /etc/firefox/policies/policies.json (gjelder ALLE brukere; slås av med \"lock\": false i oppsettet)"
