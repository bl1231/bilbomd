#!/usr/bin/env python3
import json
import os
import shutil
import sys
from pathlib import Path

# -----------------------------------------------------------------------------
# Argument and Environment Setup
# -----------------------------------------------------------------------------


def setup_environment(uuid):
    # Slurm and project parameters
    project = "m4659"
    queue = "regular"
    constraint = "gpu"
    nodes = 1
    walltime = "03:00:00"
    mailtype = "end,fail"
    mailuser = "sclassen@lbl.gov"

    # Determine environment (default to 'development')
    environment = os.environ.get("ENVIRONMENT", "development")
    pscratch = os.environ.get("PSCRATCH")
    cfs = os.environ.get("CFS")
    env_dir = "prod" if environment == "production" else "dev"

    # Directory paths
    cfs_base = f"{cfs}/{project}/bilbomd"
    upload_dir = f"{cfs_base}/{env_dir}/uploads/{uuid}"
    workdir = f"{pscratch}/bilbomd/{env_dir}/{uuid}"
    template_dir = f"{cfs_base}/{env_dir}/templates"

    # Docker images
    bilbomd_worker = "bilbomd/bilbomd-perlmutter-worker:0.0.28"
    af_worker = "bilbomd/bilbomd-colabfold:0.0.9"

    # Number of cores
    if constraint.startswith("gpu"):
        num_cores = 128
    elif constraint == "cpu":
        num_cores = 256
    else:
        num_cores = 128

    # Return config dictionary
    return {
        "uuid": uuid,
        "project": project,
        "queue": queue,
        "constraint": constraint,
        "nodes": nodes,
        "walltime": walltime,
        "mailtype": mailtype,
        "mailuser": mailuser,
        "environment": environment,
        "env_dir": env_dir,
        "cfs_base": cfs_base,
        "upload_dir": upload_dir,
        "workdir": workdir,
        "template_dir": template_dir,
        "bilbomd_worker": bilbomd_worker,
        "af_worker": af_worker,
        "num_cores": num_cores
    }


# -----------------------------------------------------------------------------
# Input Preparation
# -----------------------------------------------------------------------------


def prepare_input(workdir, upload_dir):
    # Create working directory if it doesn't exist
    Path(workdir).mkdir(parents=True, exist_ok=True)

    # Copy input files from upload_dir to workdir
    if os.path.exists(upload_dir):
        for item in os.listdir(upload_dir):
            src = os.path.join(upload_dir, item)
            dst = os.path.join(workdir, item)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(src, dst)
    else:
        print(f"Warning: Upload directory {upload_dir} does not exist.")

    # Read job parameters from params.json
    params_path = os.path.join(workdir, "params.json")
    params = {}
    if os.path.exists(params_path):
        with open(params_path, "r") as f:
            try:
                params = json.load(f)
            except Exception as e:
                print(f"Error reading params.json: {e}")
    else:
        print(f"Warning: params.json not found in {workdir}.")
    # Inject a few hard-coded parameters here
    # until I can figure out a better way to do this.
    params["charmm_topo_dir"] = "/app/scripts/bilbomd_top_par_files.str"
    params["in_psf_file"] = params.get("psf_file", "bilbomd_pdb2crd.psf")
    params["in_crd_file"] = params.get("crd_file", "bilbomd_pdb2crd.crd")
    # will be calculated by pae2const.py
    params["constinp"] = "const.inp"
    return params


# -----------------------------------------------------------------------------
# Copy CHARMM template files
# -----------------------------------------------------------------------------


def copy_template_files(config):
    """Copy CHARMM input file templates from template directory to appropriate working subdirectories."""
    print("Copy CHARMM input file templates")

    # Define template files and their destination subdirectories
    template_destinations = {
        "minimize.tmpl": "charmm/minimize",
        "heat.tmpl": "charmm/heat", 
        "dynamics.tmpl": "charmm/md",
        "dcd2pdb.tmpl": ".",  # Root workdir for dcd2pdb processing
    }

    for template_file, subdir in template_destinations.items():
        src_path = os.path.join(config["template_dir"], template_file)
        
        # Create destination directory structure
        dest_dir = os.path.join(config["workdir"], subdir)
        os.makedirs(dest_dir, exist_ok=True)
        
        dst_path = os.path.join(dest_dir, template_file)

        try:
            shutil.copy2(src_path, dst_path)
            print(f"  Copied {template_file} to {subdir}/")
        except (OSError, IOError) as e:
            print(
                f"Failed to copy {template_file} from {config['template_dir']} to {dest_dir}: {e}",
                file=sys.stderr,
            )
            sys.exit(1)

    print("Template files copied successfully to their respective directories")


def template_minimization_file(config, params):
    """Prepare CHARMM Minimize input file from template."""
    print("Preparing CHARMM Minimize input file")

    workdir = config["workdir"]
    # Template is now in charmm/minimize/ subdirectory
    template_file = os.path.join(workdir, "charmm", "minimize", "minimize.tmpl")
    output_file = os.path.join(workdir, "charmm", "minimize", "minimize.inp")

    # Move template to input file
    try:
        shutil.move(template_file, output_file)
    except (OSError, IOError) as e:
        print(f"Failed to move {template_file} to {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    # Read the template content
    try:
        with open(output_file, "r") as f:
            content = f.read()
    except (OSError, IOError) as e:
        print(f"Failed to read {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    # Define required parameters and validate they exist
    required_params = {
        "{{charmm_topo_dir}}": "charmm_topo_dir",
        "{{in_psf_file}}": "in_psf_file",
        "{{in_crd_file}}": "in_crd_file",
    }
    
    replacements = {}
    for placeholder, param_key in required_params.items():
        if param_key not in params or not params[param_key]:
            print(f"Error: Required parameter '{param_key}' not found in params.json or is empty", file=sys.stderr)
            sys.exit(1)
        replacements[placeholder] = str(params[param_key])

    for placeholder, value in replacements.items():
        content = content.replace(placeholder, str(value))

    # Write the processed content back
    try:
        with open(output_file, "w") as f:
            f.write(content)
    except (OSError, IOError) as e:
        print(f"Failed to write {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    print("Done Preparing CHARMM Minimize input file")


def template_heat_file(config, params):
    """Prepare CHARMM Heat input file from template."""
    print("Preparing CHARMM Heat input file")

    workdir = config["workdir"]
    # Template is now in charmm/heat/ subdirectory
    template_file = os.path.join(workdir, "charmm", "heat", "heat.tmpl")
    output_file = os.path.join(workdir, "charmm", "heat", "heat.inp")

    # Move template to input file
    try:
        shutil.move(template_file, output_file)
    except (OSError, IOError) as e:
        print(f"Failed to move {template_file} to {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    # Read the template content
    try:
        with open(output_file, "r") as f:
            content = f.read()
    except (OSError, IOError) as e:
        print(f"Failed to read {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    # Define required parameters and validate they exist
    required_params = {
        "{{charmm_topo_dir}}": "charmm_topo_dir",
        "{{in_psf_file}}": "in_psf_file", 
        "{{constinp}}": "constinp",
    }
    
    replacements = {}
    for placeholder, param_key in required_params.items():
        if param_key not in params or not params[param_key]:
            print(f"Error: Required parameter '{param_key}' not found in params.json or is empty", file=sys.stderr)
            sys.exit(1)
        replacements[placeholder] = str(params[param_key])

    for placeholder, value in replacements.items():
        content = content.replace(placeholder, str(value))

    # Write the processed content back
    try:
        with open(output_file, "w") as f:
            f.write(content)
    except (OSError, IOError) as e:
        print(f"Failed to write {output_file}: {e}", file=sys.stderr)
        sys.exit(1)

    print("Done Preparing CHARMM Heat input file")

def template_md_files(config, params):
    """Create CHARMM MD input files for each Rg value from template."""
    print("Preparing CHARMM MD input files")
    
    # Extract Rg values from nested params structure
    rg_values = params.get("charmm_parameters", {}).get("md", {}).get("rgyr", [])
    if not rg_values:
        print("Error: No Rg values found in charmm_parameters.md.rgyr", file=sys.stderr)
        sys.exit(1)
    
    workdir = config["workdir"]
    # Template is now in charmm/md/ subdirectory
    template_file = os.path.join(workdir, "charmm", "md", "dynamics.tmpl")
    
    # Check if template file exists
    if not os.path.exists(template_file):
        print(f"Error: Template file {template_file} not found", file=sys.stderr)
        sys.exit(1)
    
    # Get additional MD parameters
    charmm_md_params = params.get("charmm_parameters", {}).get("md", {})
    nsteps = charmm_md_params.get("nsteps", 300000)  # Default fallback
    conf_sample = int(nsteps / 100000)
    timestep = 0.001  # Fixed timestep as in bash version
    
    # Define required parameters and validate they exist
    required_params = {
        "{{charmm_topo_dir}}": "charmm_topo_dir",
        "{{in_psf_file}}": "in_psf_file",
        "{{constinp}}": "constinp",
    }
    
    # Validate required parameters exist
    for placeholder, param_key in required_params.items():
        if param_key not in params or not params[param_key]:
            print(f"Error: Required parameter '{param_key}' not found in params.json or is empty", file=sys.stderr)
            sys.exit(1)
    
    # Loop through each Rg value and create input file
    for rg_value in rg_values:
        inp_basename = f"dynamics_rg{rg_value}"
        inp_file = f"{inp_basename}.inp"
        # Create output file in charmm/md/ subdirectory
        output_path = os.path.join(workdir, "charmm", "md", inp_file)
        
        print(f"Creating CHARMM MD input file: {inp_file} for Rg={rg_value}")
        
        # Copy template to new input file
        try:
            shutil.copy2(template_file, output_path)
        except (OSError, IOError) as e:
            print(f"Failed to copy {template_file} to {output_path}: {e}", file=sys.stderr)
            sys.exit(1)
        
        # Read the template content
        try:
            with open(output_path, "r") as f:
                content = f.read()
        except (OSError, IOError) as e:
            print(f"Failed to read {output_path}: {e}", file=sys.stderr)
            sys.exit(1)
        
        # Prepare all replacements including dynamic values
        replacements = {
            "{{charmm_topo_dir}}": str(params["charmm_topo_dir"]),
            "{{in_psf_file}}": str(params["in_psf_file"]),
            "{{constinp}}": str(params["constinp"]),
            "{{rg}}": str(rg_value),
            "{{inp_basename}}": inp_basename,
            "{{conf_sample}}": str(conf_sample),
            "{{timestep}}": str(timestep),
        }
        
        # Perform all replacements
        for placeholder, value in replacements.items():
            content = content.replace(placeholder, value)
        
        # Write the processed content back
        try:
            with open(output_path, "w") as f:
                f.write(content)
        except (OSError, IOError) as e:
            print(f"Failed to write {output_path}: {e}", file=sys.stderr)
            sys.exit(1)
    
    print(f"Done preparing {len(rg_values)} CHARMM MD input files")

# -----------------------------------------------------------------------------
# Status File Creation
# -----------------------------------------------------------------------------


def create_status_file(workdir):
    status_file = os.path.join(workdir, "status.txt")
    steps = [
        "alphafold",
        "pdb2crd",
        "meld",
        "pae",
        "pae2constraints",
        "consmerge",
        "autorg",
        "minimize",
        "initfoxs",
        "heat",
        "md",
        "dcd2pdb",
        "foxs",
        "multifoxs",
        "analysis",
        "copy2cfs",
    ]
    with open(status_file, "w") as f:
        for step in steps:
            f.write(f"{step}: Waiting\n")


# -----------------------------------------------------------------------------
# Slurm Script Section Generation
# -----------------------------------------------------------------------------

def generate_slurm_header(config):
    header = f"""#!/bin/bash -l
#SBATCH --qos={config["queue"]}
#SBATCH --nodes={config["nodes"]}
#SBATCH --time={config["walltime"]}
#SBATCH --licenses=cfs,scratch
#SBATCH --constraint={config["constraint"]}
#SBATCH --account={config["project"]}
#SBATCH --output={config["workdir"]}/slurm-%j.out
#SBATCH --error={config["workdir"]}/slurm-%j.err
#SBATCH --mail-type={config["mailtype"]}
#SBATCH --mail-user={config["mailuser"]}

# DEBUG setting to 1 will skip md steps
# export SKIP_MD=1

# OpenMP settings:
export OMP_NUM_THREADS={config["num_cores"]}
export OMP_PLACES=threads
export OMP_PROC_BIND=spread

# Global ENV variables
export UPLOAD_DIR="{config["upload_dir"]}"
export WORKDIR="{config["workdir"]}"
export STATUS_FILE="{config["workdir"]}/status.txt"

# Docker images
export BILBOMD_WORKER="{config["bilbomd_worker"]}"
export AF_WORKER="{config["af_worker"]}"
"""
    return header


def add_helper_functions():
    section = """
# --------------------------------------------------------------------------------------
# Helper functions

# Updates our status.txt file using sed to update values
update_status() {
  local step=$1
  local status=$2
  echo "Update $step status: $status"
  # Use sed to update the status file
  sed -i "s/^$step: .*/$step: $status/" "$STATUS_FILE"
}

# Check exit code and cancel the SLURM job if non-zero
check_exit_code() {
  local exit_code=$1
  local step=$2
  if [ $exit_code -ne 0 ]; then
    echo "Process in $step failed with exit code $exit_code. Cancelling SLURM job."
    update_status $step Error
    scancel $SLURM_JOB_ID
    exit $exit_code
  fi
  }
"""
    return section


def generate_alphafold_section(config):
    section = """
# --------------------------------------------------------------------------------------
# Run ColabFoldLocal (i.e AlphaFold)
update_status alphafold Running
echo "Running AlphaFold..."
srun --gpus=4 \\
     --job-name alphafold \\
     podman-hpc run --rm --gpu \\
        -v $WORKDIR:/bilbomd/work \\
        $AF_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/ &&
            colabfold_batch \\
                --num-models=3 \\
                --amber \\
                --use-gpu-relax \\
                --num-recycle=4 \\
                af-entities.fasta alphafold
        "
AF_EXIT=$?
check_exit_code $AF_EXIT alphafold
echo "AlphaFold Done."
update_status alphafold Success
"""
    return section


def select_best_alphafold_model(config):
    section = """
# --------------------------------------------------------------------------------------
# Prepare input files for PAE2Const from AlphaFold output
echo "Selecting best AlphaFold model..."

# Find the best ranked relaxed PDB model (rank_001)
echo "Looking for best AlphaFold PDB model in $WORKDIR/alphafold/"
pdb_files=($(find $WORKDIR/alphafold -name "*_relaxed_rank_001_*.pdb" -type f))
if [ ${#pdb_files[@]} -eq 0 ]; then
    echo "ERROR: No rank_001 relaxed PDB files found in alphafold output directory"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
elif [ ${#pdb_files[@]} -gt 1 ]; then
    echo "WARNING: Multiple rank_001 PDB files found, using first one:"
    for pdb in "${pdb_files[@]}"; do
        echo "  - $(basename "$pdb")"
    done
    echo "Selected: $(basename "${pdb_files[0]}")"
else
    echo "Found single rank_001 PDB file: $(basename "${pdb_files[0]}")"
fi
cp "${pdb_files[0]}" $WORKDIR/af-rank1.pdb
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to copy PDB file"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
fi

# Find the corresponding PAE scores file
echo "Looking for corresponding PAE scores file..."
pae_files=($(find $WORKDIR/alphafold -name "*_scores_rank_001_*.json" -type f))
if [ ${#pae_files[@]} -eq 0 ]; then
    echo "ERROR: No rank_001 PAE scores files found in alphafold output directory"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
elif [ ${#pae_files[@]} -gt 1 ]; then
    echo "WARNING: Multiple rank_001 PAE files found, using first one:"
    for pae in "${pae_files[@]}"; do
        echo "  - $(basename "$pae")"
    done
    echo "Selected: $(basename "${pae_files[0]}")"
else
    echo "Found single rank_001 PAE file: $(basename "${pae_files[0]}")"
fi
cp "${pae_files[0]}" $WORKDIR/af-pae.json
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to copy PAE file"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
fi

# Verify the copied files exist and are non-empty
if [ ! -s $WORKDIR/af-rank1.pdb ]; then
    echo "ERROR: af-rank1.pdb is missing or empty"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
fi

if [ ! -s $WORKDIR/af-pae.json ]; then
    echo "ERROR: af-pae.json is missing or empty"
    update_status alphafold Error
    scancel $SLURM_JOB_ID
    exit 1
fi

echo "Successfully selected and copied AlphaFold model and PAE files:"
echo "  PDB: $(basename "${pdb_files[0]}") -> af-rank1.pdb"
echo "  PAE: $(basename "${pae_files[0]}") -> af-pae.json"
"""
    return section


def generate_pae2const_section(config, params):
    pae_file = params.get("pae_file", "af-pae.json")
    pdb_file = params.get("pdb_file", "af-rank1.pdb")
    section = f"""
# --------------------------------------------------------------------------------------
# Generate CHARMM const.inp from PAE/PDB
update_status pae2constraints Running
echo "Generating const.inp from PAE..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name pae2constraints \\
     podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work
            python /app/scripts/pae2const.py {pae_file} \\
                --pdb_file {pdb_file} \\
                --charmm-const-file const.inp
    "
PAE2CONS_EXIT=$?
check_exit_code $PAE2CONS_EXIT pae2constraints
update_status pae2constraints Success
"""
    return section

def generate_pdb2crd_input_files_af(config):
    section = f"""
# --------------------------------------------------------------------------------------
# Convert AlphaFold PDB to CHARMM PSF/CRD
update_status pdb2crd Running
echo "Generating pdb2crd input files..."
srun --job-name af-pdb2crd \\
    podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/ &&
            python /app/scripts/pdb2crd.py af-rank1.pdb . > pdb2crd_output.txt
    "

# Parse the file "pdb2crd_output.txt" and run CHARMM for each chain-specific *.inp file
echo "Parsing pdb2crd_output.txt..."
num_inp_files=$(wc -l < $WORKDIR/pdb2crd_output.txt)
echo "Number of pdb2crd.inp files to process: $num_inp_files"
cpus=$(({config["num_cores"]} / num_inp_files))
if [ "$cpus" -lt 1 ]; then
    cpus=1
fi

# Array to hold all background PIDs
pids=()
while IFS= read -r filename; do
    # Extract the filename prefix (without extension)
    filename_prefix=$(basename "$filename" .inp)
    
    # Generate the srun command
    srun --ntasks=1 \\
         --cpus-per-task=$cpus \\
         --cpu-bind=cores \\
         --job-name pdb2crd \\
         podman-hpc run --rm \\
            -v $WORKDIR:/bilbomd/work \\
            $BILBOMD_WORKER /bin/bash -c "
                set -e
                cd /bilbomd/work/ &&
                charmm -o ${{filename_prefix}}.out -i ${{filename}}
            " &
    # Capture the PID of the backgrounded srun command
    pids+=($!)
done < $WORKDIR/pdb2crd_output.txt

# Wait for all background jobs to complete & check their exit codes
for pid in "${{pids[@]}}"; do
    wait $pid
    exit_code=$?
    check_exit_code $exit_code pdb2crd
done

echo "Individual chains converted to CRD files."
update_status pdb2crd Success
"""
    return section

def generate_pdb2crd_input_files(config, params):
    """Generate section to convert PDB to CHARMM PSF/CRD format for regular PDB/Auto jobs."""
    pdb_file = params.get("pdb_file", "input.pdb")
    
    section = f"""
# --------------------------------------------------------------------------------------
# Convert PDB to CHARMM PSF/CRD
update_status pdb2crd Running
echo "Generating pdb2crd input files..."
srun --job-name pdb2crd \\
    podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/ &&
            python /app/scripts/pdb2crd.py {pdb_file} . > pdb2crd_output.txt
    "

# Check if output file was created
if [ ! -f "$WORKDIR/pdb2crd_output.txt" ]; then
    echo "ERROR: pdb2crd output file not found" >&2
    update_status pdb2crd Error
    scancel $SLURM_JOB_ID
    exit 1
fi

# Parse the file "pdb2crd_output.txt" and run CHARMM for each chain-specific *.inp file
echo "Parsing pdb2crd_output.txt..."
num_inp_files=$(wc -l < $WORKDIR/pdb2crd_output.txt)
if [ "$num_inp_files" -eq 0 ]; then
    echo "ERROR: No input files were parsed, check the output for errors" >&2
    update_status pdb2crd Error
    scancel $SLURM_JOB_ID
    exit 1
fi

echo "Number of pdb2crd.inp files to process: $num_inp_files"
cpus=$(({config["num_cores"]} / num_inp_files))
if [ "$cpus" -lt 1 ]; then
    cpus=1
fi

# Array to hold all background PIDs
pids=()
while IFS= read -r filename; do
    # Extract the filename prefix (without extension)
    filename_prefix=$(basename "$filename" .inp)
    
    # Generate the srun command
    srun --ntasks=1 \\
         --cpus-per-task=$cpus \\
         --cpu-bind=cores \\
         --job-name pdb2crd \\
         podman-hpc run --rm \\
            -v $WORKDIR:/bilbomd/work \\
            $BILBOMD_WORKER /bin/bash -c "
                set -e
                cd /bilbomd/work/ &&
                charmm -o ${{filename_prefix}}.out -i ${{filename}}
            " &
    # Capture the PID of the backgrounded srun command
    pids+=($!)
done < $WORKDIR/pdb2crd_output.txt

# Wait for all background jobs to complete & check their exit codes
for pid in "${{pids[@]}}"; do
    wait $pid
    exit_code=$?
    check_exit_code $exit_code pdb2crd
done

echo "Individual chains converted to CRD files."
update_status pdb2crd Success
"""
    return section

def generate_meld_all_chains_section(config):
    section = f"""
# --------------------------------------------------------------------------------------
# CHARMM Meld individual chains to create a single CRD and PSF file
update_status meld Running
echo "Melding individual chain CRD files..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name meld \\
     podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/ &&
            charmm -o pdb2crd_charmm_meld.out -i pdb2crd_charmm_meld.inp
        "
echo "All Individual CRD files melded into bilbomd_pdb2crd.crd" 
update_status meld Success
"""
    return section


def generate_minimize_section(config):
    section = f"""
# --------------------------------------------------------------------------------------
# CHARMM Minimization
update_status minimize Running
echo "Running CHARMM Minimization..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --gpus-per-task=1 \\
     --cpu-bind=cores \\
     --job-name minimize \\
     podman-hpc run --rm --gpu \\
        -v $WORKDIR:/bilbomd/work \\
        -v $UPLOAD_DIR:/cfs \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/charmm/minimize &&
            charmm -o minimize.out -i minimize.inp
        "
MIN_EXIT=$?
check_exit_code $MIN_EXIT minimize
echo "CHARMM Minimization complete"
update_status minimize Success
"""
    return section


def num_saxs_data_points(saxs_file):
    count = 0
    with open(saxs_file, "r") as f:
        for line in f:
            trimmed = line.strip()
            # Skip empty lines and lines starting with '#'
            if trimmed and not trimmed.startswith("#"):
                count += 1
    # Adjust count by subtracting 1
    count -= 1
    return count


def generate_initial_foxs_analysis_section(config, params):
    saxs_data = os.path.join(config["workdir"], params.get("data_file"))
    profile_size = num_saxs_data_points(saxs_data)
    min_c1 = 0.99
    max_c1 = 1.05
    min_c2 = -0.50
    max_c2 = 2.00
    minimized_pdb = os.path.join("charmm","minimize", "minimization_output.pdb")
    saxs_data_in_container = os.path.join(".", params.get("data_file"))

    # build foxs args as a list, each argument separate
    foxs_args = [
        "--offset",
        f"--min_c1={min_c1}",
        f"--max_c1={max_c1}",
        f"--min_c2={min_c2}",
        f"--max_c2={max_c2}",
        f"--profile_size={profile_size}",
        minimized_pdb,
        saxs_data_in_container,
    ]

    # join with line continuations for readability
    foxs_args_wrapped = " \\\n                ".join(foxs_args)

    section = f"""

# --------------------------------------------------------------------------------------
# Initial FoXS analysis on input structure
update_status initfoxs Running
echo "Running initial FoXS analysis on minimized structure..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name initfoxs \\
     podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/ &&
            foxs \\
                {foxs_args_wrapped} \\
                > initial_foxs_analysis.log \\
                2> initial_foxs_analysis_error.log
        "
INITFOXS_EXIT=$?
check_exit_code $INITFOXS_EXIT initfoxs
echo "Initial FoXS analysis complete"
update_status initfoxs Success
"""
    return section


def generate_heat_section(config):
    section = f"""
# --------------------------------------------------------------------------------------
# CHARMM Heating
update_status heat Running
echo "Running CHARMM Heating..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --gpus-per-task=1 \\
     --cpu-bind=cores \\
     --job-name heat \\
     podman-hpc run --rm --gpu \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/charmm/heat &&
            charmm -o heat.out -i heat.inp
        "
HEAT_EXIT=$?
check_exit_code $HEAT_EXIT heat
echo "CHARMM Heating complete"
update_status heat Success
"""
    return section


def generate_md_section(config, params):
    # Extract Rg values from nested params structure
    rg_values = params.get("charmm_parameters", {}).get("md", {}).get("rgyr", [])
    if not rg_values:
        print("Error: No Rg values found in charmm_parameters.md.rgyr", file=sys.stderr)
        sys.exit(1)
    
    num_rg_values = len(rg_values)
    print(f"MD section: {config['num_cores']} cores, {num_rg_values} Rg values: {rg_values}")
    
    # More conservative core allocation - leave some headroom for Slurm
    available_cores = config["num_cores"] - 4  # Reserve 4 cores for system overhead
    cores_per_task = max(1, int(available_cores / num_rg_values))
    
    # Cap at reasonable maximum to avoid memory issues
    max_cores_per_task = 32
    cores_per_task = min(cores_per_task, max_cores_per_task)
    
    print(f"Allocating {cores_per_task} cores per MD task ({cores_per_task * num_rg_values} total)")

    section = f"""
# --------------------------------------------------------------------------------------
# CHARMM Molecular Dynamics (concurrent runs with each Rg set)
update_status md Running
# Check if SKIP_MD is set to skip MD runs (useful for debugging downstream steps)
if [[ -n "$SKIP_MD" ]]; then
    echo "SKIP_MD is set - skipping MD runs"
    echo "This assumes MD output files already exist from previous runs"
    update_status md Success
else
    echo 'Running CHARMM MD for {num_rg_values} Rg values...'
    echo '{rg_values}'
    echo 'Using {cores_per_task} cores per task'

    # Array to hold all background PIDs
    md_pids=()
"""
    
    # Launch all MD jobs in background
    for i, rg_value in enumerate(rg_values):
        section += f"    echo 'Starting MD for Rg value {rg_value} (index {i}) with {cores_per_task} cores'\n"
        section += f"""    srun --ntasks=1 \\
         --cpus-per-task={cores_per_task} \\
         --cpu-bind=cores \\
         --job-name md_rg{rg_value} \\
         podman-hpc run --rm \\
             -v $WORKDIR:/bilbomd/work \\
             $BILBOMD_WORKER /bin/bash -c "
                set -e
                export OMP_NUM_THREADS={cores_per_task}
                cd /bilbomd/work/charmm/md &&
                charmm -o dynamics_rg{rg_value}.out -i dynamics_rg{rg_value}.inp
             " &
    # Capture the PID of the backgrounded srun command
    md_pids+=($!)
    echo "Started MD job for Rg {rg_value} with PID $!"
    # Longer delay to ensure Slurm scheduler picks up each job
    sleep 5

"""

    # Wait for all background jobs to complete and check exit codes
    section += """    # Wait for all MD background jobs to complete & check their exit codes
    echo "Waiting for ${#md_pids[@]} MD jobs to complete..."
    for i in "${!md_pids[@]}"; do
        pid=${md_pids[$i]}
        echo "Waiting for MD job $((i+1))/${#md_pids[@]} (PID: $pid)"
        wait $pid
        exit_code=$?
        check_exit_code $exit_code md
        echo "MD job $((i+1)) completed with exit code $exit_code"
    done

    echo 'CHARMM MD complete'
    update_status md Success
fi
"""

    return section


def template_dcd2pdb_input_files(config, params):
    """Create CHARMM DCD2PDB input files for each Rg value and run combination from template."""
    print("Preparing CHARMM DCD2PDB input files")
    
    # Extract Rg values from nested params structure
    rg_values = params.get("charmm_parameters", {}).get("md", {}).get("rgyr", [])
    if not rg_values:
        print("Error: No Rg values found in charmm_parameters.md.rgyr", file=sys.stderr)
        sys.exit(1)
    
    # Get additional MD parameters to calculate conf_sample
    charmm_md_params = params.get("charmm_parameters", {}).get("md", {})
    nsteps = charmm_md_params.get("nsteps", 300000)  # Default fallback
    conf_sample = int(nsteps / 100000)
    
    workdir = config["workdir"]
    template_file = os.path.join(workdir, "dcd2pdb.tmpl")
    
    # Check if template file exists
    if not os.path.exists(template_file):
        print(f"Error: Template file {template_file} not found", file=sys.stderr)
        sys.exit(1)
    
    # Define required parameters and validate they exist
    required_params = {
        "{{charmm_topo_dir}}": "charmm_topo_dir",
        "{{in_psf_file}}": "in_psf_file",
    }
    
    # Validate required parameters exist
    for placeholder, param_key in required_params.items():
        if param_key not in params or not params[param_key]:
            print(f"Error: Required parameter '{param_key}' not found in params.json or is empty", file=sys.stderr)
            sys.exit(1)
    
    dcd2pdb_inp_files = []
    
    # Create main foxs directory
    foxs_dir = os.path.join(workdir, "foxs")
    os.makedirs(foxs_dir, exist_ok=True)

    # Create foxs_rg file
    foxs_rg = "foxs_rg.out"
    foxs_rg_path = os.path.join(workdir, foxs_rg)
    
    # Create/touch the foxs_rg file (CHARMM appends to this file)
    Path(foxs_rg_path).touch()

    # Loop through each Rg value and run number combination
    for rg_value in rg_values:
        for run in range(1, conf_sample + 1):
            # Generate filename like "dcd2pdb_rg${rg}_run${run}.inp"
            inp_filename = f"dcd2pdb_rg{rg_value}_run{run}.inp"
            inp_basename = inp_filename.replace(".inp", "")  # Remove .inp extension
            output_path = os.path.join(workdir, inp_filename)
            
            # Generate dynamic values based on bash logic
            foxs_run_dir = f"rg{rg_value}_run{run}"
            in_dcd = f"dynamics_rg{rg_value}_run{run}.dcd"
            
            print(f"Creating CHARMM DCD2PDB input file: {inp_filename} for Rg={rg_value}, run={run}")
            
            # Create FoXS output directory for this run
            foxs_output_dir = os.path.join(foxs_dir, foxs_run_dir)
            os.makedirs(foxs_output_dir, exist_ok=True)
            
            # Copy template to new input file
            try:
                shutil.copy2(template_file, output_path)
            except (OSError, IOError) as e:
                print(f"Failed to copy {template_file} to {output_path}: {e}", file=sys.stderr)
                sys.exit(1)
            
            # Read the template content
            try:
                with open(output_path, "r") as f:
                    content = f.read()
            except (OSError, IOError) as e:
                print(f"Failed to read {output_path}: {e}", file=sys.stderr)
                sys.exit(1)
            
            # Prepare all replacements including dynamic values from bash template_dcd2pdb_file
            replacements = {
                "{{charmm_topo_dir}}": str(params["charmm_topo_dir"]),
                "{{in_psf_file}}": str(params["in_psf_file"]),
                "{{in_dcd}}": in_dcd,
                "{{run}}": foxs_run_dir,  # This maps to foxs_run_dir in bash
                "{{inp_basename}}": inp_basename,
                "{{foxs_rg}}": foxs_rg,
                "{{rg}}": str(rg_value),
            }
            
            # Perform all replacements
            for placeholder, value in replacements.items():
                content = content.replace(placeholder, value)
            
            # Write the processed content back
            try:
                with open(output_path, "w") as f:
                    f.write(content)
            except (OSError, IOError) as e:
                print(f"Failed to write {output_path}: {e}", file=sys.stderr)
                sys.exit(1)
            
            # Add to list of generated files
            dcd2pdb_inp_files.append(inp_filename)
    
    print(f"Done preparing {len(dcd2pdb_inp_files)} CHARMM DCD2PDB input files")
    print(f"Created FoXS output directories in {foxs_dir}")
    return dcd2pdb_inp_files


def generate_dcd2pdb_section(config, params):
    """Generate section to extract PDB files from DCD trajectories using CHARMM."""
    # Extract Rg values from nested params structure to calculate number of jobs
    rg_values = params.get("charmm_parameters", {}).get("md", {}).get("rgyr", [])
    if not rg_values:
        print("Error: No Rg values found in charmm_parameters.md.rgyr", file=sys.stderr)
        sys.exit(1)

    # Get additional MD parameters to calculate conf_sample (number of runs per Rg)
    charmm_md_params = params.get("charmm_parameters", {}).get("md", {})
    nsteps = charmm_md_params.get("nsteps", 300000)  # Default fallback
    conf_sample = int(nsteps / 100000)
    
    # Total number of dcd2pdb input files = rg_values * conf_sample
    total_jobs = len(rg_values) * conf_sample

    # More conservative core allocation - leave some headroom for Slurm
    available_cores = config["num_cores"] - 4  # Reserve 4 cores for system overhead
    cores_per_job = max(1, int(available_cores / total_jobs))

    print(f"DCD2PDB section: {total_jobs} jobs ({len(rg_values)} Rg values × {conf_sample} runs each)")
    print(f"Allocating {cores_per_job} cores per DCD2PDB job")

    section = f"""
# --------------------------------------------------------------------------------------
# CHARMM Extract PDB from DCD Trajectories
update_status dcd2pdb Running
echo "Running CHARMM Extract PDB from DCD Trajectories..."
echo "Processing {total_jobs} DCD2PDB jobs with {cores_per_job} cores each"

# Find all dcd2pdb input files and extract just the filenames
mapfile -t dcd2pdb_files < <(find $WORKDIR -name "dcd2pdb_rg*.inp" -type f -exec basename {{}} \\; | sort)
echo "Found ${{#dcd2pdb_files[@]}} DCD2PDB input files"

# List the files for debugging
for file in "${{dcd2pdb_files[@]}}"; do
    echo "  - $file"
done

# Process all DCD2PDB jobs serially
job_count=0
for inp_file in "${{dcd2pdb_files[@]}}"; do
    # Extract basename without extension for output file
    basename=$(basename "$inp_file" .inp)
    job_count=$((job_count + 1))
    
    echo "Running DCD2PDB job $job_count/${{#dcd2pdb_files[@]}} for $inp_file"
    srun --ntasks=1 \\
         --cpus-per-task={cores_per_job} \\
         --cpu-bind=cores \\
         --job-name dcd2pdb \\
         podman-hpc run --rm \\
            -v $WORKDIR:/bilbomd/work \\
            $BILBOMD_WORKER /bin/bash -c "
                set -e
                cd /bilbomd/work/ &&
                charmm -o ${{basename}}.out -i ${{inp_file}}
            "
    
    # Check exit code immediately after each job
    DCD2PDB_EXIT=$?
    check_exit_code $DCD2PDB_EXIT dcd2pdb
    echo "DCD2PDB job $job_count completed successfully"
done

echo "Extract PDB from DCD Trajectories complete."
update_status dcd2pdb Success
"""
    return section


def generate_foxs_section(config):
    section = f"""
# --------------------------------------------------------------------------------------
# Run FoXS on all MD PDB files
update_status foxs Running
echo "Running FoXS on all MD PDB files..."
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name foxs \\
     podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/foxs &&
            python /app/scripts/nersc/run-foxs-after-charmm.py
        "
FOXS_EXIT=$?
check_exit_code $FOXS_EXIT foxs
echo "FoXS analysis complete"
update_status foxs Success
"""
    return section


def generate_multifoxs_section(config, params):
    section = f"""
# --------------------------------------------------------------------------------------
# Run MultiFoXS on FoXS results
update_status multifoxs Running
echo "Running MultiFoXS..."
MFOXSDIR=$WORKDIR/multifoxs
mkdir -p $MFOXSDIR
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name multifoxs \\
     podman-hpc run --rm \\
         -v $WORKDIR:/bilbomd/work \\
         $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/multifoxs &&
            python /app/scripts/nersc/run-multifoxs.py \\
                --foxs-list ../foxs_dat_files.txt \\
                --prefix .. \\
                --saxs-data ../{params.get("data_file")} \\
                --out-list ./foxs_dat_files_for_multifoxs.txt \\
                --log ./multi_foxs.log
        "
MFOXS_EXIT=$?
check_exit_code $MFOXS_EXIT multifoxs
echo "MultiFoXS processing complete."
update_status multifoxs Success
"""
    return section


def generate_analysis_section(config):
    section = f"""
# --------------------------------------------------------------------------------------
# Additional Analysis
update_status analysis Running
echo "Running additional analysis..."
ANALYSIS_DIR=$WORKDIR/analysis
mkdir -p $ANALYSIS_DIR
srun --ntasks=1 \\
     --cpus-per-task={config["num_cores"]} \\
     --cpu-bind=cores \\
     --job-name analysis \\
     podman-hpc run --rm \\
        -v $WORKDIR:/bilbomd/work \\
        $BILBOMD_WORKER /bin/bash -c "
            set -e
            cd /bilbomd/work/analysis &&
            python /app/scripts/openmm/plot_rgyrs.py /bilbomd/work/openmm/md
        "
ANALYSIS_EXIT=$?
check_exit_code $ANALYSIS_EXIT analysis
echo "Additional analysis complete."
update_status analysis Success
"""
    return section


def generate_end_matters(config):
    section = f"""
# --------------------------------------------------------------------------------------
# End of processing
echo "All steps completed successfully."
echo DONE processing {config["uuid"]}
sleep 20
sacct --format=JobID,JobName,Account,AllocCPUS,State,Elapsed,ExitCode,DerivedExitCode,Start,End -j $SLURM_JOB_ID
"""
    return section


def generate_copy_section(config):
    section = """
# --------------------------------------------------------------------------------------
# Copy results back to CFS
update_status copy2cfs Running
echo "Copying results back to CFS..."
cp -nR $WORKDIR/* $UPLOAD_DIR
CP_EXIT=$?
check_exit_code $CP_EXIT copy2cfs
update_status copy2cfs Success
"""
    return section


# -----------------------------------------------------------------------------
# Main Assembly
# -----------------------------------------------------------------------------
def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <UUID>")
        sys.exit(1)
    uuid = sys.argv[1]

    # Step 1: Setup environment
    config = setup_environment(uuid)

    # Step 2: Prepare input and read the job params
    params = prepare_input(config["workdir"], config["upload_dir"])

    # Step 3: Use template files to create CHARMM input files
    copy_template_files(config)
    template_minimization_file(config, params)
    template_heat_file(config, params)
    template_md_files(config, params)
    template_dcd2pdb_input_files(config, params)

    # Step 4: Create status file
    create_status_file(config["workdir"])

    # Step 5: Generate Slurm script sections
    slurm_sections = []
    slurm_sections.append(generate_slurm_header(config))
    slurm_sections.append(add_helper_functions())

    if params.get("__t") == "BilboMdAlphaFold":
        slurm_sections.append(generate_alphafold_section(config))
        slurm_sections.append(select_best_alphafold_model(config))
        slurm_sections.append(generate_pae2const_section(config, params))
        slurm_sections.append(generate_pdb2crd_input_files_af(config))
        slurm_sections.append(generate_meld_all_chains_section(config))

    if params.get("__t") in ("BilboMdAuto", "BilboMdPDB"):
        slurm_sections.append(generate_pdb2crd_input_files(config, params))
        slurm_sections.append(generate_meld_all_chains_section(config))

    if params.get("__t") == "BilboMdAuto":
        slurm_sections.append(generate_pae2const_section(config, params))

    slurm_sections.append(generate_minimize_section(config))
    slurm_sections.append(generate_initial_foxs_analysis_section(config, params))
    slurm_sections.append(generate_heat_section(config))
    slurm_sections.append(generate_md_section(config, params))
    slurm_sections.append(generate_dcd2pdb_section(config, params))
    slurm_sections.append(generate_foxs_section(config))
    slurm_sections.append(generate_multifoxs_section(config, params))
    # slurm_sections.append(generate_analysis_section(config))
    slurm_sections.append(generate_end_matters(config))

    # Step 6: Write Slurm batch file
    slurm_file = Path(config["workdir"]) / "bilbomd.slurm"
    with open(slurm_file, "w") as f:
        for section in slurm_sections:
            if section:
                f.write(section)
                f.write("\n")
    print(f"Slurm batch file written to {slurm_file}")


if __name__ == "__main__":
    main()
