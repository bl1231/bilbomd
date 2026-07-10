"""Pytest bootstrap for the OpenMM worker scripts.

Adds this directory (``apps/worker/scripts/openmm``) to ``sys.path`` so tests can
import the sibling ``utils`` package (e.g. ``from utils.model_prep import ...``)
regardless of the directory pytest is invoked from. Mirrors the runtime layout,
where these scripts run with the openmm dir on the path.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
