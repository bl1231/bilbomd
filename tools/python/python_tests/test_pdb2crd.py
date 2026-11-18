"""Tests for how pdb2crd splits a PDB file into CHARMM segments (issue #1331)."""

import re

import pytest

from pdb2crd import read_raw_segments, split_and_process_pdb


def atom_line(serial, name, resname, chain, resseq, xyz, segid="", record="ATOM"):
    """A fixed-column PDB ATOM/HETATM line."""
    name_field = name if len(name) == 4 else f" {name}"
    x, y, z = xyz
    return (
        f"{record:<6s}{serial:5d} {name_field:<4s} {resname:>3s} {chain}{resseq:4d}    "
        f"{x:8.3f}{y:8.3f}{z:8.3f}{1.0:6.2f}{0.0:6.2f}      {segid:<4s}\n"
    )


def nucleotide(resname, chain, resseq, origin, segid="", with_p=True, serial=1):
    """
    A nucleotide's backbone atoms along x. O3' sits 1.6 A before the next
    residue's P (origin + 6 A), so consecutive residues built 6 A apart are
    bonded.
    """
    ox, oy, oz = origin
    atoms = [("O5'", (ox + 0.8, oy, oz)), ("C5'", (ox + 2.0, oy, oz)),
             ("O3'", (ox + 4.4, oy, oz))]  # fmt: skip
    if with_p:
        atoms.insert(0, ("P", (ox, oy, oz)))
    return [
        atom_line(serial + i, name, resname, chain, resseq, xyz, segid)
        for i, (name, xyz) in enumerate(atoms)
    ]


def strand(chain, first_resseq, count, origin, segid="", first_has_p=False):
    lines = []
    for i in range(count):
        lines += nucleotide(
            "DA",
            chain,
            first_resseq + i,
            (origin[0] + 6.0 * i, origin[1], origin[2]),
            segid,
            with_p=first_has_p or i > 0,
        )
    return lines


def protein(chain, first_resseq, count, segid=""):
    return [
        atom_line(1, "CA", "GLY", chain, first_resseq + i, (3.8 * i, 50.0, 0.0), segid)
        for i in range(count)
    ]


def run(tmp_path, lines, name="model.pdb"):
    """Runs pdb2crd; returns {segid: generate line} and the meld input text."""
    pdb = tmp_path / name
    pdb.write_text("".join(lines) + "END\n")
    out = tmp_path / "out"
    out.mkdir()
    split_and_process_pdb(str(pdb), str(out))
    generates = {}
    for inp in out.glob("pdb2crd_charmm_*.inp"):
        if inp.name == "pdb2crd_charmm_meld.inp":
            continue
        match = re.search(r"^generate (\S+) (.*)$", inp.read_text(), re.M)
        generates[match.group(1)] = match.group(2)
    return generates, (out / "pdb2crd_charmm_meld.inp").read_text(), out


FAR = (0.0, 0.0, 40.0)  # a second strand well away from the first


def test_one_strand_is_one_segment(tmp_path):
    generates, _, _ = run(tmp_path, strand("D", 1, 4, (0, 0, 0)))
    assert list(generates) == ["DNAD"]


def test_strand_missing_p_but_bonded_through_o5_is_not_split():
    lines = strand("D", 1, 2, (0, 0, 0))
    # Drop the second residue's P; O3'(1)-O5'(2) is still 2.4 A
    lines = [
        line for line in lines if not (line[12:16] == " P  " and line[22:26] == "   2")
    ]
    assert len(read_raw_segments(lines)) == 1


def test_strands_with_different_segids_are_separate_segments(tmp_path, capsys):
    """The old pro_dna.pdb case: segids DNAA and DNAB, both chain D, no TER."""
    lines = (
        protein("P", 1, 3, segid="PROA")
        + strand("D", 22, 3, (0, 0, 0), segid="DNAA")
        + strand("D", 60, 3, FAR, segid="DNAB")
    )
    generates, meld, out = run(tmp_path, lines)

    # First segment of chain D keeps the chain ID; the second takes the
    # letter of its own segid
    assert generates == {
        "PROP": "setup warn first none last CTER",
        "DNAD": "setup warn first 5TER last 3TER",
        "DNAB": "setup warn first 5TER last 3TER",
    }
    assert re.findall(r"card name bilbomd_pdb2crd_(\w+)\.psf", meld) == [
        "PROP",
        "DNAD",
        "DNAB",
    ]
    # Each strand's PDB holds only its own residues
    second = (out / "pdb2crd_seg_dnab_uc_model.pdb").read_text()
    assert {
        line[22:26].strip() for line in second.splitlines() if line.startswith("ATOM")
    } == {
        "60",
        "61",
        "62",
    }
    assert "offset -59" in (out / "pdb2crd_charmm_dnab.inp").read_text()

    err = capsys.readouterr().err
    assert "Chain D holds 2 separate molecules" in err
    assert "DNAB (residues 60-62, split at segid change DNAA -> DNAB)" in err


def test_ter_separates_strands_with_the_same_chain_id(tmp_path):
    lines = (
        strand("D", 1, 3, (0, 0, 0))
        + ["TER\n"]
        + strand("D", 4, 3, (18.0, 0, 0), first_has_p=True)
    )
    # The second strand would be bonded to the first by distance alone (6 A
    # steps continue), so only the TER splits them
    generates, _, _ = run(tmp_path, lines)
    # No segid letter to use, so the first letter no chain uses
    assert sorted(generates) == ["DNAA", "DNAD"]


def test_unbonded_strands_without_ter_or_segids_are_split(tmp_path, capsys):
    lines = strand("D", 22, 3, (0, 0, 0)) + strand("D", 60, 3, FAR, first_has_p=True)
    generates, _, _ = run(tmp_path, lines)
    assert sorted(generates) == ["DNAA", "DNAD"]
    assert "split at O3'-P gap" in capsys.readouterr().err


def test_split_off_segment_skips_letters_other_chains_use(tmp_path):
    lines = (
        protein("A", 1, 3)
        + strand("D", 1, 3, (0, 0, 0), segid="DNAD")
        + strand("D", 60, 3, FAR, segid="DNAA")
    )
    generates, _, _ = run(tmp_path, lines)
    # Segid letter A is chain A's, so the next free letter, B, is used
    assert sorted(generates) == ["DNAB", "DNAD", "PROA"]


def test_glycan_after_ter_gets_its_own_segment(tmp_path):
    lines = (
        protein("A", 1, 3)
        + ["TER\n"]
        + [atom_line(10, "C1", "NAG", "A", 901, (0.0, 0.0, 0.0), record="HETATM")]
    )
    generates, _, _ = run(tmp_path, lines)
    assert sorted(generates) == ["CARA", "PROA"]


def test_ions_after_ter_do_not_use_a_segment(tmp_path, capsys):
    lines = (
        protein("C", 1, 3)
        + ["TER\n"]
        + [atom_line(10, "ZN", "ZN", "C", 436, (0.0, 0.0, 0.0), record="HETATM")]
    )
    generates, _, _ = run(tmp_path, lines)
    # The ion no longer counts towards the protein's residue types, so the
    # chain ends in CTER
    assert generates == {"PROC": "setup warn first none last CTER"}
    assert "WARNING" not in capsys.readouterr().err


def test_prints_one_inp_per_segment(tmp_path, capsys):
    lines = strand("D", 22, 2, (0, 0, 0), segid="DNAA") + strand(
        "D", 60, 2, FAR, segid="DNAB"
    )
    run(tmp_path, lines)
    assert capsys.readouterr().out.split() == [
        "pdb2crd_charmm_dnad.inp",
        "pdb2crd_charmm_dnab.inp",
    ]


@pytest.mark.parametrize("record", ["TER", "TER    1234      DA D   3"])
def test_ter_with_or_without_chain_fields(record):
    lines = (
        strand("D", 1, 3, (0, 0, 0)) + [record + "\n"] + strand("D", 4, 2, (18, 0, 0))
    )
    assert len(read_raw_segments(lines)) == 2
