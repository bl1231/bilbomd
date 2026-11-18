# SASDQ79: DpdA (D95A) + 28-bp dsDNA

A larger protein–DNA test input (~68 kDa) for classic PDB jobs, built from
SASBDB entry [SASDQ79](https://www.sasbdb.org/data/SASDQ79/), collected at
ALS 12.3.1 (SIBYLS).

> Gedara SH, Wood E, Gustafson A, _et al._ 7-Deazaguanines in DNA: functional
> and structural elucidation of a DNA modification system. _Nucleic Acids Res_
> (2023). doi:10.1093/nar/gkad141

| File               | What it is                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| `sasdq79.pdb`      | SASBDB `SASDQ79_fit1_model1.pdb`, cleaned up (below)                                |
| `sasdq79.dat`      | SASBDB `SASDQ79.dat` with the REMARK header removed; q in Å⁻¹, otherwise as deposited |
| `constraints.json` | Constraints for PDB jobs (by chain ID)                                              |

Cleanup of the deposited model: the Zn ion (deposited first, as an `ATOM` with
a blank chain ID) is now `HETATM ZN C 436` after the protein; CONECT records are
dropped, serials are renumbered and each chain ends with a `TER`. Chains: `C`
DpdA, `A` and `B` DNA.

Constraints: DpdA residues C 21–435 and both DNA strands are fixed; the
N-terminal His-tag and thrombin site (C 1–20) are free.

## Expect a poorer fit than SASDML3

The depositors' fit is a two-state MultiFoXS fit: the DpdA–DNA complex plus
free 28-bp DNA, with weights 0.48 and 0.52 (χ² 1.88). In other words, they
read the sample as a mixture, with part of the DNA unbound. MultiFoXS weights
apply to the computed profiles, so they are not necessarily molar fractions.

BilboMD can't model that. Every conformer it generates is the uploaded
complex, so the ensemble MultiFoXS picks from never contains a free-DNA state.
BilboMD has no support for a mixture of different species. Users might
want that feature, but it is out of scope here.

### Two-state check (epyc dev, 2026-11-18)

Fits run with the worker image's `foxs` and `multi_foxs -o`, the way the
pipeline runs them. "Free DNA" is chains A and B taken from `sasdq79.pdb`.
"BilboMD conformers" are the 3600 models from an OpenMM run with this
directory's inputs (dev job `d5d7970d`, Rg 31–51 Å).

| Models available to MultiFoXS     | χ²   | Weights (complex / DNA) |
| --------------------------------- | ---- | ----------------------- |
| `sasdq79.pdb` (complex) only      | 3.08 | n/a                     |
| `sasdq79.pdb` + free DNA          | 2.20 | 0.47 / 0.53             |
| BilboMD conformers only           | 2.88 | n/a                     |
| BilboMD conformers + free DNA     | 2.24 | 0.47 / 0.53             |
| Depositors' fit (SASBDB)          | 1.88 | 0.48 / 0.52             |

- Adding free DNA improves χ² by 0.6–0.9 either way. The weights land on the
  depositors' values without being steered there, which supports the
  mixture reading.
- The misfit is about what is in the sample, not about flexibility. Without
  free DNA, MultiFoXS finds no better two-conformer ensemble. With free DNA,
  BilboMD's best pair (one `rg51` conformer plus DNA) is no better than the
  deposited structure.
- The hydration-layer parameter c2 sits at its limits: −0.50 for the complex
  alone and 2.00 with free DNA. Something about the sample is probably still
  not captured.
- The gap to the depositors' 1.88 may come from fit settings (q range, FoXS
  version) that SASBDB doesn't record.

In BilboMD runs the misfit is mostly at low q (χ² 6–8 in 0.01–0.10 Å⁻¹), and
the SAXS MW estimate (58.7 kDa) is about 14 % below the model's 68 kDa. Both
fit with a share of the sample being smaller free DNA.

Use this dataset to check that the pipeline runs on a larger complex with a
Zn ion through both engines, not as a fit-quality benchmark. SASDML3 is the
fit-quality benchmark.
