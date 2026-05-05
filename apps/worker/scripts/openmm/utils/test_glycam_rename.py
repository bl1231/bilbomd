"""Tests for glycam_rename.py."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
from glycam_rename import rename_glycam_residues, _is_alpha_anomer, Residue, Atom


# ---------------------------------------------------------------------------
# Minimal PDB line builder helpers
# ---------------------------------------------------------------------------

def _atom_line(
    serial: int,
    name: str,
    resname: str,
    chain: str,
    resseq: int,
    x: float,
    y: float,
    z: float,
    record: str = "ATOM  ",
) -> str:
    return (
        f"{record}{serial:5d} {name:<4s} {resname:<3s} {chain}{resseq:4d}    "
        f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00\n"
    )


def _link_line(
    atom1: str, chain1: str, resseq1: int,
    atom2: str, chain2: str, resseq2: int,
) -> str:
    return (
        f"LINK        {atom1:<4s}     {chain1}{resseq1:4d}              "
        f"{atom2:<4s}     {chain2}{resseq2:4d}\n"
    )


# ---------------------------------------------------------------------------
# Fixtures: minimal PDB snippets
# ---------------------------------------------------------------------------

def _n_linked_nag_pdb() -> str:
    """ASN A400 with NAG A903 N-linked via ND2–C1 bond."""
    lines = [
        "REMARK test\n",
        # ASN sidechain atoms (just what we need)
        _atom_line(1,  "N",   "ASN", "A", 400, 200.0, 200.0, 200.0),
        _atom_line(2,  "CA",  "ASN", "A", 400, 201.0, 200.0, 200.0),
        _atom_line(3,  "CB",  "ASN", "A", 400, 202.0, 200.0, 200.0),
        _atom_line(4,  "CG",  "ASN", "A", 400, 203.0, 200.0, 200.0),
        _atom_line(5,  "OD1", "ASN", "A", 400, 203.0, 201.0, 200.0),
        _atom_line(6,  "ND2", "ASN", "A", 400, 204.0, 200.0, 200.0),
        # NAG C1 at 1.44 Å from ND2
        _atom_line(7,  "C1",  "NAG", "A", 903, 205.44, 200.0, 200.0, "HETATM"),
        _atom_line(8,  "C2",  "NAG", "A", 903, 206.0,  200.0, 200.0, "HETATM"),
        _atom_line(9,  "O5",  "NAG", "A", 903, 205.44, 201.0, 200.0, "HETATM"),
        _atom_line(10, "O1",  "NAG", "A", 903, 205.44, 200.0, 201.44, "HETATM"),
        _link_line("ND2", "A", 400, "C1", "A", 903),
    ]
    return "".join(lines)


def _o_linked_man_thr_pdb() -> str:
    """THR A197 with MAN A908 O-linked via OG1–C1 bond."""
    lines = [
        _atom_line(1,  "N",   "THR", "A", 197, 100.0, 100.0, 100.0),
        _atom_line(2,  "CA",  "THR", "A", 197, 101.0, 100.0, 100.0),
        _atom_line(3,  "CB",  "THR", "A", 197, 102.0, 100.0, 100.0),
        _atom_line(4,  "OG1", "THR", "A", 197, 103.0, 100.0, 100.0),
        # MAN C1 at 1.44 Å from OG1
        _atom_line(5,  "C1",  "MAN", "A", 908, 104.44, 100.0, 100.0, "HETATM"),
        _atom_line(6,  "C2",  "MAN", "A", 908, 105.0,  100.0, 100.0, "HETATM"),
        _atom_line(7,  "O5",  "MAN", "A", 908, 104.44, 101.0, 100.0, "HETATM"),
        # O1 axial (same side as O5 relative to ring normal) → alpha mannose
        _atom_line(8,  "O1",  "MAN", "A", 908, 104.44, 100.0, 101.44, "HETATM"),
        _link_line("OG1", "A", 197, "C1", "A", 908),
    ]
    return "".join(lines)


def _o_linked_man_ser_pdb() -> str:
    """SER A195 with MAN A907 O-linked via OG–C1 bond."""
    lines = [
        _atom_line(1,  "N",   "SER", "A", 195, 50.0, 50.0, 50.0),
        _atom_line(2,  "CA",  "SER", "A", 195, 51.0, 50.0, 50.0),
        _atom_line(3,  "OG",  "SER", "A", 195, 52.0, 50.0, 50.0),
        _atom_line(4,  "C1",  "MAN", "A", 907, 53.44, 50.0, 50.0, "HETATM"),
        _atom_line(5,  "C2",  "MAN", "A", 907, 54.0,  50.0, 50.0, "HETATM"),
        _atom_line(6,  "O5",  "MAN", "A", 907, 53.44, 51.0, 50.0, "HETATM"),
        _atom_line(7,  "O1",  "MAN", "A", 907, 53.44, 50.0, 51.44, "HETATM"),
        _link_line("OG", "A", 195, "C1", "A", 907),
    ]
    return "".join(lines)


# ---------------------------------------------------------------------------
# Tests: N-linked glycan renaming
# ---------------------------------------------------------------------------

class TestNLinkedRenaming:
    def test_asn_renamed_to_nln(self):
        result, _ = rename_glycam_residues(_n_linked_nag_pdb())
        # All ASN A400 atoms should now be NLN
        for line in result.splitlines():
            if "A 400" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                assert resname == "NLN", f"Expected NLN, got {resname!r}: {line!r}"

    def test_nag_renamed_to_glycam_code(self):
        result, _ = rename_glycam_residues(_n_linked_nag_pdb())
        for line in result.splitlines():
            if "A 903" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                # Should be 0NB (terminal beta GlcNAc) or 0NA (alpha)
                assert resname.startswith("0N"), f"Expected 0N*, got {resname!r}: {line!r}"

    def test_log_mentions_nln(self):
        _, log = rename_glycam_residues(_n_linked_nag_pdb())
        combined = "\n".join(log)
        assert "NLN" in combined
        assert "400" in combined

    def test_non_glycosylated_asn_not_renamed(self):
        # An ASN not in any LINK record should stay ASN
        lines = [_atom_line(1, "ND2", "ASN", "A", 99, 0.0, 0.0, 0.0)]
        result, log = rename_glycam_residues("".join(lines))
        assert "ASN" in result
        assert "NLN" not in result
        assert log == []


# ---------------------------------------------------------------------------
# Tests: O-linked glycan renaming (Thr)
# ---------------------------------------------------------------------------

class TestOLinkedThrRenaming:
    def test_thr_renamed_to_olt(self):
        result, _ = rename_glycam_residues(_o_linked_man_thr_pdb())
        for line in result.splitlines():
            if "A 197" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                assert resname == "OLT", f"Expected OLT, got {resname!r}"

    def test_man_renamed_to_glycam_code(self):
        result, _ = rename_glycam_residues(_o_linked_man_thr_pdb())
        for line in result.splitlines():
            if "A 908" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                assert resname.startswith("0M"), f"Expected 0M*, got {resname!r}"

    def test_log_mentions_olt(self):
        _, log = rename_glycam_residues(_o_linked_man_thr_pdb())
        combined = "\n".join(log)
        assert "OLT" in combined


# ---------------------------------------------------------------------------
# Tests: O-linked glycan renaming (Ser)
# ---------------------------------------------------------------------------

class TestOLinkedSerRenaming:
    def test_ser_renamed_to_ols(self):
        result, _ = rename_glycam_residues(_o_linked_man_ser_pdb())
        for line in result.splitlines():
            if "A 195" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                assert resname == "OLS", f"Expected OLS, got {resname!r}"

    def test_man_renamed_to_glycam_code(self):
        result, _ = rename_glycam_residues(_o_linked_man_ser_pdb())
        for line in result.splitlines():
            if "A 907" in line and line.startswith(("ATOM", "HETATM")):
                resname = line[17:20].strip()
                assert resname.startswith("0M"), f"Expected 0M*, got {resname!r}"


# ---------------------------------------------------------------------------
# Tests: non-sugar / non-protein lines are preserved unchanged
# ---------------------------------------------------------------------------

class TestPreservation:
    def test_remark_lines_unchanged(self):
        pdb = "REMARK   some remark\n" + _n_linked_nag_pdb()
        result, _ = rename_glycam_residues(pdb)
        assert "REMARK   some remark" in result

    def test_link_lines_unchanged(self):
        pdb = _n_linked_nag_pdb()
        result, _ = rename_glycam_residues(pdb)
        # LINK records should be preserved verbatim
        original_links = [l for l in pdb.splitlines() if l.startswith("LINK")]
        result_links = [l for l in result.splitlines() if l.startswith("LINK")]
        assert original_links == result_links

    def test_empty_pdb_returns_empty(self):
        result, log = rename_glycam_residues("")
        assert result == ""
        assert log == []

    def test_protein_only_pdb_unchanged(self):
        pdb = _atom_line(1, "CA", "GLN", "A", 1, 0.0, 0.0, 0.0)
        result, log = rename_glycam_residues(pdb)
        assert "GLN" in result
        assert log == []


# ---------------------------------------------------------------------------
# Tests: anomer determination
# ---------------------------------------------------------------------------

class TestAnomerDetermination:
    def _make_residue(
        self, resname: str,
        c1: tuple, c2: tuple, o5: tuple, o1: tuple,
    ) -> Residue:
        res = Residue(resname=resname, chain_id="A", resseq=1, icode="")
        for i, (name, coords) in enumerate(
            [("C1", c1), ("C2", c2), ("O5", o5), ("O1", o1)]
        ):
            x, y, z = coords
            res.atoms.append(Atom(
                record="HETATM", serial=i + 1, name=name, alt_loc=" ",
                resname=resname, chain_id="A", resseq=1, icode="",
                x=x, y=y, z=z, occupancy=1.0, bfactor=0.0, element="",
                line_index=i,
            ))
        return res

    def test_alpha_when_o1_same_side_as_normal(self):
        # Simple geometry: ring in XY plane, O5 and O1 both on +Z side → alpha
        res = self._make_residue(
            "MAN",
            c1=(0.0, 0.0, 0.0),
            c2=(1.5, 0.0, 0.0),
            o5=(0.0, 1.5, 0.0),
            o1=(0.0, 0.0, 1.5),   # +Z: same side as cross(C1→C2, C1→O5) = +Z
        )
        assert _is_alpha_anomer(res) is True

    def test_beta_when_o1_opposite_side(self):
        res = self._make_residue(
            "MAN",
            c1=(0.0, 0.0, 0.0),
            c2=(1.5, 0.0, 0.0),
            o5=(0.0, 1.5, 0.0),
            o1=(0.0, 0.0, -1.5),  # -Z: opposite side
        )
        assert _is_alpha_anomer(res) is False

    def test_fallback_to_default_when_atoms_missing(self):
        # MAN with no O1 atom → falls back to DEFAULT_ALPHA (MAN is in that set)
        res = Residue(resname="MAN", chain_id="A", resseq=1, icode="")
        assert _is_alpha_anomer(res) is True

    def test_nag_default_beta(self):
        # NAG with no coordinates → DEFAULT_BETA
        res = Residue(resname="NAG", chain_id="A", resseq=1, icode="")
        assert _is_alpha_anomer(res) is False
