# PAE testing

```bash
# from repo root (so relative imports in pae_ratios.py resolve):
python tools/python/pae_testing/run_pae_batch.py tools/python/pae_testing/pae_batch.yml --outdir tools/python/pae_testing/out/pae_batch --emit-constraints
```

	•	Outputs for each case end up in out/pae_batch/<case-name>/.
	•	Each directory contains:
	•	const.inp (unless --no-const)
	•	constraints.yaml (if --emit-constraints)
	•	viz.json, viz.png, pae.png, pae.bin
	•	run.log with the full stdout/stderr from pae_ratios.py
	•	The runner prints a compact summary table at the end.


Set up a testing environment

```bash
conda create --name py312-pae python=3.12
conda install --yes --name py312-pae -c conda-forge numpy scipy matplotlib python-igraph biopython pyyaml
conda activate py312-pae
```


```bash
# First, build your baseline once:
python run_pae_batch.py tests/pae_batch.yaml \
  --outdir tools/python/pae_testing/out/gold \
  --emit-constraints

# Later runs compared to baseline:
python run_pae_batch.py tests/pae_batch.yaml \
  --outdir tools/python/pae_testing/out/new \
  --emit-constraints \
  --gold tools/python/pae_testing/out/gold
  ```
  
## 10/02/2025

```bash
❯ python run_pae_batch.py tools/python/pae_testing/pae_batch.yml --outdir tools/python/pae_testing/out/gold --emit-constraints
[auto1-p2] rc=0  1.1s  -> tools/python/pae_testing/out/gold/auto1-p2
[auto1-p3] rc=0  1.1s  -> tools/python/pae_testing/out/gold/auto1-p3
[auto1-p4] rc=0  1.1s  -> tools/python/pae_testing/out/gold/auto1-p4
[auto2-p2] rc=0  1.5s  -> tools/python/pae_testing/out/gold/auto2-p2
[auto2-p3] rc=0  1.6s  -> tools/python/pae_testing/out/gold/auto2-p3
[auto2-p4] rc=0  1.7s  -> tools/python/pae_testing/out/gold/auto2-p4
[c3befbc-p2] rc=0  3.2s  -> tools/python/pae_testing/out/gold/c3befbc-p2
[c3befbc-p3] rc=0  3.2s  -> tools/python/pae_testing/out/gold/c3befbc-p3
[c3befbc-p3.5] rc=0  3.1s  -> tools/python/pae_testing/out/gold/c3befbc-p3.5
[sasddnf2-p2] rc=0  1.3s  -> tools/python/pae_testing/out/gold/sasddnf2-p2
[sasddnf2-p3] rc=0  1.3s  -> tools/python/pae_testing/out/gold/sasddnf2-p3
[sasddnf2-p4] rc=0  1.3s  -> tools/python/pae_testing/out/gold/sasddnf2-p4

CASE                             RC     sec  const  yaml  viz.json  pae.bin  pae.png  viz.png  gold  outdir
-----------------------------------------------------------------------------------------------------------
auto1-p2                          0     1.1      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto1-p2
auto1-p3                          0     1.1      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto1-p3
auto1-p4                          0     1.1      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto1-p4
auto2-p2                          0     1.5      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto2-p2
auto2-p3                          0     1.6      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto2-p3
auto2-p4                          0     1.7      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/auto2-p4
c3befbc-p2                        0     3.2      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/c3befbc-p2
c3befbc-p3                        0     3.2      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/c3befbc-p3
c3befbc-p3.5                      0     3.1      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/c3befbc-p3.5
sasddnf2-p2                       0     1.3      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/sasddnf2-p2
sasddnf2-p3                       0     1.3      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/sasddnf2-p3
sasddnf2-p4                       0     1.3      Y     Y         Y        Y        Y        Y     -  tools/python/pae_testing/out/gold/sasddnf2-p4
❯ python run_pae_batch.py tools/python/pae_testing/pae_batch.yml --outdir tools/python/pae_testing/out/test1 --emit-constraints --gold tools/python/pae_testing/out/gold
[auto1-p2] rc=0  1.1s  -> tools/python/pae_testing/out/test1/auto1-p2
[auto1-p3] rc=0  1.1s  -> tools/python/pae_testing/out/test1/auto1-p3
[auto1-p4] rc=0  1.1s  -> tools/python/pae_testing/out/test1/auto1-p4
[auto2-p2] rc=0  1.5s  -> tools/python/pae_testing/out/test1/auto2-p2
[auto2-p3] rc=0  1.6s  -> tools/python/pae_testing/out/test1/auto2-p3
[auto2-p4] rc=0  1.7s  -> tools/python/pae_testing/out/test1/auto2-p4
[c3befbc-p2] rc=0  3.1s  -> tools/python/pae_testing/out/test1/c3befbc-p2
[c3befbc-p3] rc=0  3.2s  -> tools/python/pae_testing/out/test1/c3befbc-p3
[c3befbc-p3.5] rc=0  3.2s  -> tools/python/pae_testing/out/test1/c3befbc-p3.5
[sasddnf2-p2] rc=0  1.4s  -> tools/python/pae_testing/out/test1/sasddnf2-p2
[sasddnf2-p3] rc=0  1.3s  -> tools/python/pae_testing/out/test1/sasddnf2-p3
[sasddnf2-p4] rc=0  1.3s  -> tools/python/pae_testing/out/test1/sasddnf2-p4

CASE                             RC     sec  const  yaml  viz.json  pae.bin  pae.png  viz.png  gold  outdir
-----------------------------------------------------------------------------------------------------------
auto1-p2                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto1-p2
auto1-p3                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto1-p3
auto1-p4                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto1-p4
auto2-p2                          0     1.5      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto2-p2
auto2-p3                          0     1.6      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto2-p3
auto2-p4                          0     1.7      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/auto2-p4
c3befbc-p2                        0     3.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/c3befbc-p2
c3befbc-p3                        0     3.2      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/c3befbc-p3
c3befbc-p3.5                      0     3.2      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/c3befbc-p3.5
sasddnf2-p2                       0     1.4      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/sasddnf2-p2
sasddnf2-p3                       0     1.3      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/sasddnf2-p3
sasddnf2-p4                       0     1.3      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test1/sasddnf2-p4
❯ python run_pae_batch.py tools/python/pae_testing/pae_batch.yml --outdir tools/python/pae_testing/out/test2 --emit-constraints --gold tools/python/pae_testing/out/gold
[auto1-p2] rc=0  1.1s  -> tools/python/pae_testing/out/test2/auto1-p2
[auto1-p3] rc=0  1.1s  -> tools/python/pae_testing/out/test2/auto1-p3
[auto1-p4] rc=0  1.1s  -> tools/python/pae_testing/out/test2/auto1-p4
[auto2-p2] rc=0  1.5s  -> tools/python/pae_testing/out/test2/auto2-p2
[auto2-p3] rc=0  1.6s  -> tools/python/pae_testing/out/test2/auto2-p3
[auto2-p4] rc=0  1.7s  -> tools/python/pae_testing/out/test2/auto2-p4
[c3befbc-p2] rc=0  3.2s  -> tools/python/pae_testing/out/test2/c3befbc-p2
[c3befbc-p3] rc=0  3.2s  -> tools/python/pae_testing/out/test2/c3befbc-p3
[c3befbc-p3.5] rc=0  3.2s  -> tools/python/pae_testing/out/test2/c3befbc-p3.5
[sasddnf2-p2] rc=0  1.3s  -> tools/python/pae_testing/out/test2/sasddnf2-p2
[sasddnf2-p3] rc=0  1.3s  -> tools/python/pae_testing/out/test2/sasddnf2-p3
[sasddnf2-p4] rc=0  1.3s  -> tools/python/pae_testing/out/test2/sasddnf2-p4

CASE                             RC     sec  const  yaml  viz.json  pae.bin  pae.png  viz.png  gold  outdir
-----------------------------------------------------------------------------------------------------------
auto1-p2                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto1-p2
auto1-p3                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto1-p3
auto1-p4                          0     1.1      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto1-p4
auto2-p2                          0     1.5      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto2-p2
auto2-p3                          0     1.6      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto2-p3
auto2-p4                          0     1.7      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/auto2-p4
c3befbc-p2                        0     3.2      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/c3befbc-p2
c3befbc-p3                        0     3.2      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/c3befbc-p3
c3befbc-p3.5                      0     3.2      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/c3befbc-p3.5
sasddnf2-p2                       0     1.3      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/sasddnf2-p2
sasddnf2-p3                       0     1.3      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/sasddnf2-p3
sasddnf2-p4                       0     1.3      Y     Y         Y        Y        Y        Y    OK  tools/python/pae_testing/out/test2/sasddnf2-p4
```