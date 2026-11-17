#!/usr/bin/env python3
"""MSR-synk — kjøres som root (systemd-timer) på Mint-maskinene.

Henter oppsettet fra nettsiden og
  * skriver Firefox-regler (bare godkjente nettsider) til /etc/firefox/policies/policies.json
  * oppdaterer skrivebordsbakgrunnen (låst med dconf)

Bare standardbiblioteket — ingen avhengigheter.
Testkjøring uten root:  MSR_ROOT=./testroot python3 msr-sync.py --config config.example.json
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("MSR_ROOT", "/"))
SETTINGS = ROOT / "etc/msr-launcher/settings.json"
CACHE = ROOT / "var/lib/msr-launcher/config.json"
FIREFOX_POLICIES = ROOT / "etc/firefox/policies/policies.json"
APP_DIR = Path(__file__).resolve().parent

# Fjernes fra Firefox-reglene hvis låsing slås av i oppsettet
MANAGED_MARKER = "_msr_launcher"


def log(*a):
    print("[msr-sync]", *a, flush=True)


def fetch(url: str, timeout: float = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "msr-sync/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def write_if_changed(path: Path, data: bytes, mode: int = 0o644) -> bool:
    if path.is_file() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.chmod(tmp, mode)
    tmp.replace(path)
    return True


def load_config(settings: dict, override: str | None) -> dict | None:
    if override:
        return json.loads(Path(override).read_text(encoding="utf-8"))
    url = settings.get("config_url")
    if url:
        try:
            raw = fetch(url)
            cfg = json.loads(raw.decode("utf-8"))
            write_if_changed(CACHE, raw)
            return cfg
        except Exception as e:  # noqa: BLE001
            log("fikk ikke hentet oppsett:", e)
    if CACHE.is_file():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    example = APP_DIR / "config.example.json"
    return json.loads(example.read_text(encoding="utf-8")) if example.is_file() else None


def site_pattern(url: str) -> str | None:
    """https://www.makerspaceringebu.no/makercraft/ → https://www.makerspaceringebu.no/*"""
    p = urllib.parse.urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    return f"{p.scheme}://{p.netloc}/*"


def build_firefox_policies(cfg: dict) -> dict | None:
    fx = cfg.get("firefox") or {}
    if not fx.get("lock"):
        return None

    allowed: list[str] = []

    def add(pattern):
        if pattern and pattern not in allowed:
            allowed.append(pattern)

    # Alle nettside-apper i launcheren er automatisk tillatt
    web_apps = [a for a in cfg.get("apps", []) if a.get("url")]
    for a in web_apps:
        add(site_pattern(a["url"]))
    # Pluss ekstra adresser (innlogging, hjelpesider osv.)
    for item in fx.get("allowed", []):
        add(item if "*" in item else (site_pattern(item) or item))

    homepage = fx.get("homepage") or (web_apps[0]["url"] if web_apps else "about:blank")

    bookmarks = [{"toplevel_name": fx.get("bookmarks_title", "Makerspace")}]
    bookmarks += [{"name": a.get("name", a["url"]), "url": a["url"]} for a in web_apps]

    policies = {
        "WebsiteFilter": {"Block": ["<all_urls>"], "Exceptions": allowed},
        "Homepage": {"URL": homepage, "Locked": True, "StartPage": "homepage"},
        "ManagedBookmarks": bookmarks,
        "DisplayBookmarksToolbar": "always",
        "DisableDeveloperTools": True,
        "BlockAboutConfig": True,
        "BlockAboutProfiles": True,
        "BlockAboutAddons": True,
        "DisablePrivateBrowsing": True,
        "DisableFirefoxAccounts": True,
        "DisableProfileImport": True,
        "ExtensionSettings": {"*": {"installation_mode": "blocked"}},
        "OverrideFirstRunPage": "",
        "OverridePostUpdatePage": "",
        "DontCheckDefaultBrowser": True,
        "NoDefaultBookmarks": True,
        "PasswordManagerEnabled": False,
    }
    if fx.get("search") is False:
        policies["SearchBar"] = "separate"
    return {"policies": policies, MANAGED_MARKER: True}


def sync_firefox(cfg: dict):
    wanted = build_firefox_policies(cfg)
    if wanted is None:
        # Låsing av: fjern bare reglene hvis det var vi som skrev dem
        if FIREFOX_POLICIES.is_file():
            try:
                cur = json.loads(FIREFOX_POLICIES.read_text(encoding="utf-8"))
                if cur.get(MANAGED_MARKER):
                    FIREFOX_POLICIES.unlink()
                    log("Firefox-låsing fjernet")
            except Exception:  # noqa: BLE001
                pass
        return
    data = (json.dumps(wanted, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if write_if_changed(FIREFOX_POLICIES, data):
        log("Firefox-regler oppdatert:", ", ".join(wanted["policies"]["WebsiteFilter"]["Exceptions"]))


def sync_wallpaper(cfg: dict, settings: dict):
    url = cfg.get("desktop_wallpaper")
    target = settings.get("wallpaper_path")
    if not url or not target:
        return
    try:
        if write_if_changed(ROOT / target.lstrip("/"), fetch(url, timeout=30)):
            log("skrivebordsbakgrunn oppdatert")
    except Exception as e:  # noqa: BLE001
        log("bakgrunn ikke oppdatert:", e)


def main():
    override = None
    if "--config" in sys.argv:
        override = sys.argv[sys.argv.index("--config") + 1]
    settings = json.loads(SETTINGS.read_text(encoding="utf-8")) if SETTINGS.is_file() else {}
    cfg = load_config(settings, override)
    if not cfg:
        log("ingen oppsett funnet")
        return
    sync_firefox(cfg)
    sync_wallpaper(cfg, settings)


if __name__ == "__main__":
    main()
