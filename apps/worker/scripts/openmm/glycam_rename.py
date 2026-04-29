"""CLI entry point for GLYCAM residue renaming.

See utils/glycam_rename.py for full documentation and importable API.

Usage:
    python glycam_rename.py <input.pdb> [--inplace | --output <out.pdb>]
"""

import sys
import os

# Allow imports from utils/ when called as a standalone script
sys.path.insert(0, os.path.dirname(__file__))

from utils.glycam_rename import _main  # noqa: E402

if __name__ == "__main__":
    _main()
