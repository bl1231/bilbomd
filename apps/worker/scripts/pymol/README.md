# PyMOL notes

Build docker image

```
docker run --rm -it -v $(pwd)/scripts/pymol/test_data:/test_data  dcd2mov:latest bash
```

Run interactive docker container for testing

```bash
pymol -cqr /usr/local/bin/make_dcd_movie.py -- --pdb /test_data/md42.pdb --dcd /test_data/md42.dcd --out /test_data/out2.mp4
```
