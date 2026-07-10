"""Tests for GLYCAM helpers in model_prep.py.

These require the OpenMM stack (openmm, pdbfixer) and the GLYCAM force field, so
they run in the worker's `openmm` conda environment (e.g. `pnpm -F @bilbomd/worker
run test:python`), not on a bare host.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# scripts/openmm on the path so `from utils.<mod>` (used inside model_prep) resolves
sys.path.insert(0, str(Path(__file__).parent.parent))

# Skip (rather than error) where the OpenMM conda stack is unavailable, e.g. the
# lightweight CI job. These tests run for real inside the worker image.
pytest.importorskip("openmm")

from openmm import Vec3
from openmm.app import Element, ForceField, Topology
from openmm.unit import angstroms

from utils.model_prep import (  # noqa: E402
    _add_glycam_sugar_intra_bonds,
    _is_glycam_name,
    _repair_glycam_glycosidic_bonds,
)


# ---------------------------------------------------------------------------
# _is_glycam_name
# ---------------------------------------------------------------------------

class TestIsGlycamName:
    @pytest.mark.parametrize(
        "name",
        ["0YB", "0YA", "4YB", "0MA", "2MA", "NLN", "OLS", "OLT",
         "VMB", "XMA", "WYB", "UMA", "PMB"],  # letter-prefixed branch codes
    )
    def test_recognises_glycam_residues(self, name):
        assert _is_glycam_name(name) is True

    @pytest.mark.parametrize(
        "name",
        ["ALA", "GLY", "HOH", "FAD", "ND2", "0Y", "0YBX", "", "MG"],
    )
    def test_rejects_non_glycam_residues(self, name):
        assert _is_glycam_name(name) is False


# ---------------------------------------------------------------------------
# Topology construction helpers
# ---------------------------------------------------------------------------

def _add_atoms(topology, residue, names_coords):
    """Add named C/N/O atoms to a residue; return {name: atom} and coords list."""
    atoms = {}
    coords = []
    for name, xyz in names_coords:
        element = Element.getBySymbol(name[0])
        atoms[name] = topology.addAtom(name, element, residue)
        coords.append(Vec3(*xyz))
    return atoms, coords


# ---------------------------------------------------------------------------
# _repair_glycam_glycosidic_bonds
# ---------------------------------------------------------------------------

class TestGlycosidicBondRepair:
    def _build(self):
        """NLN.ND2 — 0YB.C1, and 0YB.O4 — 4YB.C1 (coords in Ångström)."""
        top = Topology()
        chain = top.addChain()
        coords = []

        nln = top.addResidue("NLN", chain)
        a, c = _add_atoms(top, nln, [("ND2", (0.0, 0.0, 0.0))])
        coords += c

        red = top.addResidue("0YB", chain)  # reducing-end GlcNAc
        a2, c = _add_atoms(top, red, [("C1", (1.44, 0.0, 0.0)),
                                      ("O4", (1.44, 5.0, 0.0))])
        coords += c

        nxt = top.addResidue("4YB", chain)  # next GlcNAc
        a3, c = _add_atoms(top, nxt, [("C1", (1.44, 6.4, 0.0))])
        coords += c

        return top, coords * angstroms

    def test_creates_protein_and_sugar_linkages(self):
        top, positions = self._build()
        added = _repair_glycam_glycosidic_bonds(top, positions)
        assert added == 2

        bonded = {
            frozenset((f"{b[0].residue.name}.{b[0].name}",
                       f"{b[1].residue.name}.{b[1].name}"))
            for b in top.bonds()
        }
        assert frozenset(("0YB.C1", "NLN.ND2")) in bonded      # N-glycosidic
        assert frozenset(("4YB.C1", "0YB.O4")) in bonded       # sugar-sugar

    def test_idempotent(self):
        top, positions = self._build()
        assert _repair_glycam_glycosidic_bonds(top, positions) == 2
        # second pass must not duplicate existing bonds
        assert _repair_glycam_glycosidic_bonds(top, positions) == 0

    def test_ignores_atoms_beyond_cutoff(self):
        top = Topology()
        chain = top.addChain()
        red = top.addResidue("0YB", chain)
        _add_atoms(top, red, [("C1", (0.0, 0.0, 0.0))])
        far = top.addResidue("4YB", chain)
        _add_atoms(top, far, [("O4", (5.0, 0.0, 0.0))])  # 5 Å > cutoff
        positions = [Vec3(0.0, 0.0, 0.0), Vec3(5.0, 0.0, 0.0)] * angstroms
        assert _repair_glycam_glycosidic_bonds(top, positions) == 0


# ---------------------------------------------------------------------------
# _add_glycam_sugar_intra_bonds
# ---------------------------------------------------------------------------

class TestSugarIntraBonds:
    def test_adds_template_bonds_for_sugar(self):
        forcefield = ForceField("amber19-all.xml", "amber14/GLYCAM_06j-1.xml",
                                "implicit/gbn2.xml")
        top = Topology()
        chain = top.addChain()
        res = top.addResidue("0MA", chain)  # alpha-mannose, terminal
        # ring heavy atoms present in the 0MA template, no bonds yet
        _add_atoms(top, res, [
            ("C1", (0.0, 0.0, 0.0)), ("C2", (1.5, 0.0, 0.0)),
            ("C3", (2.5, 1.0, 0.0)), ("C4", (2.0, 2.0, 0.0)),
            ("C5", (0.5, 2.0, 0.0)), ("O5", (0.0, 1.0, 0.0)),
        ])
        assert not list(top.bonds())
        added = _add_glycam_sugar_intra_bonds(top, forcefield)
        assert added > 0  # e.g. C1-C2, C2-C3, C5-O5, ...

    def test_no_bonds_for_protein_residue(self):
        forcefield = ForceField("amber19-all.xml", "amber14/GLYCAM_06j-1.xml",
                                "implicit/gbn2.xml")
        top = Topology()
        chain = top.addChain()
        res = top.addResidue("NLN", chain)  # protein GLYCAM residue, not a sugar
        _add_atoms(top, res, [("N", (0.0, 0.0, 0.0)), ("CA", (1.5, 0.0, 0.0))])
        assert _add_glycam_sugar_intra_bonds(top, forcefield) == 0
