# BilboMD

[![CI Status](https://github.com/bl1231/bilbomd/actions/workflows/ci.yml/badge.svg)](https://github.com/bl1231/bilbomd/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Berkeley%20Lab%20Non--Commercial-blue.svg)](https://github.com/bl1231/bilbomd/blob/main/LICENSE.txt)
[![Node](https://img.shields.io/badge/node-v24.13.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.29.2-orange?logo=pnpm)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-blueviolet?logo=turborepo)](https://turbo.build/)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker)](https://github.com/bl1231?tab=packages&repo_name=bilbomd)
[![Last Commit](https://img.shields.io/github/last-commit/bl1231/bilbomd)](https://github.com/bl1231/bilbomd/commits/main/)

An advances Small Angle X-Ray Scattering (SAXS) modelling pipeline.

## Description

BilboMD is a webapp developed at the [SIBYLS beamline](https://sibyls.als.lbl.gov). It uses Molecular Dynamics from [CHARMM](https://academiccharmm.org/) or [OpenMM](https://openmm.org/) to generate an array of possible molecular models. The ensemble of models is used to calculate theoretical SAXS curves using [FoXS](https://modbase.compbio.ucsf.edu/foxs/about), and compared with experimental SAXS data using [MultiFoXS](https://modbase.compbio.ucsf.edu/multifoxs/about) to find an ensemble of models that best explains your SAXS data.

## Pipelines

There are several different SAXS modeling pipelines available.

### BilboMD Classic w/PDB inputs

This pipeline offers the classic BilboMD from years past where you can upload a custom `const.inp` file and adjust the `rg_min` and `rg_max` values. It takes a user provided PDB file and experimental SAXS data.

![Classic PDB](apps/ui/public/images/bilbomd-classic-pdb-schematic-dark.png)

### BilboMD Classic w/CRD inputs

This pipeline offers the classic BilboMD from years past where you can upload a custom `const.inp` file and adjust the `rg_min` and `rg_max` values. It takes a user provided CRD and PSF file and experimental SAXS data. The CRD and PSF files can be generated using [CHARMM GUI](https://www.charmm-gui.org/).

![Classic CRD](apps/ui/public/images/bilbomd-classic-crd-schematic-dark.png)

### BilboMD Auto

This pipeline is designed to take Alphafold models and a Per residue Alignment Error (PAE) matrix in combination with your experimental SAXS data.

![Auto](apps/ui/public/images/bilbomd-classic-crd-schematic-dark.png)

### BilboMD AF

This pipeline is designed to run Alphafold2 on your provided protein sequence and then run the Auto pipeline above.

![Auto](apps/ui/public/images/bilbomd-classic-crd-schematic-dark.png)

## Test Coverage

Current test coverage across BilboMD apps:

<!-- COVERAGE-TABLE:START -->
| App | Statements | Branches | Functions | Lines |
|-----|-----------|----------|-----------|-------|
| Backend | 80.00% | 64.15% | 71.73% | 80.50% |
| UI | 65.58% | 55.56% | 62.64% | 67.16% |
| Worker | 82.40% | 71.34% | 83.09% | 82.48% |
| Scoper | N/A | N/A | N/A | N/A |
<!-- COVERAGE-TABLE:END -->

*Coverage is automatically updated on each push to main.*

## Deployment

There are 2 instances of BilboMD available. Each deployment has a different selection of pipelines available. This is primarily because of access to high performance NVIDIA GPUs at NERSC which are unavailable at the SIBYLS beamline on Hyperion.

1. Hyperion [https://bilbomd.bl1231.als.lbl.gov](https://bilbomd.bl1231.als.lbl.gov)

    - Classic w/PDB
    - Classic w/CRD
    - Auto
    - Multi
    - SANS
    - Scoper

2. NERSC [https://bilbomd-nersc.bl1231.als.lbl.gov](https://bilbomd-nersc.bl1231.als.lbl.gov)

    - Classic w/PDB
    - Classic w/CRD
    - Auto
    - AF
