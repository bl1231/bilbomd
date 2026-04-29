"""Generate hem.xml from CHARMM36 toppar for use alongside AMBER19 in OpenMM.

Source: CHARMM c49b2 toppar tree (top_all36_prot.rtf, par_all36m_prot.prm,
stream/prot/toppar_all36_prot_heme.str). The HEME residue is extracted with its
referenced atom types and bonded parameters; atom types are prefixed with HEM_
to avoid collision with AMBER19 type names (HA, CC, FE, etc.). The CHARMM
residue name HEME is renamed to HEM to match the PDB CCD name.

Run requirements:
    conda activate openmm  (provides parmed >=4.3 and openmm >=8.5)

Run:
    python apps/worker/scripts/openmm/forcefields/generate_hem_ffxml.py \\
        --toppar /Users/classen/projects/charmm/charmm_c49b2/toppar \\
        --output apps/worker/scripts/openmm/forcefields/hem.xml

Verify the produced ffxml loads alongside AMBER19:
    python -c "from openmm.app import ForceField; \\
               ForceField('amber19-all.xml', 'implicit/gbn2.xml', 'hem.xml')"

Regenerate after a CHARMM toppar bump by rerunning this script with the new
toppar tree path.
"""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from parmed.charmm import CharmmParameterSet
from parmed.openmm import OpenMMParameterSet


CHARMM_RESNAME = "HEME"
PDB_RESNAME = "HEM"
TYPE_PREFIX = "HEM_"


def load_charmm_params(toppar: Path) -> CharmmParameterSet:
    rtf = toppar / "top_all36_prot.rtf"
    prm = toppar / "par_all36m_prot.prm"
    heme = toppar / "stream" / "prot" / "toppar_all36_prot_heme.str"
    for p in (rtf, prm, heme):
        if not p.is_file():
            sys.exit(f"missing CHARMM file: {p}")
    return CharmmParameterSet(str(rtf), str(prm), str(heme))


def filter_to_heme(params: CharmmParameterSet) -> set[str]:
    """Restrict the parameter set to HEME and return the atom types it uses."""
    if CHARMM_RESNAME not in params.residues:
        sys.exit(f"residue {CHARMM_RESNAME} not found in toppar")
    heme = params.residues[CHARMM_RESNAME]
    heme_types = {a.type for a in heme.atoms}

    for resname in list(params.residues):
        if resname != CHARMM_RESNAME:
            del params.residues[resname]

    # Drop all CHARMM patches (NTER, CTER, ASPP, GLUP, FHEM, PHEM, ...).
    # They reference protein atom types we are about to delete; the slim HEM
    # ffxml has no use for them.
    if hasattr(params, "patches"):
        params.patches.clear()

    # Drop atom-type definitions not referenced by HEME so the OpenMM writer
    # emits a slim ffxml. The bonded-parameter dictionaries are filtered by
    # the OpenMMParameterSet writer itself based on the surviving atom types.
    for tname in list(params.atom_types):
        if tname not in heme_types:
            del params.atom_types[tname]

    return heme_types


def write_raw_ffxml(params: CharmmParameterSet, output: Path) -> None:
    omm = OpenMMParameterSet.from_parameterset(params)
    # provenance metadata
    omm.write(
        str(output),
        provenance={
            "Source": [
                {"Source": "top_all36_prot.rtf", "sourcePackage": "CHARMM", "sourcePackageVersion": "c49b2"},
                {"Source": "par_all36m_prot.prm", "sourcePackage": "CHARMM", "sourcePackageVersion": "c49b2"},
                {"Source": "stream/prot/toppar_all36_prot_heme.str", "sourcePackage": "CHARMM", "sourcePackageVersion": "c49b2"},
            ],
            "Reference": [
                "MacKerell, Bashford, et al. CHARMM all-atom additive force "
                "field for proteins, J. Phys. Chem. B 102:3586-3616 (1998).",
            ],
        },
    )


def rename_types_and_residue(ffxml_path: Path) -> None:
    """Prefix all atom types with HEM_ and rename HEME residue to HEM."""
    tree = ET.parse(ffxml_path)
    root = tree.getroot()

    # Collect all type names so we know what to rename. ParmEd writes
    # <AtomTypes><Type name="..." class="..." element="..." mass="...".
    type_names: set[str] = set()
    atom_types_elem = root.find("AtomTypes")
    if atom_types_elem is not None:
        for t in atom_types_elem.findall("Type"):
            name = t.get("name")
            if name:
                type_names.add(name)

    def prefixed(name: str | None) -> str | None:
        if name is None:
            return None
        return TYPE_PREFIX + name if name in type_names else name

    # AtomTypes: rename name AND class (OpenMM matches bonded params by class)
    if atom_types_elem is not None:
        for t in atom_types_elem.findall("Type"):
            t.set("name", prefixed(t.get("name")))
            cls = t.get("class")
            if cls in type_names:
                t.set("class", TYPE_PREFIX + cls)

    # Residues -> Residue elements: rename HEME -> HEM, atom type attrs
    residues_elem = root.find("Residues")
    if residues_elem is not None:
        for r in residues_elem.findall("Residue"):
            if r.get("name") == CHARMM_RESNAME:
                r.set("name", PDB_RESNAME)
            for a in r.findall("Atom"):
                a.set("type", prefixed(a.get("type")))

    # Force sections: rename type/class attrs on every child element
    force_section_tags = (
        "HarmonicBondForce",
        "HarmonicAngleForce",
        "PeriodicTorsionForce",
        "RBTorsionForce",
        "CMAPTorsionForce",
        "NonbondedForce",
        "LennardJonesForce",
        "CustomNonbondedForce",
        "CustomBondForce",
        "CustomAngleForce",
        "CustomTorsionForce",
        "GBSAOBCForce",
    )
    for tag in force_section_tags:
        section = root.find(tag)
        if section is None:
            continue
        for elem in section.iter():
            for attr in list(elem.attrib):
                if attr == "type" or attr.startswith("type") or attr.startswith("class"):
                    elem.set(attr, prefixed(elem.get(attr)) or elem.get(attr))

    # Harmonize 1-4 scaling with AMBER19 so OpenMM accepts both ffxml files
    # in the same ForceField. Intra-HEM 1-4 interactions get AMBER-style
    # scaling (small approximation vs. CHARMM's 1.0/1.0); the heme/protein
    # boundary is unaffected since no covalent bonds cross it.
    nb = root.find("NonbondedForce")
    if nb is not None:
        nb.set("coulomb14scale", "0.8333333333")
        nb.set("lj14scale", "0.5")

    # Drop the LennardJonesForce block. ParmEd writes it to carry CHARMM
    # NBFIX corrections, but it is also redundant with the LJ params already
    # in NonbondedForce, and OpenMM requires every atom type in the System
    # to be defined in any active LennardJonesForce — AMBER19 atom types are
    # not, so it would error. The only NBFIX touching HEM was a single
    # Arg-NC2 / HEM-OC carboxylate correction; losing it is an acceptable
    # approximation for SAXS shape sampling.
    lj = root.find("LennardJonesForce")
    if lj is not None:
        root.remove(lj)

    tree.write(ffxml_path, encoding="utf-8", xml_declaration=True)


def write_hydrogen_definitions(params: CharmmParameterSet, output: Path) -> None:
    """Write OpenMM HydrogenDefinitions XML for HEM.

    PDBFixer adds CCD-style hydrogen names (HHA, HMAA, H2A...) and protonates
    the propionates, but the CHARMM HEME template uses different names
    (HA, HMA1, HMA2, HMA3...) and keeps the propionates deprotonated. The
    runtime pipeline strips all HEM hydrogens after PDBFixer, then
    Modeller.addHydrogens() uses these definitions to add the correct atoms.
    """
    heme = params.residues[CHARMM_RESNAME]
    name_to_atom = {a.name: a for a in heme.atoms}

    # Map each H atom to its bonded heavy-atom parent
    hydrogens: list[tuple[str, str]] = []
    for h in heme.atoms:
        if h.atomic_number != 1:
            continue
        parents = [
            partner.name
            for bond in heme.bonds
            for partner in (bond.atom1, bond.atom2)
            if partner is not h
            and (h is bond.atom1 or h is bond.atom2)
            and partner.atomic_number != 1
        ]
        if not parents:
            sys.exit(f"hydrogen {h.name} has no heavy-atom parent in HEME")
        hydrogens.append((h.name, parents[0]))

    root = ET.Element("Residues")
    residue = ET.SubElement(root, "Residue", name=PDB_RESNAME)
    for h_name, parent_name in sorted(hydrogens):
        ET.SubElement(residue, "H", name=h_name, parent=parent_name)
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(output, encoding="utf-8", xml_declaration=True)


def verify(ffxml_path: Path, hdef_path: Path) -> None:
    """Confirm the written ffxml + HydrogenDefinitions register HEM end-to-end."""
    from openmm.app import ForceField, Modeller, PDBFile, NoCutoff, HBonds, Element
    from pdbfixer import PDBFixer

    ff = ForceField("amber19-all.xml", "implicit/gbn2.xml", str(ffxml_path))
    if PDB_RESNAME not in ff._templates:
        sys.exit(f"verification failed: {PDB_RESNAME} not in ForceField templates")
    template = ff._templates[PDB_RESNAME]
    print(f"verified template: {PDB_RESNAME} registered with {len(template.atoms)} atoms")

    test_pdb = Path("/tmp/hem_test/1A6M.pdb")
    if not test_pdb.is_file():
        print(f"skip end-to-end check: {test_pdb} not present (download 1A6M.pdb to enable)")
        return

    fixer = PDBFixer(filename=str(test_pdb))
    pre = Modeller(fixer.topology, fixer.positions)
    pre.delete([
        a for r in pre.topology.residues() if r.name in ("SO4", "HOH", "OXY")
        for a in r.atoms()
    ])
    PDBFile.writeFile(pre.topology, pre.positions, open("/tmp/hem_test/_verify_stripped.pdb", "w"))

    fixer = PDBFixer(filename="/tmp/hem_test/_verify_stripped.pdb")
    fixer.findMissingResidues()
    fixer.findMissingAtoms()
    fixer.addMissingAtoms()
    fixer.addMissingHydrogens(pH=7.0)

    mod = Modeller(fixer.topology, fixer.positions)
    mod.delete([
        a for r in mod.topology.residues() if r.name == PDB_RESNAME
        for a in r.atoms() if a.element == Element.getBySymbol("H")
    ])
    Modeller.loadHydrogenDefinitions(str(hdef_path))
    mod.addHydrogens(ff)

    system = ff.createSystem(mod.topology, nonbondedMethod=NoCutoff, constraints=HBonds)
    print(f"verified end-to-end: built System with {system.getNumParticles()} particles "
          f"({sum(1 for r in mod.topology.residues() if r.name == PDB_RESNAME)} HEM)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--toppar",
        type=Path,
        default=Path("/Users/classen/projects/charmm/charmm_c49b2/toppar"),
        help="path to CHARMM toppar tree",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent / "hem.xml",
        help="output ffxml path",
    )
    args = parser.parse_args()

    params = load_charmm_params(args.toppar)
    heme_types = filter_to_heme(params)
    print(f"HEME atom types kept: {sorted(heme_types)}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_raw_ffxml(params, args.output)
    rename_types_and_residue(args.output)
    print(f"wrote {args.output}")

    hdef_path = args.output.with_name("hem_hydrogens.xml")
    write_hydrogen_definitions(params, hdef_path)
    print(f"wrote {hdef_path}")

    verify(args.output, hdef_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
