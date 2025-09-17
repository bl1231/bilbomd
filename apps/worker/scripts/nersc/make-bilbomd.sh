#!/bin/bash -l
#

# Check if two arguments were provided
if [ $# -ne 2 ]; then
    echo "Usage: $0 <UUID> <JOB_TYPE>"
    exit 1
fi

# Assign args to global variables
UUID=$1
JOB_TYPE=$2

# Validate the JOB_TYPE
case $JOB_TYPE in
    'BilboMdPDB'|'BilboMdCRD'|'BilboMdAuto')
        echo "Proceeding with JOB_TYPE: $JOB_TYPE"
        ;;
    *)
        echo "Error: Invalid JOB_TYPE '$JOB_TYPE'. Allowed values are 'BilboMdPDB', 'BilboMdCRD', 'BilboMdAuto'."
        exit 1
        ;;
esac

# -----------------------------------------------------------------------------
# SBATCH STUFF
project="m4659"
queue="debug"
constraint="gpu"
nodes="1"
time="00:30:00"
mailtype="end,fail"
mailuser="sclassen@lbl.gov"

# Might use core number to dynamically write our slurm script and maximize
# the use of assigned node(s)
if [ "$constraint" = "gpu" ]; then
    NUM_CORES=128
elif [ "$constraint" = "cpu" ]; then
    NUM_CORES=256
else
    echo "Unknown constraint: $constraint"
    exit 1  # Exit the script if the constraint is not recognized
fi

UPLOAD_DIR=${CFS}/${project}/bilbomd-uploads/${UUID}
WORKDIR=${PSCRATCH}/bilbmod/${UUID}
TEMPLATEDIR=${CFS}/${project}/bilbomd-templates
WORKER=bilbomd/bilbomd-perlmutter-worker:0.0.5


# other globals
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

copy_input_data() {
    cp $UPLOAD_DIR/* $WORKDIR
    if [ $? -eq 0 ]; then
        echo "Files copied successfully from CFS to PSCRATCH"
    else
        echo "Failed to copy files from $UPLOAD_DIR to $WORKDIR" >&2
        exit 1
    fi
}

create_working_dir() {
    mkdir -p $WORKDIR
    if [ $? -eq 0 ]; then
        echo "Perlmutter Scratch Working Directory created successfully"
        echo "---------------"
        echo "$WORKDIR"
        echo "---------------"
    else
        echo "Failed to create directory: $WORKDIR" >&2
        exit 1
    fi
}

read_job_params() {
    echo "Reading job parameters for job type: $JOB_TYPE"

    # Common parameters
    saxs_data=$(jq -r '.saxs_data' $WORKDIR/params.json)
    conf_sample=$(jq -r '.conf_sample' $WORKDIR/params.json)
    # Fail if essential parameters are missing
    if [ -z "$saxs_data" ] || [ -z "$conf_sample" ]; then
        echo "Error: Essential parameter missing (SAXS data or conf_sample)."
        return 1
    fi


    if [ "$JOB_TYPE" = "BilboMdPDB" ]; then
        # Job type specific for BilboMdPDB
        pdb_file=$(jq -r '.pdb_file' $WORKDIR/params.json)
        in_psf_file="bilbomd_pdb2crd.psf"
        in_crd_file="bilbomd_pdb2crd.crd"
        constinp=$(jq -r '.constinp' $WORKDIR/params.json)

        if [ -z "$pdb_file" ]; then
            echo "Error: Missing PDB file."
            return 1
        fi
        if [ -z "$constinp" ]; then
            echo "Error: Missing const_inp file"
            return 1
        fi
        echo "Read BilboMdPDB Job Params."

    elif [ "$JOB_TYPE" = "BilboMdCRD" ]; then
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
        echo "Read BilboMdCRD Job Params."

    elif [ "$JOB_TYPE" = "BilboMdAuto" ]; then
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
        echo "Read BilboMdAuto Job Params."
    else
        echo "Error: Unrecognized JOB_TYPE '$JOB_TYPE'"
        return 1  # Exit with an error status
    fi

    # Echo the variables to verify they're read correctly
    echo "PDB file: $pdb_file"
    echo "SAXS data: $saxs_data"
    echo "Constraint input: $constinp"
    echo "Conformational Sampling: $conf_sample"
    echo "PSF file: $in_psf_file"
    echo "CRD file: $in_crd_file"
    echo "PDB file: $pdb_file"
    echo "PAE file: $pae_file"
}


copy_template_files() {
    echo "Copy CHARMM input file templates"

    # Copy minimize.inp and check for errors
    cp $TEMPLATEDIR/minimize.inp $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy minimize.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy heat.inp and check for errors
    cp $TEMPLATEDIR/heat.inp $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy heat.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy dynamics.inp and check for errors
    cp $TEMPLATEDIR/dynamics.inp $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy dynamics.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    # Copy dcd2pdb.inp and check for errors
    cp $TEMPLATEDIR/dcd2pdb.inp $WORKDIR
    if [ $? -ne 0 ]; then
        echo "Failed to copy dcd2pdb.inp from $TEMPLATEDIR to $WORKDIR" >&2
        exit 1
    fi

    echo "Template files copied successfully"
}

template_min_heat_files() {
    echo "Preparing CHARMM Minimize input file"
    sed -i "s|{{charmm_topo_dir}}|$charmm_topo_dir|g" $WORKDIR/minimize.inp
    sed -i "s|{{in_psf_file}}|$in_psf_file|g" $WORKDIR/minimize.inp
    sed -i "s|{{in_crd_file}}|$in_crd_file|g" $WORKDIR/minimize.inp

    echo "Preparing CHARMM Heat input file"
    sed -i "s|{{charmm_topo_dir}}|$charmm_topo_dir|g" $WORKDIR/heat.inp
    sed -i "s|{{in_psf_file}}|$in_psf_file|g" $WORKDIR/heat.inp
    sed -i "s|{{constinp}}|$constinp|g" $WORKDIR/heat.inp
}

initialize_job() {
    echo "Initialize Job"
    echo "---------------"
    echo "queue: $queue"
    echo "project: $project"
    echo "constraint: $constraint"
    echo "nodes: $nodes"
    echo "time: $time"
    echo "---------------"
    echo ""
    create_working_dir
    copy_input_data
    read_job_params
    copy_template_files
    template_min_heat_files
}

template_md_input_files() {
    echo "Generate a CHARMM MD input file ${inp_file} from a template"
    local inp_file="$1"
    local inp_basename="$2"
    local rg_value="$3"
    local timestep=0.001

    # Copy the template file to the new input file
    cp "${WORKDIR}/dynamics.inp" "${WORKDIR}/${inp_file}"
    
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
    podman-hpc run --rm --userns=keep-id --volume ${WORKDIR}:/bilbomd/work ${WORKER} /bin/bash -c "$command"
    if [[ -f "${WORKDIR}/pdb2crd_output.txt" ]]; then
        local output=$(cat "${WORKDIR}/pdb2crd_output.txt")
    else
        echo "Output file not found." >&2
        exit 1
    fi
    # Parse the output to get the names of the generated .inp files
    g_pdb2crd_inp_files=($(echo "$output" | grep 'FILE_CREATED:' | awk '{print $2}'))
    if [[ ${#g_pdb2crd_inp_files[@]} -eq 0 ]]; then
        echo "No input files were parsed, check the output for errors." >&2
        exit 1
    fi
    echo $g_pdb2crd_inp_files
}

run_autorg(){
    # runs autoprg.py
    # which will return an onject with this shape
    # {"rg": 46, "rg_min": 37, "rg_max": 69}
    local command="cd /bilbomd/work/ && python /app/scripts/autorg.py $saxs_data > autorg_output.txt"
    podman-hpc run --rm --userns=keep-id --volume ${WORKDIR}:/bilbomd/work ${WORKER} /bin/bash -c "$command"
    if [[ -f "${WORKDIR}/autorg_output.txt" ]]; then
        local output=$(cat "${WORKDIR}/autorg_output.txt")
        local rg_min=$(echo $output | jq '.rg_min')
        local rg_max=$(echo $output | jq '.rg_max')
        echo "$rg_min $rg_max"
    else
        echo "Output file not found." >&2
        exit 1
    fi
}

generate_md_input_files() {
    echo "Calculate Rg values"
    local rg_values=$(run_autorg)
    local rg_min=$(echo $rg_values | cut -d' ' -f1)
    local rg_max=$(echo $rg_values | cut -d' ' -f2)

    echo "Rg range: $rg_min to $rg_max"
    # Calculate the step size
    local step=$(($((rg_max - rg_min)) / 4))
    local step=$(( step > 0 ? step : 1 ))  # Ensuring that step is at least 1
    echo "Rg step is: ${step} Ang."

    # Base template for CHARMM files
    local charmm_template="dynamics"

    for (( rg=rg_min; rg<=rg_max; rg+=step )); do
        local charmm_inp_file="${charmm_template}_rg${rg}.inp"
        local inp_basename="${charmm_template}_rg${rg}"
        template_md_input_files "$charmm_inp_file" "$inp_basename" "$rg"
        # g_md_inp_files+="${charmm_inp_file} "
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
    cp "${WORKDIR}/dcd2pdb.inp" "${WORKDIR}/${inp_file}"
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

generate_bilbomd_slurm() {
    cat << EOF > $WORKDIR/bilbomd.slurm
#!/bin/bash -l
#SBATCH --qos=${queue}
#SBATCH --nodes=${nodes}
#SBATCH --time=${time}
#SBATCH --licenses=cfs,scratch
#SBATCH --constraint=${constraint}
#SBATCH --account=${project}
#SBATCH --output=${WORKDIR}/slurm-%j.out
#SBATCH --error=${WORKDIR}/slurm-%j.err
#SBATCH --mail-type=${mailtype}
#SBATCH --mail-user=${mailuser}

srun --job-name bilbomd --mpi=pmix podman-hpc run --rm --userns=keep-id --openmpi-pmix -v ${WORKDIR}:/bilbomd/work -v ${UPLOAD_DIR}:/cfs ${WORKER} /bin/bash -c "cd /bilbomd/work/ && ./run-bilbomd.sh"
EOF
}

generate_header() {
    cat << EOF > header
#!/bin/bash -l

cd /bilbomd/work

EOF
}

generate_pdb2crd_commands() {
    cat << EOF > pdb2crd
# ########################################
# Convert PDB to CRD/PSF
EOF
    for inp in "${g_pdb2crd_inp_files[@]}"; do
        echo "echo \"Starting $inp\" &" >> pdb2crd
        local command="charmm -o ${inp%.inp}.out -i ${inp} &"
        echo $command >> pdb2crd

    done
    echo "" >> pdb2crd
    echo "# Wait for all PDB to CRD jobs to finish" >> pdb2crd
    echo "wait" >> pdb2crd
    echo "" >> pdb2crd
    echo "# Meld all individual CRD files" >> pdb2crd
    echo "echo \"Melding pdb2crd_charmm_meld.inp\"" >> pdb2crd
    local command="charmm -o pdb2crd_charmm_meld.out -i pdb2crd_charmm_meld.inp"
    echo $command >> pdb2crd
    echo "" >> pdb2crd
}

generate_pae2const_commands() {
    cat << EOF > pae2const
# ########################################
# Create const.inp from Alphafold PAE
EOF
    echo "echo \"Calculate const.inp from PAE matrix...\"" >> pae2const
    echo "python /app/scripts/pae_ratios.py ${pae_file} ${in_crd_file} > pae_ratios.log 2>&1" >> pae2const
    echo "" >> pae2const
    echo "# Check if const.inp was successfully created" >> pae2const
    echo "if [ -f \"const.inp\" ]; then" >> pae2const
    echo "    echo \"const.inp successfully created.\"" >> pae2const
    echo "else" >> pae2const
    echo "    echo \"Error: const.inp not found. Check pae_ratios.log for errors.\"" >> pae2const
    echo "    exit 1" >> pae2const
    echo "fi" >> pae2const
    echo "" >> pae2const

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
    cat << EOF > minheat
# ########################################
# CHARMM Minimize
echo "Running CHARMM Minimize..."
mpirun -np $((NUM_CORES/2)) charmm -o minimize.out -i minimize.inp
# charmm -o minimize.out -i minimize.inp

# ########################################
# FoXS Analysis of minimized PDB
echo "Running Initial FoXS Analysis..."
foxs ${foxs_args[@]} > initial_foxs_analysis.log 2> initial_foxs_analysis_error.log

# ########################################
# CHARMM Heat
echo "Running CHARMM Heat..."
mpirun -np $((NUM_CORES/2)) charmm -o heat.out -i heat.inp
# charmm -o heat.out -i heat.inp

EOF
}

generate_dynamics_commands() {
    cat << EOF > dynamics
# ########################################
# CHARMM Molecular Dynamics
EOF
    local num_inp_files=${#g_md_inp_files[@]}
    echo "echo \"Running CHARMM Molecular Dynamics...\"" >> dynamics
    for inp in "${g_md_inp_files[@]}"; do
        echo "echo \"Starting $inp\"" >> dynamics
        local command="mpirun -np $((NUM_CORES / num_inp_files - 1 )) charmm -o ${inp%.inp}.out -i ${inp} &"
        # local command="charmm -o ${inp%.inp}.out -i ${inp} &"
        echo $command >> dynamics
    done
    echo "" >> dynamics
    echo "# Wait for all dynamics jobs to finish" >> dynamics
    echo "wait" >> dynamics
    echo "" >> dynamics

}

generate_dcd2pdb_commands() {
    cat << EOF > dcd2pdb
# ########################################
# CHARMM Extract PDB from DCD Trajectories
EOF
    local num_inp_files=${#g_dcd2pdb_inp_files[@]}
    echo "echo \"Running CHARMM Extract PDB from DCD Trajectories...\"" >> dcd2pdb
    for inp in "${g_dcd2pdb_inp_files[@]}"; do
        echo "echo \"Starting $inp\"" >> dcd2pdb
        local command="mpirun -np $((NUM_CORES / num_inp_files - 1 )) charmm -o ${inp%.inp}.out -i ${inp} &"
        # local command="charmm -o ${inp%.inp}.out -i ${inp} &"
        echo $command >> dcd2pdb
    done
    echo "" >> dcd2pdb
    echo "# Wait for all dcd2pdb jobs to finish" >> dcd2pdb
    echo "wait" >> dcd2pdb
    echo "" >> dcd2pdb
}

generate_foxs_commands() {
    touch $WORKDIR/foxs_dat_files.txt
    cat << EOF > foxssection
# ########################################
# Run FoXS to calculate SAXS curves
EOF
    echo "echo \"Run FoXS to calculate SAXS curves...\"" >> foxssection
    for rg in $g_rgs; do
        echo "generate_foxs_commands rg: ${rg}"
        for ((run=1; run<=conf_sample; run++)); do
            dir_path="/bilbomd/work/foxs/rg${rg}_run${run}"
            echo "echo \"Processing directory: $dir_path\"" >> foxssection
            echo "./run_foxs_rg${rg}_run${run}.sh &" >> foxssection
        done
    done
    echo "" >> foxssection
    echo "# Wait for all FoXS jobs to finish" >> foxssection
    echo "wait" >> foxssection
    echo "" >> foxssection
    echo "echo \"All FoXS processing complete.\"" >> foxssection
    echo "" >> foxssection
}

generate_foxs_scripts() {
    # Iterate over each rg value
    for rg in $g_rgs; do
        # Iterate over each run within each rg value
        for ((run=1; run<=conf_sample; run+=1)); do
            # Define the directory path
            dir_path="$WORKDIR/foxs/rg${rg}_run${run}"
            # Check if the directory exists
            if [ -d "$dir_path" ]; then
                local foxs_script="$WORKDIR/run_foxs_rg${rg}_run${run}.sh"
                # echo "foxs_script: ${foxs_script}"
                > $foxs_script
                echo "#!/bin/bash" >> $foxs_script
                inner_dir_path="/bilbomd/work/foxs/rg${rg}_run${run}"
                # change in order to make extractPdbPaths happy
                rel_inner_dir_path="../foxs/rg${rg}_run${run}"
                # echo "inner_dir_path: ${inner_dir_path}"
                echo "echo \"Processing directory: $inner_dir_path\"" >> $foxs_script
                echo "cd $inner_dir_path" >> $foxs_script

                # Define log files
                echo "foxs_log=\"$inner_dir_path/foxs.log\"" >> $foxs_script
                echo "foxs_error_log=\"$inner_dir_path/foxs_error.log\"" >> $foxs_script

                # Ensure log files are empty initially or create them if they don't exist
                echo "> \"\$foxs_log\"" >> $foxs_script
                echo "> \"\$foxs_error_log\"" >> $foxs_script

                # Check directory exists
                echo "if [ -d \"$inner_dir_path\" ]; then" >> $foxs_script

                # Loop through each PDB file
                echo "  for pdbfile in *.pdb; do" >> $foxs_script
                echo "    if [ -s \"\$pdbfile\" ]; then" >> $foxs_script
                # echo "      echo \"Running FoXS on \$pdbfile\"" >> $foxs_script
                # Run foxs on the file
                echo "      foxs -p \"\$pdbfile\" >> \"\$foxs_log\" 2>> \"\$foxs_error_log\" && echo \"$rel_inner_dir_path/\${pdbfile}.dat\" >> $inner_dir_path/foxs_rg${rg}_run${run}_dat_files.txt" >> $foxs_script
                echo "    else" >> $foxs_script
                echo "      echo \"File is empty or missing: \$pdbfile\"" >> $foxs_script
                echo "    fi" >> $foxs_script
                echo "  done" >> $foxs_script
                echo "else" >> $foxs_script
                echo "  echo \"Directory not found: $inner_dir_path\"" >> $foxs_script
                echo "fi" >> $foxs_script
                echo "" >> $foxs_script
                chmod u+x $foxs_script
            else
                echo "Directory does not exist: $inner_dir_path"
            fi
        done
    done
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
    # /bilbomd/work/foxs/rg22_run1/foxs_rg22_run1_dat_files.txt
    echo "#!/bin/bash -l" >> $multifoxs_script
    # Iterate over each rg value
    for rg in $g_rgs; do
        # Iterate over each run within each rg value
        for ((run=1; run<=conf_sample; run+=1)); do
            dir_path="/bilbomd/work/foxs/rg${rg}_run${run}"
            echo "cat ${dir_path}/foxs_rg${rg}_run${run}_dat_files.txt >> /bilbomd/work/multifoxs/foxs_dat_files.txt" >> $multifoxs_script
        done
    done
    echo "cd /bilbomd/work/multifoxs && mpirun -np 8 multi_foxs -o ../$saxs_data foxs_dat_files.txt &> multi_foxs.log" >> $multifoxs_script
    # echo "cd /bilbomd/work/multifoxs && multi_foxs -o ../$saxs_data foxs_dat_files.txt &> multi_foxs.log" >> $multifoxs_script
}

generate_multifoxs_command() {
    cat << EOF > multifoxssection
# ########################################
# Run MultiFoXS to calculate best ensemble
EOF
    echo "echo \"Run MultiFoXS to calculate best ensemble...\"" >> multifoxssection
    echo "./run_multifoxs.sh &" >> multifoxssection
    echo "" >> multifoxssection
    echo "# Wait for MultiFoXS to finish" >> multifoxssection
    echo "wait" >> multifoxssection
    echo "" >> multifoxssection
    echo "echo \"MultiFoXS processing complete.\"" >> multifoxssection
    echo "" >> multifoxssection
}

generate_copy_commands() {
    cat << EOF > endsection
# ########################################
# Copy results back to CFS
EOF
    echo "echo \"Copying results back to CFS...\"" >> endsection
    # echo "echo \"Copying $WORKDIR/ back to CFS $UPLOAD_DIR ...\"" >> endsection
    # echo "cp -nR /bilbomd/work/* /cfs/" >> endsection
    echo "" >> endsection
    echo "echo \"DONE ${UUID}\"" >> endsection
}

assemble_run_bilbomd_script() {
    if [ "$JOB_TYPE" = "BilboMdPDB" ]; then
        cat header pdb2crd minheat dynamics dcd2pdb foxssection multifoxssection endsection> $WORKDIR/run-bilbomd.sh
    elif [ "$JOB_TYPE" = "BilboMdCRD" ]; then
        cat header minheat dynamics dcd2pdb foxssection multifoxssection endsection> $WORKDIR/run-bilbomd.sh
    elif [ "$JOB_TYPE" = "BilboMdAuto" ]; then
        cat header pdb2crd pae2const minheat dynamics dcd2pdb foxssection multifoxssection endsection> $WORKDIR/run-bilbomd.sh
    else
        echo "Error: Unrecognized JOB_TYPE '$JOB_TYPE'"
        return 1  # Exit with an error status
    fi
    chmod u+x $WORKDIR/run-bilbomd.sh
}

cleanup() {
    rm header pdb2crd pae2const minheat dynamics dcd2pdb foxssection multifoxssection endsection
    # Move bilbomd.slurm to the working directory
    # mv bilbomd.slurm $WORKDIR/
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

#
initialize_job
#
if [ "$JOB_TYPE" = "BilboMdPDB" ] || [ "$JOB_TYPE" = "BilboMdAuto" ]; then
    generate_pdb2crd_input_files
fi
generate_md_input_files
generate_dcd2pdb_input_files
#
generate_header
generate_pdb2crd_commands
if [ "$JOB_TYPE" = "BilboMdAuto" ]; then
    generate_pae2const_commands
fi
generate_min_heat_commands
generate_dynamics_commands
generate_dcd2pdb_commands
generate_foxs_commands
generate_foxs_scripts
generate_multifoxs_command
generate_multifoxs_script
generate_copy_commands
#
assemble_run_bilbomd_script
#
generate_bilbomd_slurm
#
cleanup

echo "----------------------------- END JOB PREP -----------------------------"
