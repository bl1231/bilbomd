"""PAE-based restraints for OpenMM molecular dynamics"""

import math

import yaml
from openmm import CustomBondForce, CustomExternalForce


def load_pae_restraints(yaml_path):
    """
    Load PAE restraint configuration from YAML file.

    Parameters:
      yaml_path (str): Path to the pae_restraints.yaml file

    Returns:
      dict: Configuration dictionary with distance_restraints and positional_restraints
    """
    with open(yaml_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if "pae_restraints" not in data:
        raise ValueError(f"YAML file {yaml_path} must contain 'pae_restraints' key")

    return data["pae_restraints"]


def identify_representative_atoms(topology, modeller):
    """
    Identify representative atoms for each residue.

    For protein residues: CA atom
    For DNA/RNA residues: P atom
    For other residues: first heavy atom

    Parameters:
      topology: OpenMM Topology object
      modeller: OpenMM Modeller object

    Returns:
      dict: Mapping from (chain_id, res_id, atom_name) -> atom_index
    """
    atom_map = {}

    # Nucleic acid residue names
    nucleic_acid_residues = {"A", "C", "G", "T", "U", "DA", "DC", "DG", "DT"}

    for atom in topology.atoms():
        chain_id = atom.residue.chain.id
        res_id = int(atom.residue.id)
        res_name = atom.residue.name
        atom_name = atom.name

        is_nucleic = res_name in nucleic_acid_residues

        key = (chain_id, res_id, atom_name)
        atom_map[key] = atom.index

    return atom_map


def apply_pae_distance_restraints(system, modeller, restraints_config):
    """
    Apply PAE-weighted distance restraints using CustomBondForce.

    Force: E = 0.5 * k_eff * (r - r0)^2
    where k_eff = k_base * exp(-(PAE/sigma)^2)

    Parameters:
      system: OpenMM System object
      modeller: OpenMM Modeller object
      restraints_config: Dictionary from load_pae_restraints()
    """
    # Get parameters
    k_base = float(restraints_config.get("distance_k", 100.0))  # kJ/mol/nm^2
    sigma = float(restraints_config.get("sigma", 5.0))  # Angstroms
    distance_restraints = restraints_config.get("distance_restraints", [])

    if not distance_restraints:
        print("[pae_restraints] No distance restraints to apply")
        return

    # Create custom bond force with per-bond parameters
    # Energy = 0.5 * k * (r - r0)^2
    force = CustomBondForce("0.5 * k * (r - r0)^2")
    force.addPerBondParameter("k")  # Force constant (kJ/mol/nm^2)
    force.addPerBondParameter("r0")  # Equilibrium distance (nm)

    # Build atom map
    atom_map = identify_representative_atoms(modeller.topology, modeller)

    added_count = 0
    for restraint in distance_restraints:
        chain_i = restraint["chain_i"]
        res_i = restraint["residue_i"]
        atom_i_name = restraint["atom_i"]

        chain_j = restraint["chain_j"]
        res_j = restraint["residue_j"]
        atom_j_name = restraint["atom_j"]

        pae = float(restraint["pae"])  # Angstroms
        distance = float(restraint["distance"])  # Angstroms

        # Find atom indices
        key_i = (chain_i, res_i, atom_i_name)
        key_j = (chain_j, res_j, atom_j_name)

        if key_i not in atom_map or key_j not in atom_map:
            print(
                f"[pae_restraints] Warning: Could not find atoms for restraint {chain_i}:{res_i}-{chain_j}:{res_j}"
            )
            continue

        atom_idx_i = atom_map[key_i]
        atom_idx_j = atom_map[key_j]

        # Calculate effective force constant: k_eff = k_base * exp(-(PAE/sigma)^2)
        k_eff = k_base * math.exp(-((pae / sigma) ** 2))

        # Convert distance from Angstroms to nanometers
        r0 = distance / 10.0  # Å -> nm

        # Add bond with parameters
        force.addBond(atom_idx_i, atom_idx_j, [k_eff, r0])
        added_count += 1

    system.addForce(force)
    print(f"[pae_restraints] Applied {added_count} distance restraints")


def apply_plddt_positional_restraints(system, modeller, positions, restraints_config):
    """
    Apply pLDDT-weighted positional restraints using CustomExternalForce.

    Force: E = 0.5 * k_eff * ((x-x0)^2 + (y-y0)^2 + (z-z0)^2)
    where k_eff = k_base * (pLDDT/100)^2

    Parameters:
      system: OpenMM System object
      modeller: OpenMM Modeller object
      positions: OpenMM positions (from modeller.positions)
      restraints_config: Dictionary from load_pae_restraints()
    """
    # Get parameters
    k_base = float(restraints_config.get("position_k", 50.0))  # kJ/mol/nm^2
    positional_restraints = restraints_config.get("positional_restraints", [])

    if not positional_restraints:
        print("[pae_restraints] No positional restraints to apply")
        return

    # Create custom external force
    # Energy = 0.5 * k * ((x-x0)^2 + (y-y0)^2 + (z-z0)^2)
    force = CustomExternalForce("0.5 * k * ((x - x0)^2 + (y - y0)^2 + (z - z0)^2)")
    force.addPerParticleParameter("k")  # Force constant (kJ/mol/nm^2)
    force.addPerParticleParameter("x0")  # Reference x position (nm)
    force.addPerParticleParameter("y0")  # Reference y position (nm)
    force.addPerParticleParameter("z0")  # Reference z position (nm)

    # Build atom map
    atom_map = identify_representative_atoms(modeller.topology, modeller)

    added_count = 0
    for restraint in positional_restraints:
        chain = restraint["chain"]
        res = restraint["residue"]
        atom_name = restraint["atom"]
        plddt = float(restraint["plddt"])  # 0-100 scale
        position = restraint["position"]  # [x, y, z] in Angstroms

        # Find atom index
        key = (chain, res, atom_name)
        if key not in atom_map:
            print(
                f"[pae_restraints] Warning: Could not find atom for positional restraint {chain}:{res}:{atom_name}"
            )
            continue

        atom_idx = atom_map[key]

        # Calculate effective force constant: k_eff = k_base * (pLDDT/100)^2
        plddt_fraction = plddt / 100.0
        k_eff = k_base * (plddt_fraction**2)

        # Convert position from Angstroms to nanometers
        x0 = position[0] / 10.0  # Å -> nm
        y0 = position[1] / 10.0
        z0 = position[2] / 10.0

        # Add particle with parameters
        force.addParticle(atom_idx, [k_eff, x0, y0, z0])
        added_count += 1

    system.addForce(force)
    print(f"[pae_restraints] Applied {added_count} positional restraints")
