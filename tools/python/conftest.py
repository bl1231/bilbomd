"""Pytest bootstrap for the tools/python scripts.

Adds this directory to ``sys.path`` so the modules' bare sibling imports
(e.g. ``from saxs_utils import ...`` inside ``autorg.py``) resolve during tests,
matching the runtime layout where these scripts run from ``/app/scripts``.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
