#!/bin/bash
set -e

echo "Testing CLI tools..."
if charmm 2>&1 | grep -q "Chemistry at HARvard Macromolecular Mechanics"; then
    echo "CHARMM OK"
else
    echo "CHARMM not found or not working"
fi

if Pepsi-SANS 2>&1 | grep -q "Pepsi-SANS : an adaptive method for rapid and accurate"; then
    echo "Pepsi-SANS OK"
else
    echo "Pepsi-SANS not found or not working"
fi


if dammin 2>&1 | grep -q "Ab inito shape determination by simulated"; then
    echo "DAMMIN OK"
else
    echo "DAMMIN not found or not working"
fi


foxs --version || echo "FOXS not found"
multi_foxs --version || echo "Multi-FOXS not found"
echo "Testing Python packages..."
/opt/envs/base/bin/python -c "import numpy; print('numpy OK')" || echo "numpy missing"
/opt/envs/base/bin/python -c "import scipy; print('scipy OK')" || echo "scipy missing"
/opt/envs/base/bin/python -c "import bioxtasraw; print('bioxtasraw OK')" || echo "bioxtasraw missing"
/opt/envs/base/bin/python -c "import lmfit; print('lmfit OK')" || echo "lmfit missing"
/opt/envs/base/bin/python -c "import pandas; print('pandas OK')" || echo "pandas missing"
/opt/envs/base/bin/python -c "import dask; print('dask OK')" || echo "dask missing"
/opt/envs/openmm/bin/python -c "import openmm; print('openmm OK')" || echo "openmm missing"

echo "Smoke test complete."