#!/bin/bash -l
shopt -s expand_aliases
alias docker='podman-hpc'

# Check if two arguments were provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <UUID>"
    exit 1
fi

# Assign args to global variables
UUID=$1


# -----------------------------------------------------------------------------
# SBATCH STUFF

project="m4659"
queue="regular"
constraint="gpu&hbm80g"
nodes="1"
# walltime="00:90:00"
mailtype="end,fail"
mailuser="sclassen@lbl.gov"

# Might use core number to dynamically write our slurm script and maximize
# the use of assigned node(s)
if [[ "$constraint" == gpu* ]]; then
    # NUM_CORES=128
    NUM_CORES=120
elif [[ "$constraint" = "cpu" ]]; then
    NUM_CORES=240
else
    echo "Unknown constraint: $constraint"
    exit 1  # Exit the script if the constraint is not recognized
fi


# -----------------------------------------------------------------------------
# ENV STUFF

# Set the environment (default to 'development' if not set)
ENVIRONMENT=${ENVIRONMENT:-development}

# Map 'development' to 'dev' and 'production' to 'prod'
if [ "$ENVIRONMENT" = "production" ]; then
    ENV_DIR="prod"
else
    ENV_DIR="dev"
fi

# Define base directories
BASE_DIR=${CFS}/${project}/bilbomd
UPLOAD_DIR=${BASE_DIR}/${ENV_DIR}/uploads/${UUID}
WORKDIR=${PSCRATCH}/bilbomd/${ENV_DIR}/${UUID}
TEMPLATEDIR=${BASE_DIR}/${ENV_DIR}/templates

echo "Upload directory: $UPLOAD_DIR"
echo "Work directory: $WORKDIR"
echo "Template directory: $TEMPLATEDIR"

# Docker images
WORKER=bilbomd/bilbomd-perlmutter-worker:0.0.19
AF_WORKER=bilbomd/bilbomd-colabfold:0.0.8


# -----------------------------------------------------------------------------
# GLOBAL STUFF

g_md_inp_files=()
g_pdb2crd_inp_files=()
g_rgs=""
g_dcd2pdb_inp_files=()
charmm_topo_dir="/app/scripts/bilbomd_top_par_files.str"
# These are the harcoded names output from pdb2crd.py
in_psf_file="bilbomd_pdb2crd.psf"
in_crd_file="bilbomd_pdb2crd.crd"
foxs_rg="foxs_rg.out"


# -----------------------------------------------------------------------------
# FUNCTIONS

create_working_dir() {
    mkdir -p $WORKDIR
    if [ $? -eq 0 ]; then
        echo "Perlmutter Scratch Working Directory Created Successfully"
        echo "$WORKDIR"
    else
        echo "Failed to create directory: $WORKDIR" >&2
        exit 1
    fi
}

copy_input_data() {
    cp $UPLOAD_DIR/* $WORKDIR
    if [ $? -eq 0 ]; then
        echo "Files copied successfully from CFS to PSCRATCH"
    else
        echo "Failed to copy files from $UPLOAD_DIR to $WORKDIR" >&2
        exit 1
    fi
}

read_job_params() {
    echo "Reading job parameters"

    # Common parameters
    job_type=$(jq -r '.__t' $WORKDIR/params.json)
    saxs_data=$(jq -r '.data_file' $WORKDIR/params.json)
    conf_sample=$(jq -r '.conformational_sampling' $WORKDIR/params.json)
    # Fail if essential parameters are missing
    if [ -z "$saxs_data" ]; then
        echo "Error: SAXS data missing"
        return 1
    fi
    if [ -z "$conf_sample" ]; then
        echo "Error: Conformational Sampling parameter missing"
        return 1
    fi
    if [ -z "$job_type" ]; then
        echo "Error: Job Type parameter missing"
        return 1
    fi

    # Set walltime based on job_type
    if [ "$job_type" = "BilboMdAlphaFold" ]; then
        walltime="03:00:00"
    else
        walltime="02:30:00"
    fi

    if [ "$job_type" = "BilboMdPDB" ]; then
        # Job type specific for BilboMdPDB
        pdb_file=$(jq -r '.pdb_file' $WORKDIR/params.json)
        in_psf_file="bilbomd_pdb2crd.psf"
        in_crd_file="bilbomd_pdb2crd.crd"
        constinp=$(jq -r '.const_inp_file' $WORKDIR/params.json)
        if [ -z "$pdb_file" ]; then
            echo "Error: Missing PDB file."
            return 1
        fi
        if [ -z "$constinp" ]; then
            echo "Error: Missing const_inp file"
            return 1
        fi
    elif [ "$job_type" = "BilboMdCRD" ]; then
        # Job type specific for BilboMdCRD
        pdb_file=''  # Clear the pdb_file if it's not needed
        in_psf_file=$(jq -r '.psf_file' $WORKDIR/params.json)
        in_crd_file=$(jq -r '.crd_file' $WORKDIR/params.json)
        constinp=$(jq -r '.constinp' $WORKDIR/params.json)
        if [ -z "$in_psf_file" ]; then
            echo "Error: Missing PSF file."
            return 1
        fi
        if [ -z "$in_crd_file" ]; then
            echo "Error: Missing CRD file"
            return 1
        fi
        if [ -z "$constinp" ]; then
            echo "Error: Missing const_inp file"
            return 1
        fi
    elif [ "$job_type" = "BilboMdAuto" ]; then
        # Job type specific for BilboMdCRD
        pdb_file=$(jq -r '.pdb_file' $WORKDIR/params.json)
        pae_file=$(jq -r '.pae_file' $WORKDIR/params.json)
        in_psf_file="bilbomd_pdb2crd.psf"
        in_crd_file="bilbomd_pdb2crd.crd"
        constinp="const.inp" # Will be calculated by pae_ratios.py
        if [ -z "$pdb_file" ]; then
            echo "Error: Missing PDB file."
            return 1
        fi
        if [ -z "$pae_file" ]; then
            echo "Error: Missing PAE file"
            return 1
        fi
    elif [ "$job_type" = "BilboMdAlphaFold" ]; then
        echo "Job Type: BilboMdAlphaFold"
        fasta_file=$(jq -r '.fasta_file' $WORKDIR/params.json)
        pdb_file="af-model-1.pdb"
        pae_file="af-pae.json"
        in_psf_file="bilbomd_pdb2crd.psf"
        in_crd_file="bilbomd_pdb2crd.crd"
        constinp="const.inp" # Will be calculated by pae_ratios.py
        if [ -z "$fasta_file" ]; then
            echo "Error: Missing FASTA file."
            return 1
        fi
        echo "FASTA file: $fasta_file"
    else
        echo "Error: Unrecognized job_type '$job_type'"
        return 1  # Exit with an error status
    fi

    echo "PDB file: $pdb_file"
    echo "SAXS data: $saxs_data"
    echo "Constraint input: $constinp"
    echo "Conformational Sampling: $conf_sample"
    echo "PSF file: $in_psf_file"
    echo "CRD file: $in_crd_file"
    echo "PDB file: $pdb_file"
    echo "PAE file: $pae_file"
    echo ""
}

copy_template_files() {
    echo "Copy CHARMM input file templates"

    # Copy minimize.inp and check for errors
    cp $TEMPLATEDIR/minimize.tmpl $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy minimize.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy heat.inp and check for errors
    cp $TEMPLATEDIR/heat.tmpl $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy heat.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy dynamics.inp and check for errors
    cp $TEMPLATEDIR/dynamics.tmpl $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy dynamics.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy dcd2pdb.inp and check for errors
    cp $TEMPLATEDIR/dcd2pdb.tmpl $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy dcd2pdb.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    echo "Template files copied successfully"
}

template_minimization_file() {
    echo "Preparing CHARMM Minimize input file"
    mv $WORKDIR/minimize.tmpl $WORKDIR/minimize.inp
    sed -i "s|{{charmm_topo_dir}}|$charmm_topo_dir|g" "$WORKDIR/minimize.inp"
    sed -i "s|{{in_psf_file}}|$in_psf_file|g" "$WORKDIR/minimize.inp"
    sed -i "s|{{in_crd_file}}|$in_crd_file|g" "$WORKDIR/minimize.inp"
    echo "Done Preparing CHARMM Minimize input file"
}

template_heat_file() {
    echo "Preparing CHARMM Heat input file"
    mv $WORKDIR/heat.tmpl $WORKDIR/heat.inp
    sed -i "s|{{charmm_topo_dir}}|$charmm_topo_dir|g" "$WORKDIR/heat.inp"
    sed -i "s|{{in_psf_file}}|$in_psf_file|g" "$WORKDIR/heat.inp"
    sed -i "s|{{constinp}}|$constinp|g" "$WORKDIR/heat.inp"
    echo "Done Preparing CHARMM Heat input file"
}

create_status_txt_file() {
    echo "Creating initial status.txt file"

    status_file="${WORKDIR}/status.txt"
    # Truncate the status file (or create it if it doesn't exist)
    > "$status_file"

    steps=(alphafold pdb2crd meld pae autorg minimize initfoxs heat md dcd2pdb foxs multifoxs copy2cfs)
    for step in "${steps[@]}"; do
        echo "$step: Waiting" >> "$status_file"
    done
    echo "Done Creating initial status.txt file"
}

initialize_job() {
    echo "Initialize Job"
    echo ""
    echo "queue: $queue"
    echo "project: $project"
    echo "constraint: $constraint"
    echo "nodes: $nodes"
    echo "walltime: $walltime"
    echo ""
    create_working_dir
    copy_input_data
    read_job_params
    copy_template_files
    template_minimization_file
    template_heat_file
    create_status_txt_file
}

template_md_input_files() {

    local inp_file="$1"
    local inp_basename="$2"
    local rg_value="$3"
    local timestep=0.001
    echo "Generate a CHARMM MD input file ${inp_file} from a template"

    # Copy the template file to the new input file
    cp "${WORKDIR}/dynamics.tmpl" "${WORKDIR}/${inp_file}"
    
    # Perform sed substitutions
    sed -i "s|{{charmm_topo_dir}}|${charmm_topo_dir}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{in_psf_file}}|${in_psf_file}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{constinp}}|${constinp}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{rg}}|${rg_value}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{inp_basename}}|${inp_basename}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{conf_sample}}|${conf_sample}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{timestep}}|${timestep}|g" "${WORKDIR}/${inp_file}"
}

generate_pdb2crd_input_files() {
    local command="cd /bilbomd/work/ && python /app/scripts/pdb2crd.py $pdb_file . > pdb2crd_output.txt"
    docker run --rm --volume ${WORKDIR}:/bilbomd/work ${WORKER} /bin/bash -c "$command"
    if [[ -f "${WORKDIR}/pdb2crd_output.txt" ]]; then
        local output=$(cat "${WORKDIR}/pdb2crd_output.txt")
    else
        echo "Output file not found." >&2
        exit 1
    fi
    # Parse the output to get the names of the generated .inp files
    g_pdb2crd_inp_files=($(echo "$output"))

    if [[ ${#g_pdb2crd_inp_files[@]} -eq 0 ]]; then
        echo "No input files were parsed, check the output for errors." >&2
        exit 1
    fi

    echo ${g_pdb2crd_inp_files[@]}
}

generate_pdb2crd_input_files_af() {
    cat << EOF > $WORKDIR/make_pdb2crd_inp_files
# -----------------------------------------------------------------------------
# Convert AF PDB to CRD/PSF
update_status pdb2crd Running
echo "Generating pdb2crd input files..."
srun --job-name af-pdb2crd podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${AF_WORKER} /bin/bash -c "cd /bilbomd/work/ && python /app/scripts/pdb2crd.py af-rank1.pdb . > pdb2crd_output.txt"

# Parse the file "pdb2crd_output.txt"
# This will also run CHARMM for each chain-specific *.inp file
#
# Get the number of lines (files) in pdb2crd_output.txt
num_inp_files=\$(wc -l < \${WORKDIR}/pdb2crd_output.txt)
echo "Number of pdb2crd.inp files to process: \$num_inp_files"
cpus=\$((NUM_CORES / num_inp_files))
if [ "\$cpus" -lt 1 ]; then
    cpus=1
fi
# Array to hold all background PIDs
pids=()
while IFS= read -r filename; do
    # Extract the filename prefix (without extension)
    filename_prefix=\$(basename "\$filename" .inp)

    # Generate the srun command
    srun --ntasks=1 --cpus-per-task=\$cpus --cpu-bind=cores --job-name pdb2crd podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && charmm -o \${filename_prefix}.out -i \${filename}" &
     # Capture the PID of the backgrounded srun command
    pids+=(\$!)
done < \${WORKDIR}/pdb2crd_output.txt

# Wait for all background jobs to complete & check their exit codes
for pid in "\${pids[@]}"; do
    wait \$pid
    exit_code=\$?
    check_exit_code \$exit_code pdb2crd
done

echo "Individual chains converted to CRD files."
update_status pdb2crd Success

EOF
}

run_autorg(){
    # Runs autorg.py
    # which will return an object with this shape
    # {"rg": 46, "rg_min": 37, "rg_max": 69}
    local command="cd /bilbomd/work/ && python /app/scripts/autorg.py $saxs_data > autorg_output.txt 2>autorg_error.log"
    docker run --rm --volume ${WORKDIR}:/bilbomd/work ${WORKER} /bin/bash -c "$command" 2>/dev/null
}

generate_meld_all_chains_commands() {
    cat << EOF > $WORKDIR/meld_cmds
# -----------------------------------------------------------------------------
# Meld individual chains to create CRD and PSF file
update_status meld Running
echo "Melding pdb2crd_charmm_meld.inp..."

srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name meld podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && charmm -o pdb2crd_charmm_meld.out -i pdb2crd_charmm_meld.inp"
MELD_EXIT=\$?
check_exit_code \$MELD_EXIT meld

echo "All Individual CRD files melded into bilbomd_pdb2crd.crd"
update_status meld Success

EOF
}

generate_md_input_files() {
    echo "Checking if rg_min and rg_max can be extracted from params.json"

    # Attempt to extract rg_min and rg_max from params.json
    if [[ -f "${WORKDIR}/params.json" ]]; then
        local rg_min=$(jq -r '.rg_min' "${WORKDIR}/params.json")
        local rg_max=$(jq -r '.rg_max' "${WORKDIR}/params.json")
    fi

    # Check if rg_min and rg_max are set in params.json
    if [[ -n "$rg_min" && -n "$rg_max" && "$rg_min" != "null" && "$rg_max" != "null" ]]; then
        echo "rg_min and rg_max found in params.json: $rg_min to $rg_max"
    else
        echo "rg_min and rg_max not found in params.json, running run_autorg"

        run_autorg

        if [[ -f "${WORKDIR}/autorg_output.txt" ]]; then
            local output=$(cat "${WORKDIR}/autorg_output.txt")
            # Use sed to extract JSON object
            local json_output=$(echo "$output" | sed -n 's/.*\({.*}\).*/\1/p')
            rg_min=$(echo $json_output | jq '.rg_min')
            rg_max=$(echo $json_output | jq '.rg_max')

            echo "Rg range: $rg_min to $rg_max"
        else
            echo "Output file not found." >&2
            exit 1
        fi
    fi

    # Calculate the step size
    local step=$(( (rg_max - rg_min) / 4 ))
    step=$(( step > 0 ? step : 1 ))  # Ensure that step is at least 1
    echo "Rg step is: ${step} Ang."

    # Base template for CHARMM files
    local charmm_template="dynamics"

    # Loop over the range of Rg values and generate input files
    for (( rg=rg_min; rg<=rg_max; rg+=step )); do
        local charmm_inp_file="${charmm_template}_rg${rg}.inp"
        local inp_basename="${charmm_template}_rg${rg}"
        template_md_input_files $charmm_inp_file $inp_basename $rg
        g_md_inp_files+=("$charmm_inp_file")
        g_rgs+="${rg} "
    done
}

template_dcd2pdb_file() {
    local inp_file="$1"
    local basename="$2"
    local rg="$3"
    local run="$4"
    local foxs_run_dir="rg${rg}_run${run}"
    local in_dcd="dynamics_rg${rg}_run${run}.dcd"
    cp "${WORKDIR}/dcd2pdb.tmpl" "${WORKDIR}/${inp_file}"
    sed -i "s|{{charmm_topo_dir}}|${charmm_topo_dir}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{in_psf_file}}|${in_psf_file}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{in_dcd}}|${in_dcd}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{run}}|${foxs_run_dir}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{inp_basename}}|${basename}|g" "${WORKDIR}/${inp_file}"
    sed -i "s|{{foxs_rg}}|${foxs_rg}|g" "${WORKDIR}/${inp_file}"
    # make all the FoXS output directories where we will extract PDBs from the DCD
    mkdir -p $WORKDIR/foxs/$foxs_run_dir
    # Since CHARMM is always appending to this file we need to create it first.
    touch $WORKDIR/${foxs_rg}

}

generate_dcd2pdb_input_files() {
    for rg in $g_rgs; do
        for ((run=1;run<=${conf_sample};run+=1));do
            dcd2pdb_inp_filename="dcd2pdb_rg${rg}_run${run}.inp"
            dcd2pdb_inp_filebasename="${dcd2pdb_inp_filename%.inp}"
            template_dcd2pdb_file "$dcd2pdb_inp_filename" "$dcd2pdb_inp_filebasename" "$rg" "$run"
            g_dcd2pdb_inp_files+=("$dcd2pdb_inp_filename")
        done
    done
}

generate_bilbomd_slurm_header() {
    local cpus=$1
    echo "generate_bilbomd_slurm_header for $1 OMP threads"
    cat << EOF > $WORKDIR/slurmheader
#!/bin/bash -l
#SBATCH --qos=${queue}
#SBATCH --nodes=${nodes}
#SBATCH --time=${walltime}
#SBATCH --licenses=cfs,scratch
#SBATCH --constraint="${constraint}"
#SBATCH --account=${project}
#SBATCH --output=${WORKDIR}/slurm-%j.out
#SBATCH --error=${WORKDIR}/slurm-%j.err
#SBATCH --mail-type=${mailtype}
#SBATCH --mail-user=${mailuser}

export PODMANHPC_PODMAN_BIN=/global/common/shared/das/podman-4.7.0/bin/podman

# OpenMP settings:
export OMP_NUM_THREADS=$1
export OMP_PLACES=threads
export OMP_PROC_BIND=spread

# -----------------------------------------------------------------------------
# Some global ENV variables
NUM_CORES=${NUM_CORES}
UPLOAD_DIR="${UPLOAD_DIR}"
WORKDIR="${WORKDIR}"
STATUS_FILE="${WORKDIR}/status.txt"

# -----------------------------------------------------------------------------
# Status Stuff
set -o monitor


g_pdb2crd_inp_files=()

# Updates our status.txt file using sed to update values
update_status() {
  local step=\$1
  local status=\$2
  echo "Update \$step status: \$status"
  # Use sed to update the status file
  sed -i "s/^\$step: .*/\$step: \$status/" "\$STATUS_FILE"
}

# Check exit code and cancel the SLURM job if non-zero
check_exit_code() {
  local exit_code=\$1
  local step=\$2
  if [ \$exit_code -ne 0 ]; then
    echo "Process in \$step failed with exit code \$exit_code. Cancelling SLURM job."
    update_status \$step Error
    scancel \$SLURM_JOB_ID
    exit \$exit_code
  fi
}

EOF
}

generate_pdb2crd_commands() {
    cat << EOF > $WORKDIR/pdb2crd
# -----------------------------------------------------------------------------
# Convert PDB to CRD/PSF
EOF
    echo "echo \"START\"" >> $WORKDIR/pdb2crd
    echo "update_status pdb2crd Running" >> $WORKDIR/pdb2crd
    # echo "set_error_trap_child pdb2crd" >> $WORKDIR/pdb2crd
    local num_inp_files=${#g_pdb2crd_inp_files[@]}
    local cpus=$(($NUM_CORES/$num_inp_files))
    local count=1
    for inp in "${g_pdb2crd_inp_files[@]}"; do
        # echo "echo \"Starting $inp\" &" >> $WORKDIR/pdb2crd
        local command="srun --ntasks=1 --cpus-per-task=$cpus --cpu-bind=cores --job-name pdb2crd podman-hpc run --rm --userns=keep-id -v ${WORKDIR}:/bilbomd/work -v ${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c \"cd /bilbomd/work/ && charmm -o ${inp%.inp}.out -i ${inp}\" &"
        echo $command >> $WORKDIR/pdb2crd
        echo "PDB2CRD_PID$count=\$!" >> $WORKDIR/pdb2crd
        echo sleep 10 >> $WORKDIR/pdb2crd
        ((count++))
    done
    echo "" >> $WORKDIR/pdb2crd
    echo "# Wait for all PDB to CRD jobs to finish" >> $WORKDIR/pdb2crd
    local count=1
    for inp in "${g_pdb2crd_inp_files[@]}"; do
        echo "wait \$PDB2CRD_PID$count" >> $WORKDIR/pdb2crd
        echo "PDB2CRD_EXIT$count=\$?" >> $WORKDIR/pdb2crd
        echo "check_exit_code \$PDB2CRD_EXIT$count pdb2crd" >> $WORKDIR/pdb2crd
        ((count++))
    done
    echo "" >> $WORKDIR/pdb2crd
    local count=1
    for inp in "${g_pdb2crd_inp_files[@]}"; do
        echo "echo \"Exit code for pdb2crd$count \$PDB2CRD_PID$count: \$PDB2CRD_EXIT$count\"" >> $WORKDIR/pdb2crd
        ((count++))
    done
    echo "" >> $WORKDIR/pdb2crd
    echo "echo \"Individual chains converted to CRD files.\"" >> $WORKDIR/pdb2crd
    echo "" >> $WORKDIR/pdb2crd
    echo "# Meld all individual CRD files" >> $WORKDIR/pdb2crd
    echo "echo \"Melding pdb2crd_charmm_meld.inp\"" >> $WORKDIR/pdb2crd
    # echo "set_error_trap pdb2crd" >> $WORKDIR/pdb2crd
    local command="srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name meld podman-hpc run --rm --userns=keep-id -v ${WORKDIR}:/bilbomd/work -v ${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c \"cd /bilbomd/work/ && charmm -o pdb2crd_charmm_meld.out -i pdb2crd_charmm_meld.inp\""
    echo $command >> $WORKDIR/pdb2crd
    echo "MELD_EXIT=\$?" >> $WORKDIR/pdb2crd
    echo "check_exit_code \$MELD_EXIT pdb2crd" >> $WORKDIR/pdb2crd
    echo "" >> $WORKDIR/pdb2crd
    echo "echo \"All Individual CRD files melded into bilbomd_pdb2crd.crd\"" >> $WORKDIR/pdb2crd
    echo "update_status pdb2crd Success" >> $WORKDIR/pdb2crd
    echo "" >> $WORKDIR/pdb2crd
}

generate_pae2const_commands() {
    cat << EOF > $WORKDIR/pae2const
# -----------------------------------------------------------------------------
# Create const.inp from Alphafold PAE Matrix
update_status pae Running
echo "Calculate const.inp from PAE matrix..."
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name pae2const podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && python /app/scripts/pae_ratios.py ${pae_file} ${in_crd_file} > pae_ratios.log 2>&1"
PAE_EXIT=\$?
check_exit_code \$PAE_EXIT pae

echo "const.inp generated from PAE matrix"
update_status pae Success

EOF
}

generate_min_heat_commands(){
    local profileSize=$(countDataPoints "$WORKDIR/$saxs_data")
    local foxs_args=(
    '--offset'
    '--min_c1=0.99'
    '--max_c1=1.05'
    '--min_c2=-0.50'
    '--max_c2=2.00'
    "--profile_size=${profileSize}"
    'minimization_output.pdb'
    "${saxs_data}"
)
    cat << EOF > $WORKDIR/minheat
# -----------------------------------------------------------------------------
# CHARMM Minimize
echo "Running CHARMM Minimize..."
update_status minimize Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name minimize podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && charmm -o minimize.out -i minimize.inp"
MIN_EXIT=\$?
check_exit_code \$MIN_EXIT minimize

echo "CHARMM Minimize complete"
update_status minimize Success

# -----------------------------------------------------------------------------
# FoXS Analysis of minimized PDB
echo "Running Initial FoXS Analysis..."
update_status initfoxs Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name initfoxs podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && foxs ${foxs_args[@]} > initial_foxs_analysis.log 2> initial_foxs_analysis_error.log"
INITFOXS_EXIT=\$?
check_exit_code \$INITFOXS_EXIT initfoxs

echo "Initial FoXS Analysis complete"
update_status initfoxs Success

# -----------------------------------------------------------------------------
# CHARMM Heat
echo "Running CHARMM Heat..."
update_status heat Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name heat podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && charmm -o heat.out -i heat.inp"
HEAT_EXIT=\$?
check_exit_code \$HEAT_EXIT heat

echo "CHARMM Heating complete"
update_status heat Success

EOF
}

generate_alphafold_commands() {
    cat << EOF > $WORKDIR/alphafold_cmd
# -----------------------------------------------------------------------------
# Run ColabFoldLocal (i.e AlphaFold)
# nvidia-smi
update_status alphafold Running
echo "Running AlphaFold..."
srun --gpus=4 --job-name alphafold podman-hpc run --rm --gpu --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${AF_WORKER} /bin/bash -c "cd /bilbomd/work/ && colabfold_batch --num-models=3 --amber --use-gpu-relax --num-recycle=4 af-entities.fasta alphafold"
AF_EXIT=\$?
check_exit_code \$AF_EXIT alphafold

echo "AlphaFold Done."
update_status alphafold Success

EOF
}

generate_prep_af_data_commands() {
    cat << EOF > $WORKDIR/alphafoldmodel
# -----------------------------------------------------------------------------
# Copy Best AlphaFold Model and PAE results to working directory
echo "Selecting Best AlphaFold Model..."
cp \${WORKDIR}/alphafold/*_relaxed_rank_001_*.pdb \${WORKDIR}/af-rank1.pdb
cp \${WORKDIR}/alphafold/*_predicted_aligned_error_v1.json \${WORKDIR}/af-pae.json
echo "AlphaFold model and PAE file copied to \${WORKDIR}"

EOF
}

generate_dynamics_commands() {
    cat << EOF > $WORKDIR/dynamics
# -----------------------------------------------------------------------------
# CHARMM Molecular Dynamics
EOF
    local num_inp_files=${#g_md_inp_files[@]}
    local count=1
    cpus=$(($NUM_CORES/$num_inp_files))
    echo "echo \"Running CHARMM Molecular Dynamics...\"" >> $WORKDIR/dynamics
    echo "update_status md Running" >> $WORKDIR/dynamics
    for inp in "${g_md_inp_files[@]}"; do
        local command="srun --ntasks=1 --cpus-per-task=$cpus --cpu-bind=cores --job-name md$count podman-hpc run --gpu --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c \"cd /bilbomd/work/ && charmm -o ${inp%.inp}.out -i ${inp}\" &"
        echo $command >> $WORKDIR/dynamics
        echo "MD_PID$count=\$!" >> $WORKDIR/dynamics
        echo "sleep 5" >> $WORKDIR/dynamics
        ((count++))
    done
    echo "" >> $WORKDIR/dynamics
    echo "# Wait for all Molecular Dynamics jobs to finish" >> $WORKDIR/dynamics
    # echo "wait" >> $WORKDIR/dynamics
    local count=1
    for inp in "${g_md_inp_files[@]}"; do
        echo "wait \$MD_PID$count" >> $WORKDIR/dynamics
        echo "MD_EXIT$count=\$?" >> $WORKDIR/dynamics
        echo "check_exit_code \$MD_EXIT$count md" >> $WORKDIR/dynamics
        ((count++))
    done
    echo "" >> $WORKDIR/dynamics
    local count=1
    for inp in "${g_md_inp_files[@]}"; do
        echo "echo \"Exit code for md$count \$MD_PID$count: \$MD_EXIT$count\"" >> $WORKDIR/dynamics
        ((count++))
    done
    echo "echo \"CHARMM Molecular Dynamics complete\"" >> $WORKDIR/dynamics
    echo "update_status md Success" >> $WORKDIR/dynamics
    echo "" >> $WORKDIR/dynamics

}

generate_dcd2pdb_commands() {
    cat << EOF > $WORKDIR/dcd2pdb
# -----------------------------------------------------------------------------
# CHARMM Extract PDB from DCD Trajectories
echo "Running CHARMM Extract PDB from DCD Trajectories..."
update_status dcd2pdb Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name dcd2pdb podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && ./run_dcd2pdb.sh"
DCD2PDB_EXIT=\$?
check_exit_code \$DCD2PDB_EXIT dcd2pdb

echo "Extract PDB from DCD Trajectories complete."
update_status dcd2pdb Success

EOF
}

generate_dcd2pdb_script() {
    local dcd2pdb_script="$WORKDIR/run_dcd2pdb.sh"
    > $dcd2pdb_script
    echo "#!/bin/bash" >> $dcd2pdb_script
    echo "parallel 'charmm -o {.}.out -i {}' ::: dcd2pdb_rg*.inp" >> $dcd2pdb_script
    echo "" >> $dcd2pdb_script
    chmod u+x $dcd2pdb_script
}

generate_foxs_commands() {
    touch $WORKDIR/foxs_dat_files.txt
    cat << EOF > $WORKDIR/foxssection
# -----------------------------------------------------------------------------
# Run FoXS to calculate SAXS curves
echo "Run FoXS to calculate SAXS curves..."
update_status foxs Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name foxs podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/foxs && ../run_foxs.sh"
FOXS_EXIT=\$?
check_exit_code \$FOXS_EXIT foxs

echo "FoXS to calculate SAXS curves complete"
update_status foxs Success

EOF
}

generate_foxs_scripts() {
    local root_dir=$WORKDIR/foxs
    cat << EOF > $WORKDIR/run_foxs.sh
#!/bin/bash
echo "Run FoXS..."
find . -type d -name 'rg*_run*' | while read rundir; do
  echo "Processing directory: \$rundir"
  if [ -d "\$rundir" ]; then
    cd "\$rundir"
    parallel "foxs -p {} >> foxs.log 2>> foxs_error.log && echo \$(pwd)/{}.dat | sed 's|/bilbomd/work|..|' >> foxs_dat_files.txt" ::: *.pdb
    cd /bilbomd/work/foxs
  else
    echo "Directory not found: \$rundir"
  fi
done
EOF
    chmod u+x $WORKDIR/run_foxs.sh
}

generate_multifoxs_script() {
    local multifox_dir=$WORKDIR/multifoxs
    mkdir -p $multifox_dir
    local foxs_dat_files=$multifox_dir/foxs_dat_files.txt
    > $foxs_dat_files
    local multifoxs_script="$WORKDIR/run_multifoxs.sh"
    > $multifoxs_script
    chmod u+x $multifoxs_script

    # Catenate all /bilbomd/work/foxs/rg${rg}_run${run}/ files
    echo "#!/bin/bash -l" >> $multifoxs_script
    # Iterate over each rg value
    for rg in $g_rgs; do
        # Iterate over each run within each rg value
        for ((run=1; run<=conf_sample; run+=1)); do
            dir_path="/bilbomd/work/foxs/rg${rg}_run${run}"
            echo "cat ${dir_path}/foxs_dat_files.txt >> /bilbomd/work/multifoxs/foxs_dat_files.txt" >> $multifoxs_script
        done
    done
    echo "cd /bilbomd/work/multifoxs" >> $multifoxs_script
    echo "multi_foxs -o ../$saxs_data ./foxs_dat_files.txt &> multi_foxs.log" >> $multifoxs_script
}

generate_multifoxs_command() {
    cat << EOF > $WORKDIR/multifoxssection
# -----------------------------------------------------------------------------
# Run MultiFoXS to calculate best ensemble
echo "Run MultiFoXS to calculate best ensemble..."
update_status multifoxs Running
srun --ntasks=1 --cpus-per-task=$NUM_CORES --cpu-bind=cores --job-name multifoxs podman-hpc run --rm --userns=keep-id -v \${WORKDIR}:/bilbomd/work -v \${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && ./run_multifoxs.sh"
MFOXS_EXIT=\$?
check_exit_code \$MFOXS_EXIT multifoxs

echo "MultiFoXS processing complete."
update_status multifoxs Success

EOF
}

generate_copy_commands() {
    cat << EOF > $WORKDIR/copysection
# -----------------------------------------------------------------------------
# Copy results back to CFS
echo "Copying results back to CFS..."
update_status copy2cfs Running
cp -nR $WORKDIR/* $UPLOAD_DIR
CP_EXIT=\$?
check_exit_code \$CP_EXIT copy2cfs
update_status copy2cfs Success

EOF
}

generate_end_matters() {
    cat << EOF > $WORKDIR/endsection
# -----------------------------------------------------------------------------
# Finish up
echo "DONE ${UUID}"
sleep 20
sacct --format=JobID,JobName,Account,AllocCPUS,State,Elapsed,ExitCode,DerivedExitCode,Start,End -j \$SLURM_JOB_ID

EOF
}

append_slurm_sections() {
    cd $WORKDIR
    if [ "$job_type" = "BilboMdPDB" ]; then
        cat slurmheader pdb2crd minheat dynamics dcd2pdb foxssection multifoxssection endsection > bilbomd.slurm
    elif [ "$job_type" = "BilboMdCRD" ]; then
        cat slurmheader minheat dynamics dcd2pdb foxssection multifoxssection endsection > bilbomd.slurm
    elif [ "$job_type" = "BilboMdAuto" ]; then
        cat slurmheader pdb2crd pae2const minheat dynamics dcd2pdb foxssection multifoxssection endsection > bilbomd.slurm
    elif [ "$job_type" = "BilboMdAlphaFold" ]; then
        cat slurmheader alphafold_cmd alphafoldmodel make_pdb2crd_inp_files meld_cmds pae2const minheat dynamics dcd2pdb foxssection multifoxssection endsection > bilbomd.slurm
    else
        echo "Error: Unrecognized job_type '$job_type'"
        return 1  # Exit with an error status
    fi
    
}

cleanup() {
    echo "Cleaning $WORKDIR"
    cd $WORKDIR
    rm -f slurmheader alphafold_cmd alphafoldmodel pdb2crd make_pdb2crd_inp_files meld_cmds pae2const minheat dynamics dcd2pdb foxssection multifoxssection endsection *.tmpl
}

countDataPoints() {
    local filePath="$1"
    local count=0

    # Read each line of the file
    while IFS= read -r line || [ -n "$line" ]; do
        # Trim leading and trailing whitespace
        local trimmed=$(echo "$line" | awk '{$1=$1};1')

        # Check that the line is not empty and does not start with '#'
        if [[ -n "$trimmed" && "$trimmed" != \#* ]]; then
            ((count++))
        fi
    done < "$filePath"

    # Adjust count by subtracting 1
    count=$((count - 1))

    # Return the adjusted count
    echo $count
}

echo "---------------------------- START JOB PREP ----------------------------"
echo "----------------- ${UUID} -----------------"

initialize_job

if [ "$job_type" = "BilboMdAlphaFold" ]; then
    generate_alphafold_commands
    generate_prep_af_data_commands
    generate_pdb2crd_input_files_af
    generate_meld_all_chains_commands
fi

if [ "$job_type" = "BilboMdPDB" ] || [ "$job_type" = "BilboMdAuto" ]; then
    generate_pdb2crd_input_files
    generate_pdb2crd_commands
fi

generate_md_input_files
generate_dcd2pdb_input_files


if [ "$job_type" = "BilboMdAuto" ] || [ "$job_type" = "BilboMdAlphaFold" ]; then
    generate_pae2const_commands
fi

generate_min_heat_commands
generate_dynamics_commands
generate_dcd2pdb_commands
generate_dcd2pdb_script
generate_foxs_commands
generate_foxs_scripts
generate_multifoxs_command
generate_multifoxs_script
# generate_copy_commands
generate_end_matters

echo "CPUS: $cpus"
generate_bilbomd_slurm_header $cpus
append_slurm_sections

cleanup

echo "----------------------------- END JOB PREP -----------------------------"
