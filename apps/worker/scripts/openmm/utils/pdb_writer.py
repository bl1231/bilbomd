import os
from openmm.app import PDBFile


# --- Custom reporter that writes one PDB per report interval ---
class PDBFrameWriter:
    """
    Write a single-model PDB to an individual file every report interval.
    Filenames are of the form: <base>_<step>.pdb
    """

    def __init__(self, directory: str, base_name: str, reportInterval: int = 10):
        self._reportInterval = int(reportInterval)
        self._dir = directory
        self._base = base_name
        self._count = 0
        os.makedirs(self._dir, exist_ok=True)

    def describeNextReport(self, simulation):
        # (steps, positions, velocities, forces, energies)
        return (self._reportInterval, True, False, False, False)

    def report(self, simulation, state):
        # Try to get the actual MD step from the State if available.
        step = None
        try:
            step = state.getStepCount()
        except Exception:
            pass
        if step is None:
            # Fallback: compute from count * interval; increment afterwards.
            step = (self._count + 1) * self._reportInterval
        fname = f"{self._base}_{int(step):09d}.pdb"
        out_path = os.path.join(self._dir, fname)
        with open(out_path, "w", encoding="utf-8") as fh:
            PDBFile.writeFile(simulation.topology, state.getPositions(), fh)
        self._count += 1
