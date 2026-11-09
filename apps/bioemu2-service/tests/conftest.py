import sys
from pathlib import Path

# The service runs from src/ (WORKDIR /app); import its modules the same way.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
