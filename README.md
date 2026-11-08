# ComfyUI – Folder Launcher

![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![ComfyUI](https://img.shields.io/badge/ComfyUI-custom%20node-purple)
![Windows](https://img.shields.io/badge/platform-Windows-0078D6)
![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

A ComfyUI custom node that **opens any number of your own folders in Windows Explorer with a single click**, right from your workflow. As soon as a row is filled in, a new empty row appears below it automatically.

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- 📂 **Open folders with one click**: **Open** launches Windows Explorer in the given folder (or press **Enter** in the path field)
- ➕ **Grows automatically**: once the last path is filled in, a new empty row is added below
- 📁 **Pick a folder**: the button opens the standard Windows folder dialog; you can also type or paste a path
- 🏷️ **Optional name** per row, e.g. "Outputs" or "LoRAs"
- ↕️ **Reorder via drag & drop** using the `⠿` handle
- ✕ **Remove rows** with the ✕ button
- 🔴 **Missing folders are highlighted in red**; nothing is ever created
- 💾 **Saved with the workflow**: every Folder Launcher node keeps its own list
- 🧹 Quotes added by Windows **"Copy as path"** are stripped automatically
- ⚡ **No effect on generation**: it is a frontend-only node (like "Note") and is ignored when the workflow runs
- 📦 **No dependencies**: see [Installation](#installation)

---

## Installation

> ✅ **No requirements.** The node needs no extra packages and has no `requirements.txt`. It only uses the Python standard library (`os`, `ctypes`, …) and `aiohttp`, which ComfyUI itself already runs on. Even `tkinter` is not needed (it is missing from the ComfyUI portable build anyway).

### Option A – Git

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Slartibart23/ComfyUI-FolderLauncher.git
```

### Option B – ZIP

1. Download the repository as a ZIP
2. Extract it to `ComfyUI/custom_nodes/ComfyUI-FolderLauncher`

Then **restart ComfyUI** and reload the browser. Nothing else to install.

---

## Usage

1. Double-click the canvas and search for **Folder Launcher** (category `utils`)
2. Type or paste a path into the first row, or pick one with **📁**
3. Optionally give it a name on the left
4. Click **Open**: Explorer opens the folder

| Element | Function |
|---|---|
| `⠿` | Drag the row to change the order |
| Name | Optional label |
| Path | Folder path; red = folder does not exist |
| 📁 | Open the Windows folder picker |
| Open | Open the folder in Explorer (also via Enter) |
| ✕ | Remove the row |

---

## How it works

- **Frontend** (`js/folder_launcher.js`): the node with its dynamic rows. The list is stored in `node.properties.folders`, so it is saved with the workflow.
- **Backend** (`folder_launcher.py`): three small API endpoints in the ComfyUI server:
  - `POST /folder_launcher/open`: opens an **existing folder** in Explorer (no files, no programs)
  - `POST /folder_launcher/pick`: shows the Windows folder picker (via the Windows API using `ctypes`)
  - `POST /folder_launcher/check`: checks whether folders exist (for the red highlighting)

> ⚠️ Explorer and the folder picker open on the machine **where ComfyUI is running**. The node is meant for **local use**.
>
> The folder picker (📁) is **Windows only**. On Linux/macOS, opening folders and typing paths still works.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Node does not show up in search | Restart ComfyUI and hard-reload the browser (Ctrl+F5) |
| Folder picker does not appear | Check the taskbar in case it is behind another window; only one picker can be open at a time |
| Path is red although it exists | Is the network drive connected? The path must be reachable by the ComfyUI process |

---

## License

[MIT](LICENSE)
