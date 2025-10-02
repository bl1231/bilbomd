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
  