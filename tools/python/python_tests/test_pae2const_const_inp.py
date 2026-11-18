# tools/python/python_tests/test_pae2const_const_inp.py
"""
Tests for how pae2const.py writes const.inp.

CHARMM cuts input lines over 200 characters short, and the MD steps run with
"bomlev -2", so a cut-short "cons fix" or "shape desc" command is skipped and
its constraint silently dropped. Long commands must be wrapped with CHARMM's
" -" continuation mark.
"""

import sys
from pathlib import Path

import pytest

_TOOLS_PYTHON = Path(__file__).resolve().parents[1]
if str(_TOOLS_PYTHON) not in sys.path:
    sys.path.insert(0, str(_TOOLS_PYTHON))

import pae2const  # noqa: E402


def _join_continuations(lines):
    """Join lines ending in '-' the way CHARMM reads them (no space added)."""
    commands, pending = [], ""
    for line in lines:
        text = pending + line
        if text.rstrip(" ").endswith("-"):
            pending = text.rstrip(" ")[:-1]
            continue
        commands.append(text)
        pending = ""
    return commands


def test_wrap_leaves_a_short_command_alone():
    assert pae2const.wrap_charmm_command("cons fix sele fixed1 end") == [
        "cons fix sele fixed1 end"
    ]


def test_wrap_keeps_lines_within_the_width_and_reads_back():
    names = " .or. ".join(f"fixed{i}" for i in range(1, 31))
    command = f"cons fix sele {names} end"
    lines = pae2const.wrap_charmm_command(command)
    assert len(lines) > 1
    assert all(len(line) <= pae2const.CONST_INP_WRAP_WIDTH for line in lines)
    assert all(line.endswith(" -") for line in lines[:-1])
    assert _join_continuations(lines) == [command]


def test_wrap_puts_an_over_long_word_on_its_own_line():
    assert pae2const.wrap_charmm_command(f"a {'x' * 20} b", width=10) == [
        "a -",
        f"{'x' * 20} -",
        "b",
    ]


def test_const_file_wraps_many_domains(tmp_path):
    # First rigid body -> cons fix; later ones -> shape desc
    fixed = [(i * 10 + 1, i * 10 + 5, "A", 90.0) for i in range(20)]
    rigid = [(300 + i * 10, 304 + i * 10, "B", 90.0) for i in range(15)]
    out = tmp_path / "const.inp"

    pae2const.PAEProcessor._write_const_file([fixed, rigid], str(out))

    lines = out.read_text(encoding="utf8").splitlines()
    assert all(len(line) <= pae2const.CONST_INP_WRAP_WIDTH for line in lines)

    commands = [c.strip() for c in _join_continuations(lines) if c.strip()]
    fixed_names = " .or. ".join(f"fixed{i}" for i in range(1, 21))
    rigid_names = " .or. ".join(f"rigid{i}" for i in range(1, 16))
    assert f"cons fix sele {fixed_names} end" in commands
    assert f"shape desc dock1 rigid sele {rigid_names} end" in commands
    assert commands[-1] == "return"


def test_const_file_keeps_a_small_body_on_one_line(tmp_path):
    out = tmp_path / "const.inp"
    pae2const.PAEProcessor._write_const_file(
        [[(1, 50, "A", 90.0)], [(60, 90, "A", 90.0)]], str(out)
    )
    assert out.read_text(encoding="utf8").splitlines() == [
        "define fixed1 sele ( resid 1:50 .and. segid A ) end",
        "cons fix sele fixed1 end",
        "",
        "define rigid1 sele ( resid 60:90 .and. segid A ) end",
        "shape desc dock1 rigid sele rigid1 end",
        "",
        "return ",
        "",
    ]


def test_wrap_rejects_a_command_charmm_cuts_short():
    # Short lines don't help: CHARMM limits the joined command too
    names = " .or. ".join(f"fixed{i}" for i in range(1, 401))
    command = f"cons fix sele {names} end"
    assert len(command) > pae2const.MAX_CONST_INP_COMMAND_LENGTH
    with pytest.raises(ValueError, match="more than the 5000 CHARMM accepts"):
        pae2const.wrap_charmm_command(command)


def test_wrap_accepts_a_command_at_the_limit():
    command = "x" * pae2const.MAX_CONST_INP_COMMAND_LENGTH
    assert pae2const.wrap_charmm_command(command) == [command]


def test_const_file_with_too_many_domains_is_not_written(tmp_path):
    fixed = [(i * 10 + 1, i * 10 + 5, "A", 90.0) for i in range(400)]
    out = tmp_path / "const.inp"
    with pytest.raises(ValueError):
        pae2const.PAEProcessor._write_const_file([fixed], str(out))
    assert not out.exists()


def _peptide(chain, first_resseq, count, x0=0.0):
    """Backbone N, CA, C per residue along x; C(i)-N(i+1) is 1.33 A."""
    lines = []
    for i in range(count):
        x = x0 + 3.8 * i
        for name, dx in (("N", 0.0), ("CA", 1.2), ("C", 2.47)):
            lines.append(
                f"ATOM      1  {name:<3s} ALA {chain}{first_resseq + i:4d}    "
                f"{x + dx:8.3f}{50.0:8.3f}{0.0:8.3f}  1.00  0.00\n"
            )
    return lines


def test_const_file_selects_both_sides_of_a_chain_break(tmp_path):
    """
    pdb2crd builds chain A with a missing loop as PROA (1-4) and PROB
    (20-22), so a domain over the break is selected in both segments, and
    one past it in PROB, not PROA (issue #1331).
    """
    pdb = tmp_path / "model.pdb"
    pdb.write_text(
        "".join(_peptide("A", 1, 4) + _peptide("A", 20, 3, x0=3.8 * 4 + 30.0)),
        encoding="utf-8",
    )
    out = tmp_path / "const.inp"
    fixed = [(2, 21, "A", 90.0)]
    rigid = [(20, 22, "A", 90.0)]

    pae2const.PAEProcessor._write_const_file([fixed, rigid], str(out), str(pdb))

    assert out.read_text(encoding="utf8").splitlines() == [
        "define fixed1 sele ( resid 2:4 .and. segid PROA ) end",
        "define fixed2 sele ( resid 20:21 .and. segid PROB ) end",
        "cons fix sele fixed1 .or. fixed2 end",
        "",
        "define rigid1 sele ( resid 20:22 .and. segid PROB ) end",
        "shape desc dock1 rigid sele rigid1 end",
        "",
        "return ",
        "",
    ]


def test_const_file_names_an_unsplit_chain_as_before(tmp_path):
    pdb = tmp_path / "model.pdb"
    pdb.write_text("".join(_peptide("A", 1, 5)), encoding="utf-8")
    out = tmp_path / "const.inp"

    pae2const.PAEProcessor._write_const_file(
        [[(1, 5, "A", 90.0)]], str(out), str(pdb)
    )

    assert out.read_text(encoding="utf8").splitlines()[0] == (
        "define fixed1 sele ( resid 1:5 .and. segid PROA ) end"
    )
