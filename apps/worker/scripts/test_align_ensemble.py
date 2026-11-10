"""Tests for align_ensemble.py on synthetic two-domain systems."""

import base64
import json

import numpy as np
import pytest

pytest.importorskip("igraph")

from align_ensemble import (  # noqa: E402
    align,
    distance_sd,
    encode_matrix,
    find_domains,
    kabsch,
    read_trace,
    residue_ranges,
    rmsd,
)

RNG = np.random.default_rng(7)
N_A, N_LINK, N_B = 60, 12, 40  # chain A domain, flexible linker (chain A), chain B domain


def random_rotation(rng) -> np.ndarray:
    q, r = np.linalg.qr(rng.normal(size=(3, 3)))
    q *= np.sign(np.diag(r))
    if np.linalg.det(q) < 0:
        q[:, 0] *= -1
    return q


BODY_A = RNG.normal(scale=8.0, size=(N_A, 3))
BODY_B = RNG.normal(scale=7.0, size=(N_B, 3))


def make_structure(rng, flexible=True) -> np.ndarray:
    """Body A fixed in its own frame, body B placed anywhere around it, a random linker,
    then the whole structure in an arbitrary orientation (as BioEmu2 writes it)."""
    b = BODY_B @ random_rotation(rng) + rng.normal(scale=25.0, size=3) if flexible else BODY_B + [30.0, 0, 0]
    link = rng.normal(scale=15.0, size=(N_LINK, 3))
    xyz = np.concatenate([BODY_A, link, b])
    return xyz @ random_rotation(rng) + rng.normal(scale=40.0, size=3)


def write_pdb(path, xyz, with_side_atom=False):
    lines = ["REMARK DCD2PDB_RG test 1.0 2.0\n"]
    serial = 1
    for i, p in enumerate(xyz):
        chain, number = ("A", i + 1) if i < N_A + N_LINK else ("B", i - N_A - N_LINK + 1)
        atoms = [("CA", p)] + ([("CB", p + [1.5, 0.0, 0.0])] if with_side_atom else [])
        for name, q in atoms:
            lines.append(
                f"ATOM  {serial:5d}  {name:<3s} ALA {chain}{number:4d}    {q[0]:8.3f}{q[1]:8.3f}{q[2]:8.3f}  1.00  0.00           C\n"
            )
            serial += 1
    lines.append("END\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines))
    return path


@pytest.fixture
def job(tmp_path):
    rng = np.random.default_rng(11)
    for i in range(40):
        write_pdb(tmp_path / "foxs" / f"rg{30 + i % 3}" / f"s{i:03d}.pdb", make_structure(rng))
    members = []
    for i in range(4):
        src = write_pdb(tmp_path / "polish" / f"m{i}.pdb", make_structure(rng), with_side_atom=True)
        members.append({"in": str(src), "out": str(tmp_path / "align" / f"m{i}.pdb")})
    return {"samples_dir": str(tmp_path / "foxs"), "members": members, "reference": members[1]["in"]}


def coords(path):
    return np.stack(list(read_trace(path).values()))


def test_kabsch_recovers_a_rigid_move():
    rot = random_rotation(RNG)
    moved = BODY_A @ rot + [3.0, -2.0, 9.0]
    r, t = kabsch(moved, BODY_A)
    assert rmsd(moved @ r + t, BODY_A) < 1e-9


def test_finds_the_two_rigid_bodies_and_leaves_the_linker_out():
    rng = np.random.default_rng(3)
    sd = distance_sd(np.stack([make_structure(rng) for _ in range(40)]))
    domains = find_domains(sd)
    assert [len(d) for d in domains] == [N_A, N_B]
    assert domains[0].tolist() == list(range(N_A))
    assert domains[1].tolist() == list(range(N_A + N_LINK, N_A + N_LINK + N_B))


@pytest.mark.parametrize("sigma", [0.3, 0.7, 0.9])
def test_finds_domains_that_are_not_perfectly_rigid(sigma):
    # Per-atom noise of sigma gives pair-distance spreads of about 1.4 * sigma inside a
    # body: up to ~1.3 Å here, still under the 1.5 Å cutoff. Real domains breathe like this.
    rng = np.random.default_rng(1)
    n = N_A + N_LINK + N_B
    sd = distance_sd(np.stack([make_structure(rng) + rng.normal(scale=sigma, size=(n, 3)) for _ in range(60)]))
    assert np.median(sd[:N_A, :N_A]) > sigma  # the bodies really do vary
    domains = find_domains(sd)
    assert [len(d) for d in domains] == [N_A, N_B]
    assert domains[0].tolist() == list(range(N_A))


def test_one_rigid_body_when_nothing_moves():
    rng = np.random.default_rng(5)
    sd = distance_sd(np.stack([make_structure(rng, flexible=False)[: N_A] for _ in range(20)]))
    domains = find_domains(sd)
    assert len(domains) == 1 and len(domains[0]) == N_A


def test_no_domains_for_a_disordered_system():
    rng = np.random.default_rng(9)
    sd = distance_sd(rng.normal(scale=20.0, size=(30, 50, 3)))
    assert find_domains(sd) == []


def test_residue_ranges():
    ids = [("A", n, " ") for n in (1, 2, 3, 7, 9, 10)] + [("B", 5, " ")]
    assert residue_ranges(ids) == ["A:1-3", "A:7-7", "A:9-10", "B:5-5"]


def test_encode_matrix_bins_large_systems():
    sd = np.full((1200, 1200), 10.0)
    sd[:600, :600] = 0.0
    m = encode_matrix(sd)
    assert (m["size"], m["bin"]) == (400, 3)
    data = np.frombuffer(base64.b64decode(m["data"]), dtype=np.uint8).reshape(400, 400)
    assert data[0, 0] == 0 and data[399, 399] == 128


def test_encode_matrix_keeps_small_systems_at_full_size():
    m = encode_matrix(np.full((7, 7), 40.0))
    assert (m["size"], m["bin"]) == (7, 1)
    assert set(base64.b64decode(m["data"])) == {255}


def test_align_superposes_members_on_the_anchor(job):
    report = align(job)

    assert report["method"] == "rigid-domain"
    assert report["samples"] == 40
    assert [d["size"] for d in report["domains"]] == [N_A, N_B]
    assert report["domains"][0]["residues"] == [f"A:1-{N_A}"]
    assert report["domains"][1]["residues"] == [f"B:1-{N_B}"]
    assert report["flexible"] == [f"A:{N_A + 1}-{N_A + N_LINK}"]
    assert report["anchor_size"] == N_A
    assert report["residue_domains"][:N_A] == [1] * N_A
    assert report["residue_domains"][N_A : N_A + N_LINK] == [0] * N_LINK
    assert report["residue_chains"][-1] == "B" and report["residue_numbers"][-1] == N_B
    assert report["matrix"]["size"] == N_A + N_LINK + N_B

    reference = coords(job["members"][1]["out"])
    assert np.allclose(reference[:N_A].mean(0), 0.0, atol=1e-3)  # anchor at the origin
    for member, entry in zip(job["members"], report["members"]):
        out = coords(member["out"])
        assert rmsd(out[:N_A], reference[:N_A]) < 0.01  # the anchor overlays (PDB precision)
        assert entry["anchor_rmsd"] < 0.01
    # the second body does not overlay: that is the variation to show
    assert report["members"][0]["overall_rmsd"] > 5.0


def test_align_moves_every_atom_and_keeps_the_other_lines(job):
    align(job)
    src = open(job["members"][0]["in"]).read().splitlines()
    out = open(job["members"][0]["out"]).read().splitlines()
    assert len(src) == len(out)
    assert out[0] == src[0] and out[-1] == "END"
    # internal geometry is unchanged: CA-CB distance stays 1.5 Å
    xyz = lambda line: np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])])  # noqa: E731
    assert abs(np.linalg.norm(xyz(out[1]) - xyz(out[2])) - 1.5) < 0.01
    assert out[1][:30] == src[1][:30] and out[1][54:] == src[1][54:]


def test_align_falls_back_to_all_residues_without_enough_samples(job, tmp_path):
    job["samples_dir"] = str(tmp_path / "nothing-here")
    report = align(job)
    assert report["method"] == "all-residues"
    assert report["domains"] == [] and report["flexible"] == []
    assert report["anchor_size"] == report["residues"] == N_A + N_LINK + N_B
    assert report["matrix"] is None
    assert all((tmp_path / "align" / f"m{i}.pdb").exists() for i in range(4))


def test_align_uses_the_first_member_when_the_reference_is_unknown(job):
    job["reference"] = "/not/a/member.pdb"
    assert align(job)["reference"] == job["members"][0]["in"]


def test_report_is_json_serialisable(job):
    json.dumps(align(job))
