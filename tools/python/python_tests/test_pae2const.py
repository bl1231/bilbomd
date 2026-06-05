# tools/python/python_tests/test_pae2const.py
"""
Tests for the pLDDT-recovery fallback in pae2const.py.

When a structure's B-factor column is all zeros (e.g. pLDDT stripped during
protonation), rigid-body detection silently fails. These tests cover recovering
per-residue pLDDT from an AlphaFold3-style PAE JSON `atom_plddts` array.
"""

import sys
import tempfile
from pathlib import Path

# pae2const.py uses bare sibling imports (`from helpers_viz import ...`), so make
# the tools/python directory importable and load it as a top-level module — the
# same import context it runs under as a script.
_TOOLS_PYTHON = Path(__file__).resolve().parents[1]
if str(_TOOLS_PYTHON) not in sys.path:
    sys.path.insert(0, str(_TOOLS_PYTHON))

import pae2const  # noqa: E402


# --- PDB synthesis helpers ---------------------------------------------------

# Heavy backbone atoms written per residue, plus one hydrogen.
_HEAVY_ATOMS = [("N", "N"), ("CA", "C"), ("C", "C"), ("O", "O")]
_H_ATOM = ("H", "H")


def _atom_line(serial, name, resname, chain, resseq, bfac, element):
    """Build a fixed-column PDB ATOM record."""
    name_field = name if len(name) >= 4 else f" {name:<3}"
    return (
        f"ATOM  {serial:5d} {name_field}{' '}{resname:<3} {chain}{resseq:4d}"
        f"    {0.0:8.3f}{0.0:8.3f}{0.0:8.3f}{1.0:6.2f}{bfac:6.2f}"
        f"          {element:>2}\n"
    )


def _write_pdb(path, n_res=20, chain="A", bfac=0.0, with_hydrogens=True):
    """Write a single-chain PDB with backbone heavy atoms (+ optional H)."""
    serial = 1
    with open(path, "w", encoding="utf-8") as fh:
        for resseq in range(1, n_res + 1):
            atoms = list(_HEAVY_ATOMS)
            if with_hydrogens:
                atoms.append(_H_ATOM)
            for name, element in atoms:
                fh.write(
                    _atom_line(serial, name, "ALA", chain, resseq, bfac, element)
                )
                serial += 1
        fh.write("END\n")


def _heavy_atom_plddts(n_res=20, value=80.0):
    """One pLDDT per heavy atom (4 per residue), matching _write_pdb ordering."""
    return [value] * (len(_HEAVY_ATOMS) * n_res)


# --- Tests -------------------------------------------------------------------

def test_heavy_atom_tracking_skips_hydrogens():
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=20, with_hydrogens=True)
        h = pae2const.PDBHandler()
        n = h._prepare_pdb_mappings(str(pdb))
        assert n == 20  # residues
        # 4 heavy atoms per residue, hydrogens excluded
        assert len(h.pdb_heavy_atom_res) == 80
        assert all(seg == "A" for seg, _ in h.pdb_heavy_atom_res)


def test_bfactors_all_zero_detection():
    with tempfile.TemporaryDirectory() as d:
        zero = Path(d) / "zero.pdb"
        nonzero = Path(d) / "nonzero.pdb"
        _write_pdb(zero, bfac=0.0)
        _write_pdb(nonzero, bfac=75.0)

        hz = pae2const.PDBHandler()
        hz._prepare_pdb_mappings(str(zero))
        assert hz.bfactors_all_zero() is True

        hn = pae2const.PDBHandler()
        hn._prepare_pdb_mappings(str(nonzero))
        assert hn.bfactors_all_zero() is False

        # Empty handler (no mappings) must not report all-zero.
        assert pae2const.PDBHandler().bfactors_all_zero() is False


def test_apply_plddt_from_atom_array_repopulates():
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=20, bfac=0.0)
        h = pae2const.PDBHandler()
        h._prepare_pdb_mappings(str(pdb))
        assert h.bfactors_all_zero() is True

        ok = h.apply_plddt_from_atom_array(_heavy_atom_plddts(20, 80.0))
        assert ok is True
        assert h.bfactors_all_zero() is False
        # Per-residue average should now equal the recovered value.
        avg = h.calculate_bfactor_avg_for_region(str(pdb), 0, 19, 1)
        assert abs(avg - 80.0) < 1e-6


def test_apply_plddt_mismatch_is_rejected():
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=20, bfac=0.0)
        h = pae2const.PDBHandler()
        h._prepare_pdb_mappings(str(pdb))

        # Wrong length (heavy count is 80) → rejected, data unchanged.
        ok = h.apply_plddt_from_atom_array([80.0, 80.0, 80.0])
        assert ok is False
        assert h.bfactors_all_zero() is True


def test_maybe_recover_plddt_end_to_end_yields_rigid_bodies():
    """All-zero B-factors + atom_plddts in JSON should produce a rigid body
    where the un-recovered baseline produces none."""
    n_res = 20
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=n_res, bfac=0.0)

        # Low-PAE matrix → a single confident cluster spanning the chain.
        pae = [[1.0 for _ in range(n_res)] for _ in range(n_res)]
        pae_data = {"pae": pae, "atom_plddts": _heavy_atom_plddts(n_res, 90.0)}

        def build_processor():
            cfg = pae2const.PAEConfig(plddt_cutoff=50.0)
            p = pae2const.PAEProcessor(config=cfg)
            p.input_handler = pae2const.PDBHandler()
            p.input_file = str(pdb)
            p.pae_data = pae_data
            p.first_residue, p.last_residue = (
                p.get_first_and_last_residue_numbers(str(pdb))
            )
            p.chain_segments = p.define_segments(str(pdb))
            return p

        # Baseline: no recovery → every region fails the pLDDT gate.
        baseline = build_processor()
        baseline.define_clusters()
        baseline.define_rigid_bodies()
        assert baseline.rigid_bodies == []

        # With recovery: pLDDT restored from atom_plddts → rigid body emerges.
        recovered = build_processor()
        assert recovered.maybe_recover_plddt_from_json() is True
        recovered.define_clusters()
        recovered.define_rigid_bodies()
        assert len(recovered.rigid_bodies) >= 1


def test_maybe_recover_noop_without_atom_plddts():
    n_res = 20
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=n_res, bfac=0.0)
        cfg = pae2const.PAEConfig(plddt_cutoff=50.0)
        p = pae2const.PAEProcessor(config=cfg)
        p.input_handler = pae2const.PDBHandler()
        p.input_file = str(pdb)
        p.pae_data = {"pae": [[1.0] * n_res for _ in range(n_res)]}  # no atom_plddts
        p.first_residue, p.last_residue = p.get_first_and_last_residue_numbers(str(pdb))
        p.chain_segments = p.define_segments(str(pdb))
        assert p.maybe_recover_plddt_from_json() is False


def test_maybe_recover_noop_when_bfactors_present():
    n_res = 20
    with tempfile.TemporaryDirectory() as d:
        pdb = Path(d) / "m.pdb"
        _write_pdb(pdb, n_res=n_res, bfac=88.0)  # real pLDDT present
        cfg = pae2const.PAEConfig(plddt_cutoff=50.0)
        p = pae2const.PAEProcessor(config=cfg)
        p.input_handler = pae2const.PDBHandler()
        p.input_file = str(pdb)
        p.pae_data = {
            "pae": [[1.0] * n_res for _ in range(n_res)],
            "atom_plddts": _heavy_atom_plddts(n_res, 10.0),
        }
        p.first_residue, p.last_residue = p.get_first_and_last_residue_numbers(str(pdb))
        p.chain_segments = p.define_segments(str(pdb))
        # B-factors are non-zero, so recovery must not run / overwrite.
        assert p.maybe_recover_plddt_from_json() is False
        avg = p.input_handler.calculate_bfactor_avg_for_region(str(pdb), 0, 0, 1)
        assert abs(avg - 88.0) < 1e-6


if __name__ == "__main__":
    # Allow running without pytest: `python test_pae2const.py`
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {exc!r}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
