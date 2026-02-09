"""Python script to heat a protein structure using OpenMM."""

import os
import sys

import yaml
from openmm import LangevinIntegrator
from openmm.app import (
    CutoffNonPeriodic,
    ForceField,
    HBonds,
    Modeller,
    PDBFile,
    Simulation,
)
from openmm.openmm import XmlSerializer
from openmm.unit import kelvin, nanometer, picoseconds
from utils.fixed_bodies import apply_fixed_body_constraints
from utils.pae_restraints import (
    apply_pae_distance_restraints,
    apply_plddt_positional_restraints,
    load_pae_restraints,
)
from utils.rigid_body import create_rigid_bodies, get_rigid_bodies

if len(sys.argv) != 2:
    print("Usage: python heat.py <config.yaml>")
    sys.exit(1)

config_path = sys.argv[1]
with open(config_path, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

# Build output directories:
output_dir = config["output"]["output_dir"]
min_dir = os.path.join(output_dir, config["output"]["min_dir"])
heat_dir = os.path.join(output_dir, config["output"]["heat_dir"])
md_dir = os.path.join(output_dir, config["output"]["md_dir"])

minimized_pdb_file = config["steps"]["minimization"]["output_pdb"]

output_pdb_file_name = config["steps"]["heating"]["output_pdb"]
output_restart_file_name = config["steps"]["heating"]["output_restart"]

start_temp = config["steps"]["heating"]["parameters"]["start_temp"] * kelvin
final_temp = config["steps"]["heating"]["parameters"]["final_temp"] * kelvin
nsteps = config["steps"]["heating"]["parameters"]["nsteps"]
timestep = config["steps"]["heating"]["parameters"]["timestep"] * picoseconds

for d in [output_dir, min_dir, heat_dir, md_dir]:
    if not os.path.exists(d):
        os.makedirs(d)

# Load minimized structure
input_pdb_file = os.path.join(min_dir, minimized_pdb_file)
pdb = PDBFile(file=input_pdb_file)

# Initialize forcefield and modeller
forcefield = ForceField(*config["input"]["forcefield"])
modeller = Modeller(pdb.topology, pdb.positions)

# Check constraint mode (with safe default handling)
constraints_config = config.get("constraints", {})
constraint_mode = constraints_config.get("mode", "rigid_bodies")

# ⚙️ Build system
system = forcefield.createSystem(
    modeller.topology,
    nonbondedMethod=CutoffNonPeriodic,
    nonbondedCutoff=1.2 * nanometer,
    constraints=HBonds,
    soluteDielectric=1.0,
    solventDielectric=78.5,
)

# 🔒 Apply constraints based on mode
if constraint_mode == "pae_restraints":
    print("Using PAE-based restraints mode")
    pae_restraints_file = constraints_config.get("pae_restraints_file")
    if not pae_restraints_file:
        raise ValueError(
            "pae_restraints_file must be specified when mode is 'pae_restraints'"
        )

    # Load PAE restraints
    pae_restraints_path = os.path.join(output_dir, pae_restraints_file)
    print(f"Loading PAE restraints from {pae_restraints_path}")
    pae_restraints_config = load_pae_restraints(pae_restraints_path)

    # Get optional force scaling parameters (default to 1.0 = no scaling)
    distance_scale = float(constraints_config.get("distance_force_scale", 1.0))
    position_scale = float(constraints_config.get("position_force_scale", 1.0))

    # Log scaling if non-default
    if distance_scale != 1.0 or position_scale != 1.0:
        print(f"Applying force scaling: distance={distance_scale:.2f}x, position={position_scale:.2f}x")

    # Apply PAE-based restraints WITH SCALING
    print("Applying PAE distance restraints...")
    apply_pae_distance_restraints(
        system, modeller, pae_restraints_config, force_scale=distance_scale
    )

    print("Applying pLDDT positional restraints...")
    apply_plddt_positional_restraints(
        system, modeller, modeller.positions, pae_restraints_config,
        force_scale=position_scale
    )

else:  # Default: rigid_bodies mode
    print("Using rigid bodies mode")
    fixed_bodies_config = constraints_config.get("fixed_bodies", [])
    rigid_bodies_configs = constraints_config.get("rigid_bodies", [])

    # Get all rigid bodies from the modeller based on our configurations.
    rigid_bodies = get_rigid_bodies(modeller, rigid_bodies_configs)
    print(f"Found {len(rigid_bodies)} rigid bodies to apply constraints.")

    # Apply fixed body constraints
    if fixed_bodies_config:
        print("Applying fixed body constraints...")
        apply_fixed_body_constraints(system, modeller, fixed_bodies_config)

    # Apply rigid body constraints
    if rigid_bodies:
        print("Applying rigid body constraints...")
        create_rigid_bodies(system, modeller.positions, list(rigid_bodies.values()))


# 🔥 Heating
temperature_increment = (final_temp - start_temp) / nsteps

temperature = start_temp
friction = 1 / picoseconds
integrator = LangevinIntegrator(temperature, friction, timestep)

simulation = Simulation(modeller.topology, system, integrator)
simulation.context.setPositions(modeller.positions)
simulation.context.setVelocitiesToTemperature(start_temp)

print(f"🔥 Starting heating from {start_temp} to {final_temp}...")
for step in range(nsteps):
    temperature = start_temp + temperature_increment * step
    integrator.setTemperature(temperature)
    simulation.step(1)
    if step % 1000 == 0:
        print(f"Step {step}: Temperature = {temperature}")

print("✅ Heating complete.")

# Save output structure
positions = simulation.context.getState(getPositions=True).getPositions()
with open(
    os.path.join(heat_dir, output_pdb_file_name), "w", encoding="utf-8"
) as out_pdb:
    PDBFile.writeFile(simulation.topology, positions, out_pdb)

# Save restart file
with open(os.path.join(heat_dir, output_restart_file_name), "w", encoding="utf-8") as f:
    state = simulation.context.getState(getPositions=True, getVelocities=True)
    f.write(XmlSerializer.serialize(state))

print(f"✅ Saved {output_pdb_file_name} and {output_restart_file_name} in {heat_dir}")
