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


# ------------------------------------------------- mass counted by residue

from Bio.SeqUtils import molecular_weight  # noqa: E402

from pdb_utils import (  # noqa: E402
    psf_composition,
    residue_composition,
    sequence_composition,
)

THREE = {
    "A": "ALA", "R": "ARG", "N": "ASN", "D": "ASP", "C": "CYS", "Q": "GLN",
    "E": "GLU", "G": "GLY", "H": "HIS", "I": "ILE", "L": "LEU", "K": "LYS",
    "M": "MET", "F": "PHE", "P": "PRO", "S": "SER", "T": "THR", "W": "TRP",
    "Y": "TYR", "V": "VAL",
}  # fmt: skip


def backbone_only(sequence, chain="A", segid="PROA", start=1):
    """One CA atom per residue: a model with no hydrogens or side chains."""
    return [
        atom_line(i + 1, "CA", THREE[letter], chain, start + i, segid=segid)
        for i, letter in enumerate(sequence)
    ]


def test_residue_mass_does_not_depend_on_which_atoms_are_listed(tmp_path):
    # Deposited and predicted structures have no hydrogens; summing their
    # atoms reads about 7 % light. Every standard residue counts in full.
    sequence = "ACDEFGHIKLMNPQRSTVWY"
    path = write_pdb(tmp_path, backbone_only(sequence))

    composition = residue_composition(path)

    assert composition["n_residues"] == 20
    assert composition["total_da"] == pytest.approx(
        molecular_weight(sequence, seq_type="protein"), rel=1e-6
    )
    assert composition["protein_da"] == composition["total_da"]
    # The atom sum sees twenty carbons
    assert calculate_molecular_weight(path) == pytest.approx(20 * C)


def test_residue_mass_counts_each_chain_and_segment(tmp_path):
    lines = backbone_only("GAG", chain="A", segid="PROA") + backbone_only(
        "GAG", chain="B", segid="PROB"
    )
    composition = residue_composition(write_pdb(tmp_path, lines))
    assert composition["total_da"] == pytest.approx(
        2 * molecular_weight("GAG", seq_type="protein"), rel=1e-6
    )


def test_residue_mass_handles_charmm_names_and_shared_chain_letters(tmp_path):
    # HSD is histidine; PROA and DNAA share chain A and residue numbers
    lines = [
        atom_line(1, "CA", "HSD", "A", 22, segid="PROA"),
        atom_line(2, "P", "ADE", "A", 22, segid="DNAA"),
        atom_line(3, "P", "THY", "A", 23, segid="DNAA"),
    ]
    composition = residue_composition(write_pdb(tmp_path, lines))
    assert composition["n_residues"] == 3
    assert composition["protein_da"] == pytest.approx(
        molecular_weight("H", seq_type="protein"), rel=1e-6
    )
    assert composition["nucleic_da"] == pytest.approx(
        molecular_weight("AT", seq_type="DNA"), rel=1e-6
    )


def test_residue_mass_tells_rna_from_dna_by_the_sugar(tmp_path):
    # CHARMM calls both ribo- and deoxyribo-adenosine ADE
    rna = [
        atom_line(1, "P", "ADE", "A", 1, segid="RNAA"),
        atom_line(2, "O2'", "ADE", "A", 1, segid="RNAA"),
    ]
    dna = [atom_line(1, "P", "ADE", "A", 1, segid="DNAA")]
    rna_mass = residue_composition(write_pdb(tmp_path, rna, "rna.pdb"))["total_da"]
    dna_mass = residue_composition(write_pdb(tmp_path, dna, "dna.pdb"))["total_da"]
    assert rna_mass == pytest.approx(molecular_weight("A", seq_type="RNA"), rel=1e-6)
    assert dna_mass == pytest.approx(molecular_weight("A", seq_type="DNA"), rel=1e-6)
    assert rna_mass - dna_mass == pytest.approx(15.999, abs=0.01)


def test_residue_mass_falls_back_to_atoms_for_other_residues(tmp_path):
    lines = backbone_only("GG") + [
        atom_line(3, "ZN", "ZN", "X", 1, record="HETATM", left_justified=True),
        atom_line(4, "C1", "NAG", "X", 2, record="HETATM"),
        atom_line(5, "O", "HOH", "W", 3, record="HETATM"),
    ]
    composition = residue_composition(write_pdb(tmp_path, lines))
    assert composition["other_da"] == pytest.approx(ATOMIC_WEIGHTS["ZN"] + C)
    assert composition["protein_da"] == pytest.approx(
        molecular_weight("GG", seq_type="protein"), rel=1e-6
    )


def test_residue_mass_counts_a_residue_with_conformers_once(tmp_path):
    lines = [
        atom_line(1, "CA", "SER", "A", 5),
        atom_line(2, "CB", "SER", "A", 5, altloc="A"),
        atom_line(3, "CB", "SER", "A", 5, altloc="B"),
    ]
    composition = residue_composition(write_pdb(tmp_path, lines))
    assert composition["n_residues"] == 1
    assert composition["n_atoms"] == 2


def test_residue_mass_of_a_file_without_atoms_is_an_error(tmp_path):
    path = tmp_path / "empty.pdb"
    path.write_text("REMARK nothing here\nEND\n")
    with pytest.raises(ValueError, match="No atoms"):
        residue_composition(path)


PSF = """PSF EXT CMAP

         2 !NTITLE
* A TEST
* PSF

         5 !NATOM
         1 PROA     1        GLY      N        NH3     -0.300000       14.0070           0
         2 PROA     1        GLY      CA       CT2      0.130000       12.0110           0
         3 DNAA     1        ADE      P        P        1.500000       30.9740           0
         4 SOLV     1        TIP3     OH2      OT      -0.834000       15.9994           0
         5 MG       1        MG       MG       MG       2.000000       24.3050           0

         4 !NBOND: bonds
         1         2         2         3
"""


def test_psf_masses_are_summed_by_molecule_type(tmp_path):
    path = tmp_path / "model.psf"
    path.write_text(PSF)

    composition = psf_composition(path)

    assert composition["n_atoms"] == 4  # water is not counted
    assert composition["protein_da"] == pytest.approx(14.007 + 12.011)
    assert composition["nucleic_da"] == pytest.approx(30.974)
    assert composition["other_da"] == pytest.approx(24.305)


@pytest.mark.parametrize("content", ["", "PSF\n\n       0 !NATOM\n", "not a psf\n"])
def test_a_psf_without_atoms_is_an_error(tmp_path, content):
    path = tmp_path / "bad.psf"
    path.write_text(content)
    with pytest.raises(ValueError, match="No atoms"):
        psf_composition(path)


def test_sequence_masses_count_copies_and_types():
    composition = sequence_composition(
        [
            {"type": "Protein", "sequence": "mkt ay\nIAK", "copies": 2},
            {"type": "DNA", "sequence": "ACGT"},
            {"type": "RNA", "sequence": "ACGU", "copies": 1},
        ]
    )
    protein = 2 * molecular_weight("MKTAYIAK", seq_type="protein")
    nucleic = molecular_weight("ACGT", seq_type="DNA") + molecular_weight(
        "ACGU", seq_type="RNA"
    )
    assert composition["protein_da"] == pytest.approx(protein)
    assert composition["nucleic_da"] == pytest.approx(nucleic)
    assert composition["total_da"] == pytest.approx(protein + nucleic)


@pytest.mark.parametrize(
    "entities",
    [
        [],
        [{"type": "Protein", "sequence": ""}],
        [{"type": "Lipid", "sequence": "AAA"}],
        [{"type": "Protein", "sequence": "MK1"}],
        [{"type": "Protein", "sequence": "MKT", "copies": 0}],
    ],
    ids=["none", "empty", "unknown type", "bad letter", "no copies"],
)
def test_unusable_sequences_are_an_error(entities):
    with pytest.raises(ValueError):
        sequence_composition(entities)
