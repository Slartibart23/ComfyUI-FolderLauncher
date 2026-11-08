"""
ComfyUI Folder Launcher

A frontend-only node (like "Note") that opens any number of Windows folders
in Explorer with one click. The Python side only provides the API endpoints
for opening, picking and checking folders.
"""

from . import folder_launcher  # noqa: F401  (registers the API routes)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
