"""Python script to heat a protein structure using OpenMM."""

import math
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
from openmm.unit import kelvin, kilojoules_per_mole, nanometer, picoseconds
from utils.fixed_bodies import apply_fixed_body_constraints
from utils.logger import get_logger
from utils.model_prep import register_ligand_templates_for_topology
from utils.rigid_body import create_rigid_bodies, get_rigid_bodies

logger = get_logger("heat")

if len(sys.argv) != 2:
    logger.error("Usage: python heat.py <config.yaml>")
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
register_ligand_templates_for_topology(modeller.topology, forcefield, config["input"]["dir"])

fixed_bodies_config = config["constraints"]["fixed_bodies"]
rigid_bodies_configs = config["constraints"]["rigid_bodies"]

# ⚙️ Get all rigid bodies from the modeller based on our configurations.
rigid_bodies = get_rigid_bodies(modeller, rigid_bodies_configs)

logger.info(f"Found {len(rigid_bodies)} rigid bodies to apply constraints.")

# ⚙️ Build system
system = forcefield.createSystem(
    modeller.topology,
    nonbondedMethod=CutoffNonPeriodic,
    nonbondedCutoff=1.2 * nanometer,
    constraints=HBonds,
    soluteDielectric=1.0,
    solventDielectric=78.5,
)

# 🔒 Apply fixed body constraints
logger.info("Applying fixed body constraints...")
apply_fixed_body_constraints(system, modeller, fixed_bodies_config)

# 🔒 Apply rigid body constraints
logger.info("Applying rigid body constraints...")
create_rigid_bodies(system, modeller.positions, list(rigid_bodies.values()))


# 🔥 Heating
temperature_increment = (final_temp - start_temp) / nsteps

temperature = start_temp
friction = 1 / picoseconds
integrator = LangevinIntegrator(temperature, friction, timestep)

simulation = Simulation(modeller.topology, system, integrator)
simulation.context.setPositions(modeller.positions)
simulation.context.setVelocitiesToTemperature(start_temp)

logger.info(f"🔥 Starting heating from {start_temp} to {final_temp}...")
for step in range(nsteps):
    temperature = start_temp + temperature_increment * step
    integrator.setTemperature(temperature)
    try:
        simulation.step(1)
    except Exception as e:
        logger.error(f"OpenMM exception at heating step {step}: {e}")
        sys.exit(1)

    if step % 1000 == 0:
        state = simulation.context.getState(getEnergy=True, getPositions=True)
        pe = state.getPotentialEnergy().value_in_unit(kilojoules_per_mole)
        pos = state.getPositions()
        if any(math.isnan(v) for p in pos for v in (p.x, p.y, p.z)):
            logger.error(f"NaN detected in particle positions at step {step} — aborting.")
            sys.exit(1)
        logger.info(f"Step {step}: Temperature = {temperature.value_in_unit(kelvin):.2f} K, PE = {pe:.1f} kJ/mol")

logger.info("✅ Heating complete.")

# Save output structure
positions = simulation.context.getState(getPositions=True).getPositions()
with open(
    os.path.join(heat_dir, output_pdb_file_name), "w", encoding="utf-8"
) as out_pdb:
    PDBFile.writeFile(simulation.topology, positions, out_pdb, keepIds=True)

# Save restart file
with open(os.path.join(heat_dir, output_restart_file_name), "w", encoding="utf-8") as f:
    state = simulation.context.getState(getPositions=True, getVelocities=True)
    f.write(XmlSerializer.serialize(state))

logger.info(f"✅ Saved {output_pdb_file_name} and {output_restart_file_name} in {heat_dir}")
