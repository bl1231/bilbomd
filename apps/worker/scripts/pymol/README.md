# PyMOL notes

Build docker image

```
docker run --rm -it -v $(pwd)/scripts/pymol/test_data:/test_data  dcd2mov:latest bash
```

Run interactive docker container for testing

```bash
pymol -cqr /usr/local/bin/make_dcd_movie.py -- --pdb /test_data/md42.pdb --dcd /test_data/md42.dcd --out /test_data/out2.mp4
```


```bash
pymol -cqr /usr/local/bin/make_dcd_movie.py -- --pdb /test_data/md42.pdb --dcd /test_data/md42.dcd --out /test_data/out3.mp4 --align-ca --orient principal --fov 18 --zoom-buffer 3 --clip --viewport
```

```bash
docker run --rm -v $(pwd)/scripts/pymol/test_data:/test_data  dcd2mov:latest python -c "pymol -cqr /usr/local/bin/make_dcd_movie.py -- --pdb /test_data/md42.pdb --dcd /test_data/md42.dcd --out /test_data/out5.mp4 --align-ca --orient principal --fov 18 --zoom-buffer 3 --clip --viewport"
```

```bash
pymol -cqr /usr/local/bin/make_dcd_movie.py -- --pdb /test_data/auto1_md36.pdb --dcd /test_data/auto1_md36.dcd --out /test_data/auto1-7.mp4 --align-ca --orient principal --clip --viewport --color-scheme constraints --config /test_data/openmm_config.yaml --stride 4 --ray
```