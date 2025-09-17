"""Fixed Regions"""

from openmm import unit
from openmm import CustomExternalForce


def apply_fixed_body_constraints_zero_mass(system, modeller, fixed_bodies):
    """
    Freeze atoms (set their mass to 0) if they belong to any fixed body defined in the configuration.

    Parameters:
      system (openmm.System): The OpenMM system to modify.
      modeller (openmm.app.Modeller): Contains the topology with atoms and residues.
      fixed_bodies (list): A list of dictionaries defining fixed bodies. Each dictionary should
                           contain keys "name", "chain_id", and "residues" (with "start" and "stop").
      amu: The unit for atomic mass (e.g., openmm.unit.amu).
    """
    for atom in modeller.topology.atoms():
        res_id = int(atom.residue.id)
        chain_id = atom.residue.chain.id
        for fixed_body in fixed_bodies:
            segments = fixed_body.get("segments", [])
            for segment in segments:
                if chain_id == segment["chain_id"]:
                    start = segment["residues"]["start"]
                    stop = segment["residues"]["stop"]
                    if start <= res_id < stop:
                        system.setParticleMass(atom.index, 0.0 * unit.amu)
                        break
    # Debug: Print atoms with zero mass
    zero_mass_atoms = [
        i
        for i in range(system.getNumParticles())
        if system.getParticleMass(i)._value == 0
    ]
    print(f"Zero-mass atoms: {zero_mass_atoms}")


def apply_fixed_body_constraints(system, modeller, fixed_bodies, kfixed=100000.0):
    """
    Apply tight harmonic positional restraints to atoms in fixed bodies, instead of setting mass = 0.

    Parameters:
      system (openmm.System): The OpenMM system to modify.
      modeller (openmm.app.Modeller): Contains the topology with atoms and residues.
      fixed_bodies (list): A list of dictionaries defining fixed bodies. Each dictionary should
                           contain keys "name", "chain_id", and "residues" (with "start" and "stop").
      kfixed (float): Force constant for the harmonic restraint (in kJ/mol/nm^2).
    """
    force = CustomExternalForce("0.5 * kfixed * ((x - x0)^2 + (y - y0)^2 + (z - z0)^2)")
    force.addPerParticleParameter("x0")
    force.addPerParticleParameter("y0")
    force.addPerParticleParameter("z0")
    force.addGlobalParameter("kfixed", kfixed)

    for atom in modeller.topology.atoms():
        res_id = int(atom.residue.id)
        chain_id = atom.residue.chain.id
        for fixed_body in fixed_bodies:
            segments = fixed_body.get("segments", [])
            for segment in segments:
                if chain_id == segment["chain_id"]:
                    start = segment["residues"]["start"]
                    stop = segment["residues"]["stop"]
                    if start <= res_id < stop:
                        pos = modeller.positions[atom.index]
                        force.addParticle(atom.index, [pos.x, pos.y, pos.z])
                        break  # Move to next atom once matched

    system.addForce(force)

    # Debug: Print atoms with zero mass
    zero_mass_atoms = [
        i
        for i in range(system.getNumParticles())
        if system.getParticleMass(i)._value == 0
    ]
    print(f"Zero-mass atoms: {zero_mass_atoms}")
