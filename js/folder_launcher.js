// Folder Launcher – reine Frontend-Node (wie "Note").
// Beliebig viele Ordner-Zeilen; jede Zeile öffnet ihren Ordner im Windows Explorer.
// Die Liste wird in node.properties.folders gespeichert und landet damit im Workflow.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "FolderLauncher";
const ROW_H = 26;
const ROW_GAP = 4;
const PAD = 6;
const WIDGET_MARGIN = 4;
const DEFAULT_WIDTH = 580;
const MIN_WIDTH = 380;

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------
const STYLE = `
.fl-root { box-sizing: border-box; width: 100%; height: 100%; padding: ${PAD}px;
  font: 12px system-ui, sans-serif; color: var(--input-text, #ddd); overflow: hidden; }
.fl-list { display: flex; flex-direction: column; gap: ${ROW_GAP}px; }
.fl-row { display: grid; align-items: center; gap: 4px; height: ${ROW_H}px;
  grid-template-columns: 14px minmax(70px, 0.3fr) minmax(100px, 1fr) 30px 58px 24px; }
.fl-row input { box-sizing: border-box; height: 24px; min-width: 0; width: 100%; margin: 0;
  padding: 0 6px; font-size: 12px; outline: none; border-radius: 4px;
  background: var(--comfy-input-bg, #222); color: var(--input-text, #ddd);
  border: 1px solid var(--border-color, #444); }
.fl-row input:focus { border-color: var(--p-primary-color, #4a90e2); }
.fl-row input::placeholder { color: var(--descrip-text, #888); opacity: .8; }
.fl-row.fl-invalid .fl-path { border-color: #d9534f; background: rgba(217, 83, 79, .14); }
.fl-btn { box-sizing: border-box; height: 24px; margin: 0; padding: 0; font-size: 12px;
  cursor: pointer; border-radius: 4px; color: var(--input-text, #ddd);
  background: var(--comfy-menu-bg, #333); border: 1px solid var(--border-color, #444); }
.fl-btn:hover:not(:disabled) { filter: brightness(1.35); }
.fl-btn:disabled { opacity: .35; cursor: default; }
.fl-handle { cursor: grab; user-select: none; text-align: center; opacity: .55; font-size: 13px;
  touch-action: none; }
.fl-handle:hover { opacity: 1; }
.fl-row.fl-blank .fl-handle, .fl-row.fl-blank .fl-del { visibility: hidden; }
.fl-row.fl-dragging { opacity: .55; }
body.fl-drag-active, body.fl-drag-active * { cursor: grabbing !important; user-select: none !important; }
.fl-flash { animation: fl-flash .7s ease-out; }
@keyframes fl-flash { 0% { background: rgba(217, 83, 79, .7); } 100% { } }
`;

function injectStyle() {
  if (document.getElementById("folder-launcher-style")) return;
  const el = document.createElement("style");
  el.id = "folder-launcher-style";
  el.textContent = STYLE;
  document.head.appendChild(el);
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
async function post(url, body) {
  try {
    const res = await api.fetchApi(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* leer */ }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e) } };
  }
}

function cleanPath(s) {
  return (s ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
}

function toast(severity, summary, detail) {
  const t = app.extensionManager?.toast;
  if (t?.add) t.add({ severity, summary, detail, life: 3500 });
  else console[severity === "error" ? "error" : "log"](`[Folder Launcher] ${summary}: ${detail ?? ""}`);
}

function flash(el) {
  el.classList.remove("fl-flash");
  void el.offsetWidth; // Animation neu starten
  el.classList.add("fl-flash");
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const c of children) e.append(c);
  return e;
}

// --------------------------------------------------------------------------
// Node
// --------------------------------------------------------------------------
class FolderLauncherNode extends LGraphNode {
  static category;
  static collapsable;

  constructor(title) {
    super(title ?? "Folder Launcher");
    this.isVirtualNode = true;
    this.serialize_widgets = false;
    this.properties = this.properties || {};
    this.properties.folders = [];
    // Eigene Liste (node.properties ist im neuen Frontend ein reaktiver Proxy,
    // dort wären Objekt-Vergleiche unzuverlässig). Wird per _sync() gespiegelt.
    this._entries = [];

    this._rowFor = new Map();   // entry -> row element
    this._checkTimers = new Map();

    injectStyle();
    this._buildWidget();
    this._ensureTrailingBlank();
    this._sync();
    this._render();
    this.size = [DEFAULT_WIDTH, this.size?.[1] ?? 80];
    requestAnimationFrame(() => this._fitHeight());
  }

  // ---- Daten -------------------------------------------------------------
  get _folders() {
    return this._entries;
  }

  /** Schreibt die Liste als einfache Kopie in node.properties (-> Workflow). */
  _sync() {
    this.properties.folders = this._entries.map((e) => ({ name: e.name ?? "", path: e.path ?? "" }));
  }

  _isBlank(entry) {
    return !cleanPath(entry.path);
  }

  /** Sorgt dafür, dass ganz unten immer genau eine leere Zeile zum Ausfüllen steht. */
  _ensureTrailingBlank() {
    const f = this._folders;
    const last = f[f.length - 1];
    if (!last || !this._isBlank(last)) {
      const entry = { name: "", path: "" };
      f.push(entry);
      return entry;
    }
    return null;
  }

  _isTrailingBlank(entry) {
    const f = this._folders;
    return entry === f[f.length - 1] && this._isBlank(entry);
  }

  _markChanged() {
    this._sync();
    this.setDirtyCanvas(true, true);
    app.graph?.change?.();
  }

  // ---- Aufbau ------------------------------------------------------------
  _buildWidget() {
    this._list = el("div", { className: "fl-list" });
    this._root = el("div", { className: "fl-root" }, this._list);
    // ComfyUI zieht oben und unten je "margin" von der Widget-Höhe ab.
    const h = () => this._contentHeight() + WIDGET_MARGIN * 2;
    this._widget = this.addDOMWidget("folders", "folder_launcher", this._root, {
      serialize: false,
      hideOnZoom: false,
      margin: WIDGET_MARGIN,
      getMinHeight: h,
      getMaxHeight: h,
      getHeight: h,
    });
  }

  _contentHeight() {
    const n = Math.max(1, this._folders.length);
    return PAD * 2 + n * ROW_H + (n - 1) * ROW_GAP;
  }

  // Eigene Mindestgröße: exakt so hoch wie die Zeilen (Standard-Berechnung ist zu großzügig).
  computeSize() {
    const top = this._widget?.y || 2;
    return [MIN_WIDTH, top + this._contentHeight() + WIDGET_MARGIN * 2 + 6];
  }

  _fitHeight() {
    const [minW, h] = this.computeSize();
    this.setSize([Math.max(this.size[0], minW), h]);
    this.setDirtyCanvas(true, true);
  }

  _render() {
    this._list.replaceChildren();
    this._rowFor.clear();
    for (const entry of this._folders) this._list.append(this._createRow(entry));
    this._refreshBlankState();
  }

  _refreshBlankState() {
    for (const [entry, row] of this._rowFor) {
      const blank = this._isTrailingBlank(entry);
      row.classList.toggle("fl-blank", blank);
      row._open.disabled = this._isBlank(entry);
    }
  }

  _createRow(entry) {
    const handle = el("span", { className: "fl-handle", textContent: "⠿", title: "Ziehen zum Umsortieren" });
    const name = el("input", {
      className: "fl-name", type: "text", value: entry.name ?? "",
      placeholder: "Name (opt.)", spellcheck: false,
    });
    const path = el("input", {
      className: "fl-path", type: "text", value: entry.path ?? "",
      placeholder: "Pfad eingeben oder 📁 auswählen …", spellcheck: false,
      title: entry.path ?? "",
    });
    const pick = el("button", { className: "fl-btn fl-pick", textContent: "📁", title: "Ordner auswählen …" });
    const open = el("button", { className: "fl-btn fl-open", textContent: "Öffnen", title: "Im Explorer öffnen" });
    const del = el("button", { className: "fl-btn fl-del", textContent: "✕", title: "Zeile entfernen" });

    const row = el("div", { className: "fl-row" }, handle, name, path, pick, open, del);
    row._entry = entry;
    row._path = path;
    row._open = open;
    this._rowFor.set(entry, row);

    name.addEventListener("input", () => {
      entry.name = name.value;
      this._markChanged();
    });

    path.addEventListener("input", () => {
      entry.path = path.value;
      path.title = path.value;
      this._afterPathChanged(entry);
    });

    // Windows "Als Pfad kopieren" liefert Anführungszeichen mit – beim Verlassen entfernen.
    path.addEventListener("change", () => {
      const cleaned = cleanPath(path.value);
      if (cleaned !== path.value) {
        path.value = cleaned;
        entry.path = cleaned;
        path.title = cleaned;
        this._afterPathChanged(entry);
      }
    });

    path.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._openEntry(entry);
      }
    });

    pick.addEventListener("click", () => this._pickEntry(entry));
    open.addEventListener("click", () => this._openEntry(entry));
    del.addEventListener("click", () => this._removeEntry(entry));
    handle.addEventListener("pointerdown", (e) => this._startDrag(e, entry));

    if (cleanPath(entry.path)) this._scheduleCheck(entry, 0);
    return row;
  }

  // ---- Aktionen ----------------------------------------------------------
  _afterPathChanged(entry) {
    const added = this._ensureTrailingBlank();
    if (added) {
      this._list.append(this._createRow(added));
      this._fitHeight();
    }
    this._refreshBlankState();
    this._scheduleCheck(entry);
    this._markChanged();
  }

  async _pickEntry(entry) {
    const res = await post("/folder_launcher/pick", { start: cleanPath(entry.path) });
    if (res.data?.busy) {
      toast("info", "Folder Launcher", "Es ist bereits ein Auswahldialog offen.");
      return;
    }
    if (!res.ok) {
      toast("error", "Ordnerauswahl fehlgeschlagen", res.data?.error);
      return;
    }
    const chosen = res.data?.path;
    if (!chosen) return; // abgebrochen
    const row = this._rowFor.get(entry);
    entry.path = chosen;
    if (row) {
      row._path.value = chosen;
      row._path.title = chosen;
    }
    this._afterPathChanged(entry);
  }

  async _openEntry(entry) {
    const row = this._rowFor.get(entry);
    const p = cleanPath(entry.path);
    if (!p) {
      if (row) flash(row._path);
      return;
    }
    const res = await post("/folder_launcher/open", { path: p });
    if (res.ok) return;
    if (row) {
      if (res.status === 404) this._setValid(entry, false);
      flash(row._path);
    }
    toast("error", res.status === 404 ? "Ordner nicht gefunden" : "Öffnen fehlgeschlagen",
      res.status === 404 ? p : res.data?.error);
  }

  _removeEntry(entry) {
    const f = this._folders;
    const i = f.indexOf(entry);
    if (i < 0 || this._isTrailingBlank(entry)) return;
    f.splice(i, 1);
    this._rowFor.get(entry)?.remove();
    this._rowFor.delete(entry);
    clearTimeout(this._checkTimers.get(entry));
    this._checkTimers.delete(entry);
    const added = this._ensureTrailingBlank();
    if (added) this._list.append(this._createRow(added));
    this._refreshBlankState();
    this._fitHeight();
    this._markChanged();
  }

  // ---- Ordner-Prüfung (rote Markierung) ----------------------------------
  _scheduleCheck(entry, delay = 350) {
    clearTimeout(this._checkTimers.get(entry));
    this._checkTimers.set(entry, setTimeout(async () => {
      this._checkTimers.delete(entry);
      const p = cleanPath(entry.path);
      if (!p) {
        this._setValid(entry, true);
        return;
      }
      const res = await post("/folder_launcher/check", { paths: [p] });
      // Nur übernehmen, wenn der Pfad sich in der Zwischenzeit nicht geändert hat.
      if (res.ok && cleanPath(entry.path) === p) this._setValid(entry, !!res.data?.exists?.[0]);
    }, delay));
  }

  _setValid(entry, valid) {
    const row = this._rowFor.get(entry);
    if (!row) return;
    row.classList.toggle("fl-invalid", !valid);
    row._path.title = valid ? (entry.path ?? "") : `Ordner nicht gefunden: ${entry.path}`;
  }

  // ---- Umsortieren per Drag & Drop ---------------------------------------
  _startDrag(e, entry) {
    if (e.button !== 0 || this._isTrailingBlank(entry)) return;
    e.preventDefault();
    e.stopPropagation();
    const row = this._rowFor.get(entry);
    if (!row) return;
    row.classList.add("fl-dragging");
    document.body.classList.add("fl-drag-active");

    const onMove = (ev) => {
      ev.preventDefault();
      const children = [...this._list.children];
      const last = children[children.length - 1];
      const blankRow = last && this._isTrailingBlank(last._entry) ? last : null;
      let before = blankRow; // nie unter die leere Zeile schieben
      for (const c of children) {
        if (c === row || c === blankRow) continue;
        const r = c.getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { before = c; break; }
      }
      if (before !== row && before !== row.nextSibling) {
        if (before) this._list.insertBefore(row, before);
        else this._list.append(row);
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      row.classList.remove("fl-dragging");
      document.body.classList.remove("fl-drag-active");
      const order = [...this._list.children].map((c) => c._entry);
      const changed = order.some((x, i) => x !== this._folders[i]);
      if (changed) {
        this._entries = order;
        this._refreshBlankState();
        this._markChanged();
      }
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
  }

  // ---- LiteGraph-Hooks ---------------------------------------------------
  onConfigure() {
    // properties.folders wurde aus dem Workflow geladen -> Zeilen neu aufbauen.
    const saved = Array.isArray(this.properties.folders) ? this.properties.folders : [];
    this._entries = saved.map((x) => ({
      name: typeof x?.name === "string" ? x.name : "",
      path: typeof x?.path === "string" ? x.path : "",
    }));
    this._ensureTrailingBlank();
    this._sync();
    this._render();
    requestAnimationFrame(() => this._fitHeight());
  }
}

app.registerExtension({
  name: "FolderLauncher",
  registerCustomNodes() {
    LiteGraph.registerNodeType(
      NODE_TYPE,
      Object.assign(FolderLauncherNode, { title: "Folder Launcher", collapsable: true }),
    );
    FolderLauncherNode.category = "utils";
  },
});
