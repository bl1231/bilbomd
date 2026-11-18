"""pdb_utils' residue lists must match packages/bilbomd-types/src/pdbResidues.ts.

Upload validation and the constraint editor classify residues with the
TypeScript lists; pdb2crd.py classifies them with these. When the two drift,
the editor offers segments named differently from the ones CHARMM builds.
"""

import re
from pathlib import Path

import pytest

from pdb_utils import (
    CARBOHYDRATE_RESIDUES,
    DNA_RESIDUES,
    PROTEIN_RESIDUES,
    RNA_RESIDUES,
    classify_residue,
    determine_molecule_type_details,
)

TS_FILE = (
    Path(__file__).resolve().parents[3] / "packages/bilbomd-types/src/pdbResidues.ts"
)
# DNA names pdb_utils classifies as DNA besides DNA_RESIDUES
# (DNA_ALIASES in packages/bilbomd-types/src/constraints/structure.ts)
TS_DNA_ALIASES = {"ADE", "CYT", "GUA", "THY"}


def ts_set(name):
    """The string members of `export const NAME = new Set<string>([...])`."""
    text = TS_FILE.read_text(encoding="utf-8")
    match = re.search(
        rf"export const {name} = new Set<string>\(\[(.*?)\]\)", text, re.S
    )
    assert match, f"{name} not found in {TS_FILE}"
    body = re.sub(r"//[^\n]*", "", match.group(1))
    return set(re.findall(r"'([^']+)'", body))


@pytest.mark.skipif(not TS_FILE.exists(), reason="needs the monorepo checkout")
@pytest.mark.parametrize(
    "python_set, ts_name, extra",
    [
        (PROTEIN_RESIDUES, "PROTEIN_RESIDUES", set()),
        (DNA_RESIDUES, "DNA_RESIDUES", TS_DNA_ALIASES),
        (RNA_RESIDUES, "RNA_RESIDUES", set()),
        (CARBOHYDRATE_RESIDUES, "CARBOHYDRATE_RESIDUES", set()),
    ],
)
def test_matches_typescript(python_set, ts_name, extra):
    assert set(python_set) == ts_set(ts_name) | extra


def atom(resname, resseq):
    return f"ATOM      1  CA  {resname:>3s} A{resseq:4d}       0.000   0.000   0.000\n"


def test_classifies_hsd_and_glycam_names():
    assert classify_residue("HSD") == "PRO"
    assert classify_residue("MAN") == "CAR"
    assert classify_residue("PCA") == "UNKNOWN"


def test_type_is_first_recognized_residue():
    # Pyroglutamate (PCA) at the N-terminus does not make the chain UNKNOWN
    info = determine_molecule_type_details([atom("PCA", 1), atom("ASN", 2)])
    assert info["molecule_type"] == "PRO"
    assert info["types_present"] == {"UNKNOWN", "PRO"}


def test_type_is_unknown_with_no_recognized_residue():
    info = determine_molecule_type_details([atom("HEM", 901), atom("FAD", 902)])
    assert info["molecule_type"] == "UNKNOWN"
