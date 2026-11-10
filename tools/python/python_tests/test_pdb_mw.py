"""Tests for the model molecular-weight calculation in pdb_utils."""

import pytest

from pdb_utils import ATOMIC_WEIGHTS, calculate_molecular_weight, molecular_composition

H, C, N, OX, P = (ATOMIC_WEIGHTS[e] for e in "HCNOP")


def atom_line(
    serial,
    name,
    resname,
    chain,
    resseq,
    segid="",
    element="",
    record="ATOM",
    left_justified=False,
    altloc=" ",
):
    """A fixed-column PDB line. Short atom names start in column 14, as CHARMM writes them."""
    name_field = name if len(name) == 4 or left_justified else f" {name}"
    return (
        f"{record:<6s}{serial:5d} {name_field:<4s}{altloc}{resname:<4s}{chain}{resseq:4d}    "
        f"{0.0:8.3f}{0.0:8.3f}{0.0:8.3f}{1.0:6.2f}{0.0:6.2f}      "
        f"{segid:<4s}{element:>2s}"
    )


def write_pdb(tmp_path, lines, name="model.pdb"):
    path = tmp_path / name
    path.write_text("\n".join(lines) + "\n")
    return path


def test_line_layout_matches_the_pdb_format():
    line = atom_line(1, "CA", "GLY", "A", 22, segid="PROA", element="C")
    assert line[12:16] == " CA "
    assert line[16] == " "
    assert line[17:21].strip() == "GLY"
    assert line[21] == "A"
    assert line[72:76] == "PROA"
    assert line[76:78] == " C"


def test_counts_segments_that_share_a_chain_letter_and_residue_numbers(tmp_path):
    # CHARMM puts PROA and DNAA both in chain A, with overlapping residue
    # numbers. Biopython's PDBParser drops the second residue 22 as a
    # duplicate, which under-counted every protein-DNA complex.
    protein = [
        ("N", N),
        ("HN", H),
        ("CA", C),
        ("HA1", H),
        ("HA2", H),
        ("C", C),
        ("O", OX),
    ]
    dna = [
        ("P", P),
        ("O1P", OX),
        ("O5'", OX),
        ("C5'", C),
        ("H5'", H),
        ("H5''", H),
        ("N9", N),
    ]
    lines = [
        atom_line(i + 1, name, "GLY", "A", 22, segid="PROA")
        for i, (name, _) in enumerate(protein)
    ] + [
        atom_line(i + 8, name, "ADE", "A", 22, segid="DNAA")
        for i, (name, _) in enumerate(dna)
    ]
    path = write_pdb(tmp_path, lines)

    composition = molecular_composition(path)

    assert composition["n_atoms"] == 14
    assert composition["unknown_atoms"] == 0
    assert composition["protein_da"] == pytest.approx(sum(w for _, w in protein))
    assert composition["nucleic_da"] == pytest.approx(sum(w for _, w in dna))
    assert calculate_molecular_weight(path) == pytest.approx(
        sum(w for _, w in protein + dna)
    )


def test_atom_names_in_residues_are_never_read_as_metals(tmp_path):
    # CA, CD, CE, HE, HG, NE and NA(-like) names are carbons, hydrogens and
    # nitrogens inside a residue, not calcium, cadmium, cerium, helium, mercury...
    names = [
        ("CA", C),
        ("CD", C),
        ("CE", C),
        ("HE", H),
        ("HG", H),
        ("NE", N),
        ("HD11", H),
    ]
    lines = [
        atom_line(i + 1, name, "LYS", "A", 1, segid="PROA")
        for i, (name, _) in enumerate(names)
    ]
    assert calculate_molecular_weight(write_pdb(tmp_path, lines)) == pytest.approx(
        sum(w for _, w in names)
    )


def test_charmm_histidine_and_uracil_are_classified(tmp_path):
    lines = [
        atom_line(1, "CA", "HSD", "A", 1, segid="PROA"),
        atom_line(2, "N1", "URA", "B", 1, segid="RNAB"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["protein_da"] == pytest.approx(C)
    assert composition["nucleic_da"] == pytest.approx(N)
    assert composition["other_da"] == 0


def test_ions_are_recognised(tmp_path):
    lines = [
        atom_line(1, "MG", "MG", "X", 1, record="HETATM"),
        atom_line(2, "ZN", "ZN", "X", 2, record="HETATM", left_justified=True),
        atom_line(3, "CA", "CA", "X", 3, record="HETATM", left_justified=True),
        atom_line(4, "CL", "CL", "X", 4, record="HETATM"),
        # Heme: NA is a nitrogen, FE is iron
        atom_line(5, "NA", "HEM", "X", 5, record="HETATM"),
        atom_line(6, "FE", "HEM", "X", 5, record="HETATM"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    expected = sum(ATOMIC_WEIGHTS[e] for e in ("MG", "ZN", "CA", "CL", "N", "FE"))
    assert composition["other_da"] == pytest.approx(expected)
    assert composition["unknown_atoms"] == 0


def test_element_column_wins_when_present(tmp_path):
    # Without the element column this name would be read as carbon
    lines = [atom_line(1, "CA", "LIG", "X", 1, element="CA", record="HETATM")]
    assert calculate_molecular_weight(write_pdb(tmp_path, lines)) == pytest.approx(
        ATOMIC_WEIGHTS["CA"]
    )


def test_only_the_first_model_is_counted(tmp_path):
    model = [atom_line(1, "CA", "GLY", "A", 1), atom_line(2, "N", "GLY", "A", 1)]
    lines = ["MODEL        1", *model, "ENDMDL", "MODEL        2", *model, "ENDMDL"]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["n_atoms"] == 2
    assert composition["total_da"] == pytest.approx(C + N)


def test_alternate_conformers_are_counted_once(tmp_path):
    # A and B conformers of a side chain at half occupancy are one set of atoms
    lines = [
        atom_line(1, "N", "SER", "A", 5),
        atom_line(2, "CA", "SER", "A", 5),
        atom_line(3, "CB", "SER", "A", 5, altloc="A"),
        atom_line(4, "OG", "SER", "A", 5, altloc="A"),
        atom_line(5, "CB", "SER", "A", 5, altloc="B"),
        atom_line(6, "OG", "SER", "A", 5, altloc="B"),
        atom_line(7, "C", "SER", "A", 5),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["n_atoms"] == 5
    assert composition["total_da"] == pytest.approx(N + 3 * C + OX)


def test_alternate_conformers_are_chosen_per_residue(tmp_path):
    # The first conformer listed for a residue is the one counted, even when
    # that is B, and a point mutation modelled as two residue types counts one.
    lines = [
        atom_line(1, "CB", "SER", "A", 5, altloc="B"),
        atom_line(2, "CB", "SER", "A", 5, altloc="A"),
        atom_line(3, "CB", "VAL", "A", 6, altloc="A"),
        atom_line(4, "CG1", "VAL", "A", 6, altloc="A"),
        atom_line(5, "CB", "THR", "A", 6, altloc="B"),
        atom_line(6, "OG1", "THR", "A", 6, altloc="B"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["n_atoms"] == 3
    assert composition["total_da"] == pytest.approx(3 * C)


def test_alternate_conformers_do_not_merge_segments(tmp_path):
    # Same chain letter and residue number in two segments, each with
    # conformers: one conformer is counted for each segment.
    lines = [
        atom_line(1, "CA", "GLY", "A", 22, segid="PROA", altloc="A"),
        atom_line(2, "CA", "GLY", "A", 22, segid="PROA", altloc="B"),
        atom_line(3, "P", "ADE", "A", 22, segid="DNAA", altloc="B"),
        atom_line(4, "P", "ADE", "A", 22, segid="DNAA", altloc="C"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["n_atoms"] == 2
    assert composition["total_da"] == pytest.approx(C + P)


def test_water_is_not_counted(tmp_path):
    lines = [
        atom_line(1, "CA", "GLY", "A", 1),
        atom_line(2, "OH2", "TIP3", "W", 1),
        atom_line(3, "O", "HOH", "W", 2, record="HETATM"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["n_atoms"] == 1
    assert composition["total_da"] == pytest.approx(C)


def test_unknown_elements_are_reported_and_add_no_mass(tmp_path):
    lines = [
        atom_line(1, "CA", "GLY", "A", 1),
        atom_line(2, "XX1", "LIG", "X", 1, record="HETATM"),
    ]
    composition = molecular_composition(write_pdb(tmp_path, lines))
    assert composition["unknown_atoms"] == 1
    assert composition["total_da"] == pytest.approx(C)


@pytest.mark.parametrize("content", ["", "REMARK nothing here\nEND\n"])
def test_a_file_without_atoms_is_an_error(tmp_path, content):
    path = tmp_path / "empty.pdb"
    path.write_text(content)
    with pytest.raises(ValueError, match="No atoms"):
        molecular_composition(path)
