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

if foxs_version=$(foxs --version 2>&1); then
    echo "FOXS OK - $foxs_version"
else
    echo "FOXS not found"
fi

if multifoxs_version=$(multi_foxs --version 2>&1); then
    # Clean up the output - multi_foxs outputs the command followed by version
    clean_version=$(echo "$multifoxs_version" | grep "Version:" | head -1)
    echo "Multi-FOXS OK - $clean_version"
else
    echo "Multi-FOXS not found"
fi

echo "Testing Python packages..."
/opt/envs/base/bin/python -c "import numpy; print(f'numpy OK - {numpy.__version__}')" || echo "numpy missing"
/opt/envs/base/bin/python -c "import scipy; print(f'scipy OK - {scipy.__version__}')" || echo "scipy missing"
/opt/envs/base/bin/python -c "import lmfit; print(f'lmfit OK - {lmfit.__version__}')" || echo "lmfit missing"
/opt/envs/base/bin/python -c "import pandas; print(f'pandas OK - {pandas.__version__}')" || echo "pandas missing"
/opt/envs/base/bin/python -c "import dask; print(f'dask OK - {dask.__version__}')" || echo "dask missing"
/opt/envs/openmm/bin/python -c "import openmm; print(f'openmm OK - {openmm.__version__}')" || echo "openmm missing"

echo "Smoke test complete."