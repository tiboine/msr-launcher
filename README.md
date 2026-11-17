# MSR Launcher

Startskjerm for maskinene på Makerspace Ringebu. Den starter i fullskjerm når
makerspace-brukeren logger inn, og viser store fliser for godkjente programmer
og nettsider. Knappen **«Vis skrivebord»** skjuler den; ikonet **MSR Launcher**
(skrivebord/startmeny) henter den fram igjen.

## Filer
| Fil | Hva |
|---|---|
| `launcher.py` | Programmet (Python + pywebview) |
| `ui/` | Grensesnittet (HTML/CSS/JS, farger fra msr-neon-temaet) |
| `config.example.json` | Eksempel på oppsett: programmer, beskjeder, åpningstider |
| `install-mint.sh` | Installerer på en Linux Mint-maskin |

## Oppsettet styres fra nettsiden
Flisene, beskjedene, åpningstidene, bakgrunnen og Firefox-låsingen redigeres i
**WP-admin → Launcher** på makerspaceringebu.no (plugin «Makerspace Launcher»,
egen mappe `plugins/msr-launcher/` i Makerspace-prosjektet). Maskinene henter
oppsettet fra `https://www.makerspaceringebu.no/wp-json/msr-launcher/v1/config`.

Hver maskin har en lokal fil `/etc/msr-launcher/settings.json` som sier *hvor*
oppsettet ligger (`config_url`). Formatet er beskrevet under, for den som vil
se hva som sendes. Endrer du den, får alle maskinene det
nye oppsettet ved neste oppstart (eller innen 10 min). Uten nett brukes siste
lagrede kopi.

### Legge til et program
```json
{
  "id": "bambu",
  "name": "Bambu Studio",
  "description": "Gjør klar fila for 3D-printeren",
  "category": "3d",
  "icon": "🖨️",
  "color": "#00d9e9",
  "cmd": {
    "linux": ["flatpak", "run", "com.bambulab.BambuStudio"],
    "windows": ["%ProgramFiles%\\Bambu Studio\\bambu-studio.exe"]
  }
}
```
- `cmd.linux` / `cmd.windows`: kommandoen som starter programmet. Mangler den
  for et OS, vises ikke flisa der. Finnes ikke programmet på maskinen, vises
  flisa gråtonet («Ikke installert»).
- Nettside i stedet for program: bruk `"url": "https://…"` i stedet for `cmd`.
- `icon`: emoji eller adresse til et bilde (png/svg).

### Låse Firefox til bestemte nettsider
I oppsettet:
```json
"firefox": {
  "lock": true,
  "homepage": "https://www.makerspaceringebu.no/",
  "allowed": ["https://makerworld.com/*", "https://*.bambulab.com/*"]
}
```
- Alle nettside-fliser (`"url"`) i launcheren blir **automatisk tillatt**, og
  dukker opp i bokmerkelinja under «Makerspace».
- `allowed`: ekstra adresser som må virke (f.eks. innlogging som går via et annet
  nettsted). `*.` foran domenet tar med alle underdomener.
- Alt annet blokkeres. Utviklerverktøy, privat vindu, `about:config` og
  utvidelser er også sperret.
- `"lock": false` fjerner låsingen igjen.

`msr-sync.py` kjører som root hvert 15. min (systemd: `msr-sync.timer`), henter
oppsettet og skriver `/etc/firefox/policies/policies.json`. Reglene gjelder
**alle brukere på maskinen**, også admin. Kjør synken med en gang:
`sudo systemctl start msr-sync`, se loggen: `journalctl -u msr-sync`.

Hvis en nettside ikke laster riktig (f.eks. innlogging som går via et annet
domene), se hvilket domene Firefox blokkerer og legg det til i `allowed`.

## Installere på Mint
Kopier mappa til maskinen (minnepinne eller `git clone`), og kjør:
```bash
sudo ./install-mint.sh <brukernavn-til-makerspace-kontoen>
```
Skriptet spør etter adressen til oppsett-fila og en PIN for vedlikehold.
Kjør det på nytt for å oppdatere. Merk: låsingen av skrivebordsbakgrunnen
gjelder alle brukere på maskinen (bruk `--no-lock` for å la være).

**Vedlikehold:** hold inne logoen i 3 sekunder → PIN → hent oppsett på nytt eller avslutt.

## Teste lokalt
```bash
pip install pywebview
python launcher.py --windowed
```
Bare grensesnittet i en nettleser: `python -m http.server` i denne mappa og
åpne `/ui/index.html` (bruker eksempel-oppsettet, PIN `1234`).
