"""Tests for utils.rg_atoms: which atoms the MD Rg restraint acts on.

DNA-only models have no CA atoms; selecting CA alone gave an empty Rg
selection and every md.py run crashed at its first Rg/Dmax report.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from utils.rg_atoms import is_rg_atom, select_rg_atom_indices

AMINO_ACID = ("N", "CA", "C", "O", "CB")
NUCLEOTIDE = ("P", "OP1", "OP2", "O5'", "C5'", "C4'", "C1'", "N9")
SYMBOLS = {"P": "P", "N": "N", "N9": "N", "O": "O"}


class FakeResidue:
    def __init__(self, name: str):
        self.name = name
        self._atoms: list[SimpleNamespace] = []

    def atoms(self):
        return iter(self._atoms)


class Builder:
    """Builds atoms with consecutive indices across residues, like a Topology."""

    def __init__(self):
        self.atoms: list[SimpleNamespace] = []

    def residue(self, res_name: str, atom_names, symbols: dict[str, str | None] | None = None):
        residue = FakeResidue(res_name)
        for name in atom_names:
            symbol = (symbols or {}).get(name, SYMBOLS.get(name, name[0]))
            element = None if symbol is None else SimpleNamespace(symbol=symbol)
            atom = SimpleNamespace(index=len(self.atoms), name=name, element=element, residue=residue)
            residue._atoms.append(atom)
            self.atoms.append(atom)
        return self

    def names_of(self, indices):
        return [(self.atoms[i].residue.name, self.atoms[i].name) for i in indices]


def test_dna_only_model_selects_one_p_per_nucleotide():
    b = Builder().residue("DA", NUCLEOTIDE).residue("DT", NUCLEOTIDE).residue("DG", NUCLEOTIDE)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("DA", "P"), ("DT", "P"), ("DG", "P")]


def test_protein_only_model_selection_is_unchanged():
    b = Builder().residue("ALA", AMINO_ACID).residue("GLY", AMINO_ACID)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("ALA", "CA"), ("GLY", "CA")]


def test_protein_dna_complex_selects_both():
    b = Builder().residue("ALA", AMINO_ACID).residue("DC", NUCLEOTIDE).residue("LYS", AMINO_ACID)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [
        ("ALA", "CA"),
        ("DC", "P"),
        ("LYS", "CA"),
    ]


def test_rna_and_old_style_sugar_names_count_as_nucleotides():
    old_style = tuple("C1*" if n == "C1'" else n for n in NUCLEOTIDE)
    b = Builder().residue("U", NUCLEOTIDE).residue("DA", old_style)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("U", "P"), ("DA", "P")]


def test_five_prime_nucleotide_without_p_is_skipped():
    no_phosphate = tuple(n for n in NUCLEOTIDE if n not in {"P", "OP1", "OP2"})
    b = Builder().residue("DA", no_phosphate).residue("DT", NUCLEOTIDE)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("DT", "P")]


def test_phosphoserine_p_is_not_a_nucleotide_p():
    b = Builder().residue("SEP", AMINO_ACID + ("OG", "P", "O1P"))
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("SEP", "CA")]


def test_calcium_ion_named_ca_is_excluded():
    b = Builder().residue("ALA", AMINO_ACID).residue("CA", ("CA",), {"CA": "Ca"})
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("ALA", "CA")]


def test_glycan_atoms_are_excluded():
    b = Builder().residue("NAG", ("C1", "C2", "O5", "N2")).residue("ASN", AMINO_ACID)
    assert b.names_of(select_rg_atom_indices(b.atoms)) == [("ASN", "CA")]


def test_unknown_element_falls_back_to_the_atom_name():
    b = Builder().residue("ALA", AMINO_ACID, {"CA": None}).residue("DA", NUCLEOTIDE, {"P": None})
    assert all(is_rg_atom(b.atoms[i]) for i in select_rg_atom_indices(b.atoms))
    assert len(select_rg_atom_indices(b.atoms)) == 2


def test_no_protein_or_nucleic_acid_raises_a_clear_error():
    b = Builder().residue("NAG", ("C1", "C2", "O5")).residue("HOH", ("O",))
    with pytest.raises(ValueError, match="No protein CA or nucleic acid P atoms"):
        select_rg_atom_indices(b.atoms)


def test_real_openmm_topology_dna_and_protein():
    """Same selection on a real openmm.app.Topology (worker image only)."""
    app = pytest.importorskip("openmm.app")
    element = app.Element.getBySymbol
    topology = app.Topology()
    chain = topology.addChain("A")
    for res_name, atom_names in (("ALA", AMINO_ACID), ("DG", NUCLEOTIDE), ("CA", ("CA",))):
        residue = topology.addResidue(res_name, chain)
        for name in atom_names:
            symbol = "Ca" if res_name == "CA" else SYMBOLS.get(name, name[0])
            topology.addAtom(name, element(symbol), residue)

    atoms = list(topology.atoms())
    picked = [(atoms[i].residue.name, atoms[i].name) for i in select_rg_atom_indices(topology.atoms())]
    assert picked == [("ALA", "CA"), ("DG", "P")]
