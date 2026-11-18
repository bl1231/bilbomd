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

The deposited fit is a two-state MultiFoXS fit: 48 % complex and 52 % free DNA.
BilboMD samples only the complex, so expect a poorer χ² than with SASDML3.
