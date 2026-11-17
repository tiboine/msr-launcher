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
Hver maskin har en lokal fil `/etc/msr-launcher/settings.json` som sier *hvor*
oppsettet ligger (`config_url`). Selve oppsettet (som programmer, beskjeder og
bakgrunn) er én JSON-fil på nettsiden. Endrer du den, får alle maskinene det
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
