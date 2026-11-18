# SASDML3: mycobacteriophage immunity repressor + 24-mer dsDNA

Test inputs for classic PDB and CRD/PSF jobs, built from SASBDB entry
[SASDML3](https://www.sasbdb.org/data/SASDML3/), collected at ALS 12.3.1
(SIBYLS).

> McGinnis RJ, Brambley CA, Stamey B, _et al._ A monomeric mycobacteriophage
> immunity repressor utilizes two domains to recognize an asymmetric DNA
> sequence. _Nat Commun_ (2022). doi:10.1038/s41467-022-31678-6

| File                   | What it is                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `sasdml3.pdb`          | SASBDB `SASDML3_fit1_model1.pdb` (FoXS, χ² 1.62), cleaned up (below)                           |
| `sasdml3.dat`          | SASBDB `SASDML3.dat` with the REMARK header removed; q in Å⁻¹, otherwise as deposited           |
| `sasdml3.crd`, `.psf`  | Made from `sasdml3.pdb` by BilboMD's own `pdb2crd.py` + CHARMM (segids `PROA`, `DNAB`, `DNAC`) |
| `constraints.json`     | Constraints for PDB jobs (by chain ID)                                                         |
| `constraints-crd.json` | The same constraints for CRD/PSF jobs (by segid)                                               |

Cleanup of the deposited model:

- The protein had a blank chain ID; it is now chain `A`. DNA strands stay `B` and `C`.
- HSD residues written as `HETATM` are now `ATOM`, serials are renumbered, the
  segid column is cleared and each chain ends with a `TER`.

Constraints: the N-terminal DNA-binding domain (A 40–137) and both DNA strands
are fixed, the C-terminal domain (A 150–203) is a rigid body, and the
His-tag (A 1–39) and the linker (A 138–149) are free.

This replaces the old `pro_dna` inputs, a CHARMM-GUI model of the same
repressor with a 21-mer (SASDLS7). That model had a 0.13 Å MET135/VAL163
overlap, which OpenMM's clash check rejects, and both DNA strands shared one
chain ID, so `pdb2crd.py` joined them into a single segment.
