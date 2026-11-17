#!/usr/bin/env python3
"""MSR Launcher — startskjerm for maskinene på Makerspace Ringebu.

Kjører som fullskjerm-vindu (pywebview). Oppsettet (programliste, beskjeder,
bakgrunn, åpningstider) hentes fra nettsiden, med lokal kopi som reserve.

Kjør på nytt mens den allerede går → eksisterende vindu vises igjen
(brukes av «MSR Launcher»-ikonet i panelet/startmenyen).
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
UI_DIR = APP_DIR / "ui"
IS_WIN = platform.system() == "Windows"
OS_KEY = "windows" if IS_WIN else "linux"

# Fast port på localhost brukes som «bare én launcher om gangen»-lås.
SINGLE_INSTANCE_PORT = 47613

if IS_WIN:
    CACHE_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "msr-launcher"
    SETTINGS_PATHS = [Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "msr-launcher" / "settings.json"]
else:
    CACHE_DIR = Path.home() / ".cache" / "msr-launcher"
    SETTINGS_PATHS = [Path("/etc/msr-launcher/settings.json")]
SETTINGS_PATHS.append(APP_DIR / "settings.json")  # for utvikling/testing

DEFAULT_SETTINGS = {
    "config_url": "",          # f.eks. https://www.makerspaceringebu.no/wp-content/uploads/msr-launcher/config.json
    "machine_name": socket.gethostname(),
    "admin_pin": "",           # tom = avslutt-knappen er av
    "fullscreen": True,
    "wallpaper_path": "",      # Linux: hvor bakgrunnsbildet skal lagres (dconf peker hit)
}


def log(*args):
    print("[msr-launcher]", *args, flush=True)


def load_settings() -> dict:
    s = dict(DEFAULT_SETTINGS)
    for p in SETTINGS_PATHS:
        if p.is_file():
            try:
                s.update(json.loads(p.read_text(encoding="utf-8")))
                log("innstillinger fra", p)
                break
            except Exception as e:  # noqa: BLE001
                log("klarte ikke lese", p, e)
    return s


def fetch_url(url: str, timeout: float = 6) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "msr-launcher/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_config(settings: dict) -> tuple[dict, str]:
    """Returnerer (config, kilde). Prøver nett → lokal kopi → medfølgende eksempel."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / "config.json"
    url = settings.get("config_url")
    if url:
        try:
            raw = fetch_url(url)
            cfg = json.loads(raw.decode("utf-8"))
            cache.write_bytes(raw)
            return cfg, "nett"
        except Exception as e:  # noqa: BLE001
            log("fikk ikke hentet config fra nett:", e)
    if cache.is_file():
        try:
            return json.loads(cache.read_text(encoding="utf-8")), "lokal kopi"
        except Exception as e:  # noqa: BLE001
            log("ødelagt lokal kopi:", e)
    return json.loads((APP_DIR / "config.example.json").read_text(encoding="utf-8")), "innebygd"


def find_program(cmd: list[str]) -> bool:
    exe = cmd[0]
    return bool(shutil.which(exe)) or Path(os.path.expandvars(exe)).is_file()


def prepare_apps(cfg: dict) -> list[dict]:
    """Plukker ut riktig kommando for dette OS-et og merker apper som mangler."""
    out = []
    for app in cfg.get("apps", []):
        if app.get("hidden"):
            continue
        a = {k: app.get(k) for k in ("id", "name", "description", "icon", "color", "category")}
        if app.get("url"):
            a["kind"] = "url"
            a["available"] = True
        else:
            cmd = (app.get("cmd") or {}).get(OS_KEY)
            if not cmd:
                continue  # finnes ikke på dette OS-et → vis ikke
            if isinstance(cmd, str):
                cmd = [cmd]
            a["kind"] = "cmd"
            a["available"] = find_program([os.path.expandvars(cmd[0])])
        out.append(a)
    return out


# Skrivebordsbakgrunn og Firefox-regler håndteres av msr-sync.py (kjører som root).


class Api:
    """Funksjoner som grensesnittet (JS) kan kalle via window.pywebview.api."""

    def __init__(self, settings: dict):
        self.settings = settings
        self.window = None
        self.cfg, self.source = load_config(settings)
        self.apps_raw = {a.get("id"): a for a in self.cfg.get("apps", [])}

    # ---- data til grensesnittet ----
    def get_state(self):
        c = self.cfg
        return {
            "title": c.get("title", "Makerspace Ringebu"),
            "subtitle": c.get("subtitle", ""),
            "background": c.get("background", ""),
            "messages": c.get("messages", []),
            "hours": c.get("hours", []),
            "categories": c.get("categories", []),
            "apps": prepare_apps(c),
            "machine": self.settings.get("machine_name"),
            "os": OS_KEY,
            "source": self.source,
            "admin_enabled": bool(self.settings.get("admin_pin")),
        }

    def reload(self):
        self.cfg, self.source = load_config(self.settings)
        self.apps_raw = {a.get("id"): a for a in self.cfg.get("apps", [])}
        return self.get_state()

    # ---- handlinger ----
    def launch(self, app_id: str):
        app = self.apps_raw.get(app_id)
        if not app:
            return {"ok": False, "error": "Ukjent program"}
        try:
            if app.get("url"):
                webbrowser.open(app["url"])
            else:
                cmd = (app.get("cmd") or {}).get(OS_KEY)
                if isinstance(cmd, str):
                    cmd = [cmd]
                cmd = [os.path.expandvars(x) for x in cmd]
                kw = {"cwd": str(Path.home())}
                if IS_WIN:
                    kw["creationflags"] = 0x00000008  # DETACHED_PROCESS
                else:
                    kw["start_new_session"] = True
                subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
        except Exception as e:  # noqa: BLE001
            log("kunne ikke starte", app_id, e)
            return {"ok": False, "error": "Klarte ikke å starte programmet"}
        # Gi programmet et øyeblikk før launcheren går bort.
        threading.Timer(0.6, self.hide).start()
        return {"ok": True}

    def hide(self):
        if self.window:
            if IS_WIN:
                self.window.minimize()
            else:
                self.window.hide()

    def show(self):
        if self.window:
            self.window.show()
            self.window.restore()
            self.window.evaluate_js("window.msrOnShow && window.msrOnShow()")

    def check_pin(self, pin: str):
        real = str(self.settings.get("admin_pin") or "")
        ok = bool(real) and hashlib.sha256(pin.encode()).digest() == hashlib.sha256(real.encode()).digest()
        return {"ok": ok}

    def quit(self, pin: str):
        if not self.check_pin(pin)["ok"]:
            return {"ok": False}
        threading.Timer(0.2, lambda: os._exit(0)).start()
        return {"ok": True}


# ---------- bare én launcher om gangen ----------

def try_signal_existing() -> bool:
    """Hvis en launcher allerede kjører: be den vise seg og returner True."""
    try:
        with socket.create_connection(("127.0.0.1", SINGLE_INSTANCE_PORT), timeout=0.5) as s:
            s.sendall(b"show\n")
        return True
    except OSError:
        return False


def listen_for_show(api: Api):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
    srv.listen(2)

    def loop():
        while True:
            conn, _ = srv.accept()
            with conn:
                if conn.recv(16).strip() == b"show":
                    api.show()

    threading.Thread(target=loop, daemon=True).start()


def main():
    if try_signal_existing():
        log("launcher kjører allerede – viser den")
        return

    try:
        import webview  # pywebview
    except ImportError:
        print("Mangler pywebview. Installer med:  pip install pywebview", file=sys.stderr)
        sys.exit(1)

    settings = load_settings()
    if "--windowed" in sys.argv:
        settings["fullscreen"] = False

    api = Api(settings)
    listen_for_show(api)

    window = webview.create_window(
        "MSR Launcher",
        url=str(UI_DIR / "index.html"),
        js_api=api,
        fullscreen=bool(settings.get("fullscreen")),
        width=1280,
        height=800,
        background_color="#05070d",
    )
    api.window = window

    # Hent oppsett på nytt hvert 10. minutt (nye beskjeder osv.)
    def refresher():
        while True:
            time.sleep(600)
            try:
                api.reload()
                window.evaluate_js("window.msrRefresh && window.msrRefresh()")
            except Exception as e:  # noqa: BLE001
                log("oppfrisking feilet:", e)

    threading.Thread(target=refresher, daemon=True).start()
    webview.start(debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
