"""Python script to heat a protein structure using OpenMM."""

import os
import sys
import yaml
from openmm.app import (
    ForceField,
    Modeller,
    Simulation,
    PDBFile,
    CutoffNonPeriodic,
    HBonds,
)
from openmm import LangevinIntegrator
from openmm.unit import kelvin, picoseconds, nanometer
from openmm.openmm import XmlSerializer
from utils.rigid_body import get_rigid_bodies, create_rigid_bodies
from utils.fixed_bodies import apply_fixed_body_constraints

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

first_temp = config["steps"]["heating"]["parameters"]["first_temp"] * kelvin
final_temp = config["steps"]["heating"]["parameters"]["final_temp"] * kelvin
total_steps = config["steps"]["heating"]["parameters"]["total_steps"]
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

fixed_bodies_config = config["constraints"]["fixed_bodies"]
rigid_bodies_configs = config["constraints"]["rigid_bodies"]

# ⚙️ Get all rigid bodies from the modeller based on our configurations.
rigid_bodies = get_rigid_bodies(modeller, rigid_bodies_configs)

print(f"Found {len(rigid_bodies)} rigid bodies to apply constraints.")

# ⚙️ Build system
system = forcefield.createSystem(
    modeller.topology,
    nonbondedMethod=CutoffNonPeriodic,
    nonbondedCutoff=1.2 * nanometer,
    constraints=HBonds,
    soluteDielectric=1.0,
    solventDielectric=78.5
)

# 🔒 Apply fixed body constraints
print("Applying fixed body constraints...")
apply_fixed_body_constraints(system, modeller, fixed_bodies_config)

# 🔒 Apply rigid body constraints
print("Applying rigid body constraints...")
create_rigid_bodies(system, modeller.positions, list(rigid_bodies.values()))


# 🔥 Heating
temperature_increment = (final_temp - first_temp) / total_steps

temperature = first_temp
friction = 1 / picoseconds
integrator = LangevinIntegrator(temperature, friction, timestep)

simulation = Simulation(modeller.topology, system, integrator)
simulation.context.setPositions(modeller.positions)
simulation.context.setVelocitiesToTemperature(first_temp)

print(f"🔥 Starting heating from {first_temp} to {final_temp}...")
for step in range(total_steps):
    temperature = first_temp + temperature_increment * step
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
