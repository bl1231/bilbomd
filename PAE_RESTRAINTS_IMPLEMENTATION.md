# PAE-Based Continuous Restraints Implementation

## Overview

This implementation replaces BilboMD's discrete rigid body constraint system with continuous PAE-based restraints that better utilize AlphaFold's confidence predictions.

## Files Modified

### 1. `tools/python/pae2const.py`
**Changes:**
- Added PAE restraints configuration parameters to `PAEConfig` dataclass:
  - `pae_restraints_file`: Output path for PAE restraints YAML
  - `pae_restraint_cutoff`: PAE threshold for distance restraints (default: 12.0 Å)
  - `distance_k`: Base force constant for distance restraints (default: 100.0 kJ/mol/nm²)
  - `position_k`: Base force constant for positional restraints (default: 50.0 kJ/mol/nm²)
  - `pae_sigma`: Exponential decay parameter (default: 5.0)

- Added new method `generate_pae_restraints()` to `PAEProcessor` class:
  - Identifies representative atoms (CA for protein, P for nucleic acids)
  - Generates distance restraints between residue pairs with PAE < cutoff
  - Generates positional restraints for each residue based on pLDDT
  - Returns data structure suitable for YAML export

- Updated `write_outputs()` to generate `pae_restraints.yaml` when requested

- Added command-line arguments:
  - `--pae-restraints-file`: Path to output PAE restraints YAML
  - `--pae-restraint-cutoff`: PAE threshold (Å)
  - `--distance-k`: Distance restraint force constant
  - `--position-k`: Positional restraint force constant
  - `--pae-sigma`: Exponential decay parameter

### 2. `apps/worker/scripts/openmm/utils/pae_restraints.py` (NEW)
**Purpose:** OpenMM utilities for applying PAE-based restraints

**Functions:**
- `load_pae_restraints(yaml_path)`: Load PAE restraint configuration from YAML
- `identify_representative_atoms(topology, modeller)`: Map (chain_id, res_id, atom_name) to atom indices
- `apply_pae_distance_restraints(system, modeller, restraints_config)`:
  - Uses `CustomBondForce` with energy: E = 0.5 * k_eff * (r - r0)²
  - Force constant: k_eff = k_base * exp(-(PAE/sigma)²)
- `apply_plddt_positional_restraints(system, modeller, positions, restraints_config)`:
  - Uses `CustomExternalForce` with energy: E = 0.5 * k_eff * ((x-x0)² + (y-y0)² + (z-z0)²)
  - Force constant: k_eff = k_base * (pLDDT/100)²

### 3. `apps/worker/scripts/openmm/md.py`
**Changes:**
- Added imports for PAE restraint functions
- Modified `run_md_for_rg()` to check constraint mode:
  - If `constraints.mode == "pae_restraints"`: Apply PAE-based restraints
  - Else: Use traditional rigid body constraints (backward compatible)
- Loads `pae_restraints.yaml` when in PAE restraints mode
- Applies distance and positional restraints before running MD

### 4. `apps/worker/src/types/index.d.ts`
**Changes:**
- Extended `PaeParams` type with PAE restraints options:
  - `emit_pae_restraints`: Flag to generate PAE restraints
  - `pae_restraint_cutoff`: PAE threshold
  - `distance_k`: Distance force constant
  - `position_k`: Position force constant
  - `pae_sigma`: Decay parameter

### 5. `apps/worker/src/services/functions/bilbomd-step-functions.ts`
**Changes:**
- Updated `spawnPaeToConst()` to handle PAE restraints flags
- Added command-line flags when `emit_pae_restraints` is true:
  - `--pae-restraints-file pae_restraints.yaml`
  - `--pae-restraint-cutoff`, `--distance-k`, `--position-k`, `--pae-sigma` (if specified)

### 6. `apps/worker/src/services/functions/openmm-functions.ts`
**Changes:**
- Modified `prepareOpenMMConfig()` to check for PAE restraints first
- If `pae_restraints.yaml` exists: Set `constraints.mode = "pae_restraints"`
- Otherwise: Fall back to traditional rigid bodies mode
- Ensures backward compatibility with existing jobs

## Usage

### Generating PAE Restraints

```bash
python tools/python/pae2const.py \
  path/to/pae.json \
  --pdb-file path/to/structure.pdb \
  --pae-restraints-file pae_restraints.yaml \
  --pae-restraint-cutoff 12.0 \
  --distance-k 100.0 \
  --position-k 50.0 \
  --pae-sigma 5.0
```

### Output Format (pae_restraints.yaml)

```yaml
pae_restraints:
  pae_cutoff: 12.0
  distance_k: 100.0
  position_k: 50.0
  sigma: 5.0

  distance_restraints:
    - residue_i: 5
      residue_j: 45
      chain_i: A
      chain_j: A
      atom_i: CA
      atom_j: CA
      pae: 3.2
      distance: 15.4
    # ... more restraints

  positional_restraints:
    - residue: 5
      chain: A
      atom: CA
      plddt: 92.5
      position: [12.3, 45.6, 78.9]
    # ... more restraints
```

### OpenMM Config (openmm_config.yaml)

For PAE restraints mode:
```yaml
constraints:
  mode: pae_restraints
  pae_restraints_file: pae_restraints.yaml
```

For traditional rigid bodies mode:
```yaml
constraints:
  mode: rigid_bodies
  fixed_bodies:
    - name: FixedBody1
      segments: [...]
  rigid_bodies:
    - name: RigidBody1
      segments: [...]
```

## Force Constant Scaling

### Distance Restraints
- Formula: `k_eff = k_base * exp(-(PAE/sigma)²)`
- Examples (with k_base=100, sigma=5.0):
  - PAE = 2 Å → k_eff ≈ 85 kJ/mol/nm² (very strong)
  - PAE = 5 Å → k_eff ≈ 37 kJ/mol/nm² (moderate)
  - PAE = 10 Å → k_eff ≈ 2 kJ/mol/nm² (very weak)

### Positional Restraints
- Formula: `k_eff = k_base * (pLDDT/100)²`
- Examples (with k_base=50):
  - pLDDT = 95 → k_eff ≈ 45 kJ/mol/nm² (high confidence)
  - pLDDT = 70 → k_eff ≈ 25 kJ/mol/nm² (moderate)
  - pLDDT = 50 → k_eff ≈ 13 kJ/mol/nm² (low confidence)

## Testing Plan

### 1. Test pae2const.py PAE Restraint Generation

```bash
# Navigate to test data directory
cd apps/worker/scripts/pymol/test_data

# Run pae2const.py with PAE restraints flags
python ../../../../tools/python/pae2const.py \
  path/to/test_pae.json \
  --pdb-file auto1.pdb \
  --pae-restraints-file pae_restraints.yaml \
  --pae-restraint-cutoff 12.0

# Verify output
cat pae_restraints.yaml
```

**Expected:**
- File `pae_restraints.yaml` created
- Contains `distance_restraints` and `positional_restraints` sections
- Distance restraints only include pairs with PAE < 12.0 Å
- Each restraint has proper chain_id, residue, atom_name, pae, distance/position

### 2. Test OpenMM PAE Restraints (Standalone)

Create a minimal test script:

```python
#!/usr/bin/env python
"""Test PAE restraints in isolation"""

from openmm.app import PDBFile, ForceField, Modeller
from openmm import System
from utils.pae_restraints import (
    load_pae_restraints,
    apply_pae_distance_restraints,
    apply_plddt_positional_restraints
)

# Load structure
pdb = PDBFile('auto1.pdb')
forcefield = ForceField('charmm36.xml', 'implicit/hct.xml')
modeller = Modeller(pdb.topology, pdb.positions)

# Create system
system = forcefield.createSystem(modeller.topology)
print(f"System has {system.getNumForces()} forces initially")

# Load and apply PAE restraints
config = load_pae_restraints('pae_restraints.yaml')
apply_pae_distance_restraints(system, modeller, config)
apply_plddt_positional_restraints(system, modeller, modeller.positions, config)

print(f"System has {system.getNumForces()} forces after adding restraints")
print("Test passed!")
```

### 3. Test Full MD Pipeline

```bash
# Ensure pae_restraints.yaml exists in work directory
# Run heating step
python apps/worker/scripts/openmm/heat.py openmm_config.yaml

# Run MD step
python apps/worker/scripts/openmm/md.py openmm_config.yaml

# Check output
ls md/rg_*/
cat md/rg_*/rgyr.csv
```

**Expected:**
- MD runs without crashes
- No NaN energies in output
- Trajectory files generated
- Rg values converge to targets

### 4. Compare Old vs New Approach

Run same system with both approaches:

```bash
# Test 1: Rigid bodies (old)
# Use openmm_const.yml
python apps/worker/scripts/openmm/md.py openmm_config.yaml

# Test 2: PAE restraints (new)
# Use pae_restraints.yaml
python apps/worker/scripts/openmm/md.py openmm_config.yaml
```

Compare:
- Simulation speed (ns/day)
- Trajectory stability (RMSD)
- Rg distributions
- Energy profiles

## Performance Expectations

For a 300-residue protein:
- **Distance restraints**: ~15,000-25,000 pairs (PAE < 12 Å)
- **Positional restraints**: ~300 (one per residue)
- **GPU impact**: Minimal - GPUs excel at parallel force calculations
- **Speed**: Should be comparable to rigid body approach

## Backward Compatibility

- Existing jobs using rigid bodies continue to work
- Config mode defaults to "rigid_bodies" if not specified
- PAE restraints only applied when `pae_restraints.yaml` exists

## Migration Path

1. **Phase 1** (current): Both modes available, rigid bodies default
2. **Phase 2** (future): Make PAE restraints default for AlphaFold jobs
3. **Phase 3** (future): Deprecate rigid body mode after validation

## Known Limitations

- PAE restraints currently only support PDB input (not CRD)
- Requires AlphaFold PAE matrix and pLDDT scores
- Not applicable to traditional PDB structures without confidence scores

## Future Enhancements

1. **Adaptive force constants**: Tune k_dist and k_pos based on system size
2. **Sequence separation filter**: Exclude very local restraints (|i-j| < 4)
3. **Temperature coupling**: Reduce restraint strength at higher MD temperatures
4. **Visualization**: Update PAE viz tools to show restraint network
5. **CRD support**: Extend to support CRD input files
