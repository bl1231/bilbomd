#!/bin/bash
echo "Run FoXS..."
find . -type d -name 'rg*_run*' | while read rundir; do
  echo "Processing directory: $rundir"
  if [ -d "$rundir" ]; then
    cd "$rundir"
    parallel "foxs -p {} >> foxs.log 2>> foxs_error.log && echo $(pwd)/{}.dat | sed 's|/bilbomd/work|..|' >> foxs_dat_files.txt" ::: *.pdb
    cd /bilbomd/work/foxs
  else
    echo "Directory not found: $rundir"
  fi
done
