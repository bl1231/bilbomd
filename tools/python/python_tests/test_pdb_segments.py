"""Tests for insert_ter_records, which gives OpenMM the molecules CHARMM builds."""

from pdb_segments import insert_ter_records


def atom(name, resname, chain, resseq, x, segid=""):
    name_field = name if len(name) == 4 else f" {name}"
    return (
        f"ATOM  {1:5d} {name_field:<4s} {resname:>3s} {chain}{resseq:4d}    "
        f"{x:8.3f}{50.0:8.3f}{0.0:8.3f}{1.0:6.2f}{0.0:6.2f}      {segid:<4s}\n"
    )


def backbone(chain, resseq, x, segid=""):
    return [
        atom(name, "ALA", chain, resseq, x + dx, segid)
        for name, dx in (("N", 0.0), ("CA", 1.2), ("C", 2.47))
    ]


def test_adds_ter_at_a_protein_chain_break():
    before = backbone("A", 1, 0.0) + backbone("A", 2, 3.8)
    after = backbone("A", 10, 40.0)
    lines, added = insert_ter_records(before + after)
    assert added == 1
    assert lines == before + ["TER\n"] + after


def test_adds_ter_at_a_segid_change():
    first = backbone("D", 1, 0.0, "DNAA")
    second = backbone("D", 2, 3.8, "DNAB")
    lines, added = insert_ter_records(first + second)
    assert added == 1
    assert lines == first + ["TER\n"] + second


def test_leaves_a_bonded_chain_and_existing_ters_alone():
    chain = backbone("A", 1, 0.0) + backbone("A", 2, 3.8)
    other = backbone("A", 1, 100.0)
    lines = chain + ["TER\n"] + other + ["TER\n", "END\n"]
    assert insert_ter_records(lines) == (lines, 0)
