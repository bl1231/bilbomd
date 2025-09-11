import subprocess

# Paths
input_file = '../openmm/md/foxs_dat_files.txt'
output_file = 'foxs_dat_files_for_multifoxs.txt'
prefix = '../openmm/md/'

# Read and process lines
with open(input_file, 'r') as f:
    lines = [prefix + line.strip() for line in f if line.strip()]

# Write to output file
with open(output_file, 'w') as f:
    f.write('\n'.join(lines) + '\n')

# Run multi_foxs command
cmd = ['multi_foxs', '-o', '../saxs-data.dat', './foxs_dat_files_for_multifoxs.txt']
with open('multi_foxs.log', 'w') as log:
    subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
