"""run OpenMM Molecular Dynamics with CHARMM-like restraints"""

import os
import sys

import yaml
from openmm import CustomCVForce, Platform, RGForce, VerletIntegrator, XmlSerializer
from openmm.app import (
    CutoffNonPeriodic,
    DCDReporter,
    ForceField,
    Modeller,
    PDBFile,
    Simulation,
    StateDataReporter,
)
from openmm.unit import angstroms
from utils.fixed_bodies import apply_fixed_body_constraints
from utils.pdb_writer import PDBFrameWriter
from utils.rgyr import RadiusOfGyrationReporter
from utils.rigid_body import create_rigid_bodies, get_rigid_bodies


def run_md_for_rg(rg, config_path, gpu_id=None):
    """
    Run a single MD trajectory targeting radius-of-gyration `rg` (Å).
    If `gpu_id` is provided, bind the Simulation to that CUDA device.
    """

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Build output directories:
    output_dir = config["output"]["output_dir"]
    min_dir = os.path.join(output_dir, config["output"]["min_dir"])
    heat_dir = os.path.join(output_dir, config["output"]["heat_dir"])
    md_dir = os.path.join(output_dir, config["output"]["md_dir"])

    heated_pdb_file_name = config["steps"]["heating"]["output_pdb"]
    heated_restart_file_name = config["steps"]["heating"]["output_restart"]

    output_pdb_file_name = config["steps"]["md"]["output_pdb"]
    output_restart_file_name = config["steps"]["md"]["output_restart"]
    output_dcd_file_name = config["steps"]["md"]["output_dcd"]

    for d in [output_dir, min_dir, heat_dir, md_dir]:
        if not os.path.exists(d):
            os.makedirs(d, exist_ok=True)

    # Load heated structure
    input_pdb_file = os.path.join(heat_dir, heated_pdb_file_name)
    pdb = PDBFile(file=input_pdb_file)

    forcefield = ForceField(*config["input"]["forcefield"])
    modeller = Modeller(pdb.topology, pdb.positions)

    fixed_bodies_config = config["constraints"]["fixed_bodies"]
    rigid_bodies_configs = config["constraints"]["rigid_bodies"]

    # Get all rigid bodies from the modeller based on our configurations.
    rigid_bodies = get_rigid_bodies(modeller, rigid_bodies_configs)
    for name, atoms in rigid_bodies.items():
        print(
            f"[GPU {gpu_id}] Rigid body '{name}': {len(atoms)} atoms — indices: "
            f"{atoms[:10]}{'...' if len(atoms) > 10 else ''}"
        )

    # ⚙️ Build system
    system = forcefield.createSystem(
        modeller.topology,
        nonbondedMethod=CutoffNonPeriodic,
        nonbondedCutoff=4 * angstroms,
        constraints=None,
        soluteDielectric=1.0,
        solventDielectric=78.5,
        removeCMMotion=False,
    )

    # 🔒 Apply fixed body constraints and rigid bodies
    print(f"[GPU {gpu_id}] Applying fixed body constraints...")
    apply_fixed_body_constraints(system, modeller, fixed_bodies_config)

    print(f"[GPU {gpu_id}] Applying rigid body constraints...")
    create_rigid_bodies(system, modeller.positions, list(rigid_bodies.values()))

    # ⛓️ RG restraint
    k_rg_yaml = float(config["steps"]["md"]["rgyr"]["k_rg"])  # kcal/mol/Å^2 from YAML
    timestep = float(config["steps"]["md"]["parameters"]["timestep"])
    nsteps = int(config["steps"]["md"]["parameters"]["nsteps"])
    pdb_report_interval = int(config["steps"]["md"]["pdb_report_interval"])
    report_interval = int(config["steps"]["md"]["rgyr"]["report_interval"])
    rgyr_report = config["steps"]["md"]["rgyr"]["filename"]
    print(f"\n[GPU {gpu_id}] 🔁 Running MD with Rg target: {rg} Å")

    rg_force = RGForce()
    # Convert kcal/mol/Å^2 → kJ/mol/nm^2
    k_rg = k_rg_yaml * 418.4
    rg0 = rg * 0.1  # Å → nm
    cv = CustomCVForce("0.5 * k * (rg - rg0)^2")
    cv.addCollectiveVariable("rg", rg_force)
    cv.addGlobalParameter("k", k_rg)
    cv.addGlobalParameter("rg0", rg0)
    system.addForce(cv)

    integrator = VerletIntegrator(timestep)

    with open(os.path.join(heat_dir, heated_restart_file_name), encoding="utf-8") as f:
        state = XmlSerializer.deserialize(f.read())

    # Prefer CUDA and pin to a device if provided
    try:
        cuda_platform = Platform.getPlatformByName("CUDA")
        platform_props = {}
        if gpu_id is not None:
            # Bind this Simulation to a specific GPU on the node
            platform_props["CudaDeviceIndex"] = str(gpu_id)
            # Optional: Perlmutter A100s are great with mixed/single
            # platform_props["CudaPrecision"] = "single"  # or "mixed"
        simulation = Simulation(
            modeller.topology, system, integrator, cuda_platform, platform_props
        )
        simulation.context.setState(state)
        platform = simulation.context.getPlatform().getName()
        print(
            f"[GPU {gpu_id}] Initialized on platform: {platform} (CudaDeviceIndex={platform_props.get('CudaDeviceIndex', '-')})"
        )
    except Exception as e:
        print(f"[GPU {gpu_id}] [WARNING] CUDA not available; falling back. Error: {e}")
        simulation = Simulation(modeller.topology, system, integrator)
        simulation.context.setState(state)
        platform = simulation.context.getPlatform().getName()
        print(f"[GPU {gpu_id}] Initialized on platform: {platform}")

    rg_label = str(int(rg)) if float(rg).is_integer() else str(rg)
    rg_md_dir = os.path.join(md_dir, f"rg_{rg_label}")
    os.makedirs(rg_md_dir, exist_ok=True)

    simulation.reporters = []
    simulation.reporters.append(
        StateDataReporter(
            sys.stdout,
            report_interval,
            step=True,
            temperature=True,
            potentialEnergy=True,
            totalEnergy=True,
            speed=True,
        )
    )
    dcd_file_path = os.path.join(rg_md_dir, output_dcd_file_name)
    rgyr_file_path = os.path.join(rg_md_dir, rgyr_report)
    simulation.reporters.append(DCDReporter(dcd_file_path, report_interval))

    # Radius of Gyration Reporter
    atom_indices = [a.index for a in modeller.topology.atoms() if a.name == "CA"]
    simulation.reporters.append(
        RadiusOfGyrationReporter(
            atom_indices, system, rgyr_file_path, reportInterval=report_interval
        )
    )

    # PDB Frame Writer
    base_name = os.path.splitext(output_pdb_file_name)[0]
    simulation.reporters.append(
        PDBFrameWriter(rg_md_dir, base_name, reportInterval=pdb_report_interval)
    )

    simulation.step(nsteps)

    with open(
        os.path.join(rg_md_dir, output_restart_file_name), "w", encoding="utf-8"
    ) as f:
        final_state = simulation.context.getState(getPositions=True, getForces=True)
        f.write(XmlSerializer.serialize(final_state))

    with open(
        os.path.join(rg_md_dir, output_pdb_file_name), "w", encoding="utf-8"
    ) as out_pdb:
        PDBFile.writeFile(simulation.topology, final_state.getPositions(), out_pdb)

    print(f"[GPU {gpu_id}] ✅ Completed MD with Rg {rg}. Results in {rg_md_dir}")


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def get_available_gpu_count():
    """Get the number of available CUDA GPUs."""
    try:
        cuda_platform = Platform.getPlatformByName("CUDA")
        # Try to get device count from CUDA_VISIBLE_DEVICES if set
        cvis = os.environ.get("CUDA_VISIBLE_DEVICES", "")
        if cvis:
            # Count comma-separated device IDs
            return len([d.strip() for d in cvis.split(",") if d.strip()])
        else:
            # Fall back to querying the platform (this might not work in all cases)
            return cuda_platform.getPropertyDefaultValue("CudaDeviceIndex") + 1
    except Exception:
        # If CUDA is not available or any error occurs, assume 1 GPU or CPU
        return 1


def select_gpu_for_standalone():
    """Select an appropriate GPU ID for standalone mode."""
    available_gpus = get_available_gpu_count()
    if available_gpus <= 1:
        return 0

    # For multiple GPUs, we could use various strategies:
    # 1. Round-robin based on process ID
    # 2. Random selection
    # 3. Environment variable override

    # Check if user specified a GPU
    gpu_override = os.environ.get("OMM_GPU_ID")
    if gpu_override is not None:
        try:
            gpu_id = int(gpu_override)
            if 0 <= gpu_id < available_gpus:
                return gpu_id
            else:
                print(
                    f"[md.py] Warning: OMM_GPU_ID={gpu_id} out of range (0-{available_gpus - 1}), using 0"
                )
                return 0
        except (ValueError, TypeError):
            print(f"[md.py] Warning: Invalid OMM_GPU_ID='{gpu_override}', using 0")
            return 0

    # Default: use GPU 0, but this could be enhanced with load balancing
    return 0


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Run OpenMM MD for a specific Rg (standalone or Slurm)."
    )
    parser.add_argument("config_path", help="Path to openmm_config.yaml")
    parser.add_argument(
        "--rg-set",
        type=int,
        default=0,
        help="Index of rg_sets to use (Slurm mode only; default: 0)",
    )
    args = parser.parse_args()

    with open(args.config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Check for standalone mode (worker app): if OMM_RG is set, run a single Rg
    omm_rg = os.environ.get("OMM_RG")
    if omm_rg is not None:
        try:
            rg = float(omm_rg)
            gpu_id = select_gpu_for_standalone()
            print(f"[md.py] Standalone mode: running single Rg={rg} on GPU {gpu_id}")
            run_md_for_rg(rg, args.config_path, gpu_id=gpu_id)
            print(f"[md.py] Standalone mode: completed Rg={rg}")
            sys.exit(0)
        except (ValueError, TypeError) as e:
            print(f"[md.py] Invalid OMM_RG value '{omm_rg}': {e}")
            sys.exit(1)

    # Fallback to Slurm mode
    rg_sets = config["steps"]["md"]["rgyr"].get("rg_sets", [])
    if not rg_sets:
        print("No rg_sets found in config.")
        sys.exit(1)
    if args.rg_set < 0 or args.rg_set >= len(rg_sets):
        print(
            f"Invalid rg_set index {args.rg_set}. Available sets: 0 to {len(rg_sets) - 1}"
        )
        sys.exit(1)

    rgs = list(rg_sets[args.rg_set])
    if not rgs:
        print(f"rg_set {args.rg_set} is empty.")
        sys.exit(1)

    # Slurm task metadata
    task_id = _env_int("SLURM_PROCID", 0)  # 0..(ntasks-1)
    world_sz = _env_int("SLURM_NTASKS", 1)  # total tasks launched by srun
    jobid = os.environ.get("SLURM_JOB_ID", "?")
    stepid = os.environ.get("SLURM_STEP_ID", "?")

    # GPU visibility: Slurm sets CUDA_VISIBLE_DEVICES per task (e.g. "2"),
    # so inside this process the chosen GPU appears as logical "0".
    cvis = os.environ.get("CUDA_VISIBLE_DEVICES", "")
    gpu_local_index = 0  # use device 0 relative to CUDA_VISIBLE_DEVICES

    # Shard the Rg list to this task (round-robin)
    my_rgs = rgs[task_id::world_sz]

    print(f"[md.py] SLURM_JOB_ID={jobid} STEP={stepid} TASK={task_id}/{world_sz - 1}")
    print(
        f"[md.py] CUDA_VISIBLE_DEVICES='{cvis}' -> using local GPU index {gpu_local_index}"
    )
    print(f"[md.py] Using rg_set {args.rg_set}: {rgs}")
    print(f"[md.py] Rg assignments for this task: {my_rgs}")

    if not my_rgs:
        print(f"[md.py] Task {task_id}: no work (rgs shorter than ntasks). Exiting.")
        sys.exit(0)

    # Run assigned Rg targets sequentially on this task/GPU
    failures = 0
    for rg in my_rgs:
        try:
            print(f"[md.py] Task {task_id}: running Rg={rg}")
            run_md_for_rg(rg, args.config_path, gpu_id=gpu_local_index)
            print(f"[md.py] Task {task_id}: done Rg={rg}")
        except Exception as e:
            failures += 1
            print(f"[md.py] Task {task_id}: FAILED Rg={rg} -> {e}", flush=True)

    if failures:
        print(f"[md.py] Task {task_id}: {failures} failures.", flush=True)
        sys.exit(1)
