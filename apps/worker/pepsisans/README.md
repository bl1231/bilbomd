# Pepsi-SANS

Before building docker image, you need to manually copy a Pepsi-SANS binary zip file here.

- Head over to [Pepsi-SANS website](https://files.inria.fr/NanoDFiles/Website/Software/Pepsi-SANS/Linux/3.0/Pepsi-SANS-Linux.zip)
- Download `Pepsi-SANS-Linux.zip`
- Move to the `pepsisans` directory

```
*******************************************************************
*-----------------------------------------------------------------*
*-------------------Pepsi-SANS, a small angle --------------------*
*------ adaptive neutron scattering reconstruction algorithm------*
*--- that uses polynomial expansions of scattering amplitudes.----*
*-------------------- Author: Sergei Grudinin.--------------------*
*------------------------ Reference: XXX,-------------------------*
*----- Pepsi-SANS : an adaptive method for rapid and accurate-----*
*-----computation of small angle neutron scattering profiles.-----*
*---- Copyright (c): Nano-D team, Inria/CNRS Grenoble, France-----*
*----------------------------- 2018.------------------------------*
* Available at : http://team.inria.fr/nano-d/software/pepsi-sans -*
*-------------------- For academic use only! ---------------------*
*--------------- e-mail: sergei.grudinin@inria.fr ----------------*
*-----------------------------------------------------------------*
*******************************************************************
PARSE ERROR:  
             Required argument missing: input

Brief USAGE: 
   ./Pepsi-SANS  <input PDB(s)> <experimental curve> [-o <output file>] [-n
                 <expansion order>] [-ms <max angle>] [-au <angular units
                 option>] [-ns <number of points>] [-cst] [--cstFactor
                 <factor to subtract from experimental data>]
                 [--scaleFactor <scaling>] [--I0 <I(0)>] [-j] [-x] [-neg]
                 [-hyd] [-fast] [--noSmearing] [--dro <contrast>] [--conc
                 <concentration>] [--absFit <persent>] [--bulkSLD < bulk
                 SLD value>] [--dist] [--deut <Molecule deuteration>]
                 [--d2o <Buffer deuteration>] [--exchange <Exchange rate>]
                 [--hModel <model for H atoms>] [--deuterated <Deuterateed
                 chains' IDs>] [--opt] [--modes <number of modes>]
                 [--covScaling <regularization of fuzzy interactions>]
                 [--fuzzy] [-c <cutoff distance>] [-a <maximum amplitude>]
                 [--useMasses] [--cTol <tolerance>] [-iter <num. of iters>]
                 [--nSteps <number of minimization steps>] [-t
                 <minimization tolerance>] [--blocks <Rigid blocks
                 filename>] [--excl <Excluded interactions filename>]
                 [--fixed <Fixed residues filename>] [--oldFormat]
                 [--esmodel <excluded solvent model>] [-h] [--version]
                 [-log]

For complete USAGE and HELP type: 
   ./Pepsi-SANS --help
```