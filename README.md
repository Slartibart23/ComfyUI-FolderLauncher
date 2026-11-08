# ComfyUI – Folder Launcher

![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![ComfyUI](https://img.shields.io/badge/ComfyUI-custom%20node-purple)
![Windows](https://img.shields.io/badge/platform-Windows-0078D6)

Ein ComfyUI Custom Node, der **beliebig viele eigene Ordner per Knopfdruck im Windows Explorer öffnet** – direkt aus dem Workflow heraus. Sobald eine Zeile ausgefüllt ist, erscheint darunter automatisch eine neue leere Zeile.

---

## Inhalt

- [Features](#features)
- [Installation](#installation)
- [Benutzung](#benutzung)
- [Wie es funktioniert](#wie-es-funktioniert)
- [Troubleshooting](#troubleshooting)
- [Lizenz](#lizenz)

---

## Features

- 📂 **Ordner per Knopfdruck öffnen**: **Öffnen** startet den Windows Explorer im eingetragenen Ordner (oder **Enter** im Pfadfeld)
- ➕ **Wächst automatisch**: Ist der letzte Pfad ausgefüllt, kommt darunter eine neue leere Zeile
- 📁 **Ordner auswählen**: Der Button öffnet den normalen Windows-Ordnerdialog; alternativ kannst du den Pfad eintippen oder einfügen
- 🏷️ **Optionaler Name** pro Zeile, z. B. „Outputs“ oder „LoRAs“
- ↕️ **Umsortieren per Drag & Drop** am Griff `⠿`
- ✕ **Zeilen entfernen** über den ✕-Button
- 🔴 **Nicht vorhandene Ordner werden rot markiert**; es wird nie etwas angelegt
- 💾 **Wird im Workflow gespeichert**: Jede Folder-Launcher-Node hat ihre eigene Liste
- 🧹 Anführungszeichen von Windows **„Als Pfad kopieren“** werden automatisch entfernt
- ⚡ **Kein Einfluss auf die Generierung**: Die Node ist eine reine Frontend-Node (wie „Note“) und wird beim Ausführen ignoriert
- 📦 **Keine zusätzlichen Abhängigkeiten**: Auch `tkinter` wird nicht benötigt (fehlt in der Portable-Version)

---

## Installation

### Variante A – Git

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Slartibart23/ComfyUI-FolderLauncher.git
```

### Variante B – ZIP

1. Repository als ZIP herunterladen
2. Nach `ComfyUI/custom_nodes/ComfyUI-FolderLauncher` entpacken

Danach **ComfyUI neu starten** und den Browser neu laden.

---

## Benutzung

1. Doppelklick auf die Arbeitsfläche → **Folder Launcher** suchen (Kategorie `utils`)
2. In der ersten Zeile einen Pfad eintippen, einfügen oder über **📁** auswählen
3. Optional links einen Namen vergeben
4. **Öffnen** klicken: Der Explorer öffnet den Ordner

| Element | Funktion |
|---|---|
| `⠿` | Zeile ziehen, um die Reihenfolge zu ändern |
| Name | Optionale Beschriftung |
| Pfad | Ordnerpfad; rot = Ordner existiert nicht |
| 📁 | Windows-Ordnerauswahl öffnen |
| Öffnen | Ordner im Explorer öffnen (auch per Enter) |
| ✕ | Zeile entfernen |

---

## Wie es funktioniert

- **Frontend** (`js/folder_launcher.js`): Die Node mit den dynamischen Zeilen. Die Liste liegt in `node.properties.folders` und wird so mit dem Workflow gespeichert.
- **Backend** (`folder_launcher.py`): Drei kleine API-Endpunkte im ComfyUI-Server:
  - `POST /folder_launcher/open`: Öffnet einen **existierenden Ordner** im Explorer (keine Dateien, keine Programme)
  - `POST /folder_launcher/pick`: Zeigt den Windows-Ordnerauswahldialog (über die Windows-API per `ctypes`)
  - `POST /folder_launcher/check`: Prüft, ob die Ordner existieren (für die rote Markierung)

> ⚠️ Explorer und Auswahldialog öffnen sich auf dem Rechner, auf dem **ComfyUI läuft**. Die Node ist für die **lokale Nutzung** gedacht.

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Node taucht nicht in der Suche auf | ComfyUI neu starten und den Browser mit Strg+F5 neu laden |
| Auswahldialog erscheint nicht | In der Taskleiste nachsehen, ob er hinter einem anderen Fenster liegt; es kann immer nur ein Dialog gleichzeitig offen sein |
| Pfad ist rot, obwohl er existiert | Netzlaufwerk verbunden? Der Pfad muss für den ComfyUI-Prozess erreichbar sein |

---

## Lizenz

[MIT](LICENSE)
