"""
Wrapper for IonNet Scoper Pipeline
"""
import os
import subprocess
import sys

# Assuming arguments to -fp and -sp are passed to this wrapper script
fp_arg = sys.argv[1]  # First argument after the script name
sp_arg = sys.argv[2]  # Second argument
dir_arg = sys.argv[3]

command = [
    "python", "/home/bun/IonNet/mgclassifierv2.py",
    "-bd", dir_arg,
    "scoper",
    "-fp", os.path.join(dir_arg, fp_arg),
    "-ahs", "/home/bun/IonNet/scripts/scoper_scripts/addHydrogensColab.pl",
    "-sp", os.path.join(dir_arg, sp_arg),
    "-it", "sax",
    "-mp", "/home/bun/IonNet/models/trained_models/wandering-tree-178.pt",
    "-cp", "/home/bun/IonNet/models/trained_models/wandering-tree-178_config.npy",
    "-fs", "foxs",
    "-mfcs", "multi_foxs_combination",
    "-kk", "100",
    "-tk", "1",
    "-mfs", "multi_foxs",
    "-mfr", "True"
]
print(command)
with open('scoper.log', 'w', encoding='utf-8') as log_file, open('scoper_error.log', 'w', encoding='utf-8') as error_file:
    # Run the command and capture stdout and stderr
    subprocess.run(command, stdout=log_file, stderr=error_file, check=True)
