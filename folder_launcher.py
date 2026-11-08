"""
Folder Launcher - server side.

Provides three small API endpoints that are called by the frontend
(js/folder_launcher.js):

  POST /folder_launcher/open   {"path": "..."}         -> open folder in Explorer
  POST /folder_launcher/pick   {"start": "..."}        -> show Windows folder picker
  POST /folder_launcher/check  {"paths": ["...", ...]} -> check which folders exist

Only existing folders are opened - no files, no programs, and nothing is
ever created.
"""

import asyncio
import ctypes
import logging
import os
import sys
import threading
import uuid
from ctypes import wintypes

from aiohttp import web
from server import PromptServer

log = logging.getLogger("FolderLauncher")
routes = PromptServer.instance.routes

IS_WINDOWS = sys.platform == "win32"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def normalize_path(raw) -> str:
    """Cleans up a path input (quotes, whitespace, environment variables)."""
    if not isinstance(raw, str):
        return ""
    p = raw.strip().strip('"').strip("'").strip()
    if not p:
        return ""
    p = os.path.expandvars(os.path.expanduser(p))
    return os.path.normpath(p)


def is_existing_dir(raw) -> bool:
    p = normalize_path(raw)
    return bool(p) and os.path.isdir(p)


def open_in_explorer(path: str) -> None:
    if IS_WINDOWS:
        # The "explore" verb forces Windows Explorer (no other folder handler).
        os.startfile(path, "explore")
    elif sys.platform == "darwin":
        import subprocess
        subprocess.Popen(["open", path])
    else:
        import subprocess
        subprocess.Popen(["xdg-open", path])


# --------------------------------------------------------------------------- #
# Windows folder picker (IFileOpenDialog via ctypes, no tkinter needed)
# --------------------------------------------------------------------------- #
class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", ctypes.c_uint32),
        ("Data2", ctypes.c_uint16),
        ("Data3", ctypes.c_uint16),
        ("Data4", ctypes.c_ubyte * 8),
    ]

    @classmethod
    def from_str(cls, s: str) -> "_GUID":
        return cls.from_buffer_copy(uuid.UUID(s).bytes_le)


CLSID_FileOpenDialog = "{DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7}"
IID_IFileOpenDialog = "{D57C7288-D4AD-4768-BE02-9D969532D960}"
IID_IShellItem = "{43826D1E-E718-42EE-BC55-A1E261C37BFE}"

CLSCTX_INPROC_SERVER = 0x1
COINIT_APARTMENTTHREADED = 0x2
COINIT_DISABLE_OLE1DDE = 0x4
FOS_PICKFOLDERS = 0x20
FOS_FORCEFILESYSTEM = 0x40
FOS_PATHMUSTEXIST = 0x800
SIGDN_FILESYSPATH = 0x80058000
HRESULT_CANCELLED = 0x800704C7

# vtable indices
_RELEASE = 2
_SHOW = 3
_SET_OPTIONS = 9
_GET_OPTIONS = 10
_SET_FOLDER = 12
_SET_TITLE = 17
_GET_RESULT = 20
_SI_GET_DISPLAY_NAME = 5

_pick_lock = threading.Lock()


def _com_method(obj: ctypes.c_void_p, index: int, *argtypes, restype=ctypes.c_long):
    vtbl = ctypes.cast(obj, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    proto = ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)
    fn = proto(vtbl[index])
    return lambda *args: fn(obj, *args)


def _release(obj: ctypes.c_void_p) -> None:
    if obj and obj.value:
        _com_method(obj, _RELEASE, restype=ctypes.c_ulong)()


def _hr_failed(hr: int) -> bool:
    return (hr & 0xFFFFFFFF) >= 0x80000000


def _create_owner_window(user32):
    """Invisible 'topmost' owner window at the mouse position.

    Makes the dialog appear in front of the browser and on the monitor where
    the user just clicked.
    """
    WS_POPUP = 0x80000000
    WS_EX_TOPMOST = 0x00000008
    WS_EX_TOOLWINDOW = 0x00000080

    user32.CreateWindowExW.restype = wintypes.HWND
    user32.CreateWindowExW.argtypes = [
        wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID,
    ]
    pt = wintypes.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    hwnd = user32.CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_TOOLWINDOW, "STATIC", "Folder Launcher", WS_POPUP,
        pt.x, pt.y, 0, 0, None, None, None, None,
    )
    if not hwnd:
        return None

    # Work around the foreground lock: briefly attach to the input thread of
    # the current foreground window (the browser).
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.c_void_p]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    kernel32 = ctypes.WinDLL("kernel32")
    fg = user32.GetForegroundWindow()
    fg_tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
    my_tid = kernel32.GetCurrentThreadId()
    attached = False
    if fg_tid and fg_tid != my_tid:
        attached = bool(user32.AttachThreadInput(my_tid, fg_tid, True))
    user32.SetForegroundWindow(hwnd)
    user32.BringWindowToTop(hwnd)
    if attached:
        user32.AttachThreadInput(my_tid, fg_tid, False)
    return hwnd


def pick_folder_windows(start: str = "", title: str = "Ordner auswählen"):
    """Shows the modern Windows folder picker. Returns the path or None."""
    ole32 = ctypes.WinDLL("ole32")
    shell32 = ctypes.WinDLL("shell32")
    user32 = ctypes.WinDLL("user32")

    ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    ole32.CoCreateInstance.argtypes = [
        ctypes.POINTER(_GUID), ctypes.c_void_p, wintypes.DWORD,
        ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p),
    ]
    ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    shell32.SHCreateItemFromParsingName.argtypes = [
        wintypes.LPCWSTR, ctypes.c_void_p, ctypes.POINTER(_GUID),
        ctypes.POINTER(ctypes.c_void_p),
    ]

    hr = ole32.CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE)
    com_ok = not _hr_failed(hr)

    dialog = ctypes.c_void_p()
    folder_item = ctypes.c_void_p()
    result_item = ctypes.c_void_p()
    owner = None
    try:
        clsid = _GUID.from_str(CLSID_FileOpenDialog)
        iid = _GUID.from_str(IID_IFileOpenDialog)
        hr = ole32.CoCreateInstance(
            ctypes.byref(clsid), None, CLSCTX_INPROC_SERVER, ctypes.byref(iid),
            ctypes.byref(dialog),
        )
        if _hr_failed(hr):
            raise OSError(f"CoCreateInstance fehlgeschlagen (0x{hr & 0xFFFFFFFF:08X})")

        opts = ctypes.c_uint()
        _com_method(dialog, _GET_OPTIONS, ctypes.POINTER(ctypes.c_uint))(ctypes.byref(opts))
        _com_method(dialog, _SET_OPTIONS, ctypes.c_uint)(
            opts.value | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST
        )
        _com_method(dialog, _SET_TITLE, wintypes.LPCWSTR)(title)

        start = normalize_path(start)
        if start and os.path.isdir(start):
            iid_si = _GUID.from_str(IID_IShellItem)
            if not _hr_failed(shell32.SHCreateItemFromParsingName(
                    start, None, ctypes.byref(iid_si), ctypes.byref(folder_item))):
                _com_method(dialog, _SET_FOLDER, ctypes.c_void_p)(folder_item)

        owner = _create_owner_window(user32)
        hr = _com_method(dialog, _SHOW, wintypes.HWND)(owner)
        if (hr & 0xFFFFFFFF) == HRESULT_CANCELLED:
            return None
        if _hr_failed(hr):
            raise OSError(f"Dialog fehlgeschlagen (0x{hr & 0xFFFFFFFF:08X})")

        hr = _com_method(dialog, _GET_RESULT, ctypes.POINTER(ctypes.c_void_p))(
            ctypes.byref(result_item))
        if _hr_failed(hr) or not result_item.value:
            return None

        name_ptr = ctypes.c_void_p()
        hr = _com_method(result_item, _SI_GET_DISPLAY_NAME, ctypes.c_uint,
                         ctypes.POINTER(ctypes.c_void_p))(SIGDN_FILESYSPATH,
                                                          ctypes.byref(name_ptr))
        if _hr_failed(hr) or not name_ptr.value:
            return None
        try:
            return ctypes.wstring_at(name_ptr.value)
        finally:
            ole32.CoTaskMemFree(name_ptr)
    finally:
        _release(result_item)
        _release(folder_item)
        _release(dialog)
        if owner:
            user32.DestroyWindow.argtypes = [wintypes.HWND]
            user32.DestroyWindow(owner)
        if com_ok:
            ole32.CoUninitialize()


def pick_folder(start: str = ""):
    if not IS_WINDOWS:
        raise OSError("Die Ordnerauswahl ist nur unter Windows verfügbar.")
    return pick_folder_windows(start)


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
async def _json_body(request) -> dict:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


@routes.post("/folder_launcher/open")
async def folder_launcher_open(request):
    data = await _json_body(request)
    path = normalize_path(data.get("path"))
    if not path or not os.path.isdir(path):
        return web.json_response({"ok": False, "error": "Ordner nicht gefunden"}, status=404)
    try:
        open_in_explorer(path)
    except Exception as e:  # noqa: BLE001
        log.warning("Folder Launcher: failed to open folder: %s", e)
        return web.json_response({"ok": False, "error": str(e)}, status=500)
    return web.json_response({"ok": True, "path": path})


@routes.post("/folder_launcher/pick")
async def folder_launcher_pick(request):
    data = await _json_body(request)
    if not _pick_lock.acquire(blocking=False):
        return web.json_response({"ok": False, "busy": True,
                                  "error": "Ein Auswahldialog ist bereits geöffnet"})
    try:
        loop = asyncio.get_running_loop()
        path = await loop.run_in_executor(None, pick_folder, data.get("start", ""))
    except Exception as e:  # noqa: BLE001
        log.warning("Folder Launcher: folder picker failed: %s", e)
        return web.json_response({"ok": False, "error": str(e)}, status=500)
    finally:
        _pick_lock.release()
    return web.json_response({"ok": True, "path": path})


@routes.post("/folder_launcher/check")
async def folder_launcher_check(request):
    data = await _json_body(request)
    paths = data.get("paths")
    if not isinstance(paths, list):
        paths = []
    return web.json_response({"exists": [is_existing_dir(p) for p in paths[:500]]})
