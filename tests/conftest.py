"""Shared setup: the app and the PC sync are plain folders, so the tests put both on the path."""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for sub in ("app", "sync"):
    sys.path.insert(0, os.path.join(ROOT, sub))
