"""
ComfyUI Folder Launcher

Eine reine Frontend-Node (wie "Note"), die beliebig viele Windows-Ordner
per Knopfdruck im Explorer öffnet. Die Python-Seite stellt nur die
API-Endpunkte zum Öffnen, Auswählen und Prüfen bereit.
"""

from . import folder_launcher  # noqa: F401  (registriert die API-Routen)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
