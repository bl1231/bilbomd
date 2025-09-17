# Slurm Notes

Without `--ntasks=1` You can see that each md, dcd2pdb, and foxs## run is being fired sequentially.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25656472     bilbomd.s+  COMPLETED   00:26:59      0:0 2024-05-16T10:24:18 2024-05-16T10:51:17
25656472.ba+      batch  COMPLETED   00:26:59      0:0 2024-05-16T10:24:18 2024-05-16T10:51:17
25656472.ex+     extern  COMPLETED   00:27:29      0:0 2024-05-16T10:24:18 2024-05-16T10:51:47
25656472.0      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-16T10:24:23 2024-05-16T10:24:29
25656472.1      pdb2crd  COMPLETED   00:00:14      0:0 2024-05-16T10:24:29 2024-05-16T10:24:43
25656472.2      pdb2crd  COMPLETED   00:00:09      0:0 2024-05-16T10:24:59 2024-05-16T10:25:08
25656472.3     minimize  COMPLETED   00:01:43      0:0 2024-05-16T10:25:12 2024-05-16T10:26:55
25656472.4     initfoxs  COMPLETED   00:00:04      0:0 2024-05-16T10:26:56 2024-05-16T10:27:00
25656472.5         heat  COMPLETED   00:01:44      0:0 2024-05-16T10:27:00 2024-05-16T10:28:44
25656472.6           md  COMPLETED   00:03:34      0:0 2024-05-16T10:28:44 2024-05-16T10:32:18
25656472.7           md  COMPLETED   00:02:31      0:0 2024-05-16T10:32:20 2024-05-16T10:34:51
25656472.8           md  COMPLETED   00:02:26      0:0 2024-05-16T10:35:16 2024-05-16T10:37:42
25656472.9           md  COMPLETED   00:02:24      0:0 2024-05-16T10:37:42 2024-05-16T10:40:06
25656472.10          md  COMPLETED   00:02:40      0:0 2024-05-16T10:40:08 2024-05-16T10:42:48
25656472.11     dcd2pdb  COMPLETED   00:00:11      0:0 2024-05-16T10:42:54 2024-05-16T10:43:05
25656472.12     dcd2pdb  COMPLETED   00:00:35      0:0 2024-05-16T10:43:07 2024-05-16T10:43:42
25656472.13     dcd2pdb  COMPLETED   00:00:59      0:0 2024-05-16T10:43:42 2024-05-16T10:44:41
25656472.14     dcd2pdb  COMPLETED   00:01:00      0:0 2024-05-16T10:44:41 2024-05-16T10:45:41
25656472.15     dcd2pdb  COMPLETED   00:00:54      0:0 2024-05-16T10:45:41 2024-05-16T10:46:35
25656472.16      foxs26  COMPLETED   00:00:53      0:0 2024-05-16T10:46:38 2024-05-16T10:47:31
25656472.17      foxs30  COMPLETED   00:00:15      0:0 2024-05-16T10:47:31 2024-05-16T10:47:46
25656472.18      foxs34  COMPLETED   00:00:50      0:0 2024-05-16T10:47:49 2024-05-16T10:48:39
25656472.19      foxs38  COMPLETED   00:01:21      0:0 2024-05-16T10:48:39 2024-05-16T10:50:00
25656472.20      foxs22  COMPLETED   00:01:04      0:0 2024-05-16T10:50:04 2024-05-16T10:51:08
25656472.21   multifoxs     FAILED   00:01:55     85:0 2024-05-16T10:51:08 2024-05-16T10:53:03
```

With `--ntasks=1 --cpus-per-task=## --cpu-bind=cores` you can see all the md steps fire at roughly the same time.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25662979     bilbomd.s+  COMPLETED   00:13:11      0:0 2024-05-16T13:19:32 2024-05-16T13:32:43
25662979.ba+      batch  COMPLETED   00:13:11      0:0 2024-05-16T13:19:32 2024-05-16T13:32:43
25662979.ex+     extern  COMPLETED   00:13:24      0:0 2024-05-16T13:19:32 2024-05-16T13:32:56
25662979.0      pdb2crd  COMPLETED   00:00:27      0:0 2024-05-16T13:19:44 2024-05-16T13:20:11
25662979.1      pdb2crd  COMPLETED   00:00:27      0:0 2024-05-16T13:19:44 2024-05-16T13:20:11
25662979.2         meld  COMPLETED   00:00:21      0:0 2024-05-16T13:20:11 2024-05-16T13:20:32
25662979.3     minimize  COMPLETED   00:01:05      0:0 2024-05-16T13:20:37 2024-05-16T13:21:42
25662979.4     initfoxs  COMPLETED   00:00:33      0:0 2024-05-16T13:21:42 2024-05-16T13:22:15
25662979.5         heat  COMPLETED   00:00:47      0:0 2024-05-16T13:22:15 2024-05-16T13:23:02
25662979.6          md3  COMPLETED   00:02:44      0:0 2024-05-16T13:23:21 2024-05-16T13:26:05
25662979.7          md5  COMPLETED   00:02:24      0:0 2024-05-16T13:23:21 2024-05-16T13:25:45
25662979.8          md2  COMPLETED   00:02:38      0:0 2024-05-16T13:23:27 2024-05-16T13:26:05
25662979.9          md4  COMPLETED   00:02:36      0:0 2024-05-16T13:23:28 2024-05-16T13:26:04
25662979.10         md1  COMPLETED   00:05:16      0:0 2024-05-16T13:23:34 2024-05-16T13:28:50
25662979.11     dcd2pdb  COMPLETED   00:02:42      0:0 2024-05-16T13:26:11 2024-05-16T13:28:53
25662979.12     dcd2pdb  COMPLETED   00:01:04      0:0 2024-05-16T13:26:13 2024-05-16T13:27:17
25662979.13     dcd2pdb     FAILED   00:01:00      1:0 2024-05-16T13:26:15 2024-05-16T13:27:15
25662979.14     dcd2pdb     FAILED   00:03:40      1:0 2024-05-16T13:26:15 2024-05-16T13:29:55
25662979.15     dcd2pdb  COMPLETED   00:01:33      0:0 2024-05-16T13:27:17 2024-05-16T13:28:50
25662979.16      foxs38  COMPLETED   00:02:02      0:0 2024-05-16T13:27:26 2024-05-16T13:29:28
25662979.17      foxs34  COMPLETED   00:00:38      0:0 2024-05-16T13:28:50 2024-05-16T13:29:28
25662979.18      foxs26  COMPLETED   00:01:05      0:0 2024-05-16T13:28:50 2024-05-16T13:29:55
25662979.19      foxs30  COMPLETED   00:00:22      0:0 2024-05-16T13:28:55 2024-05-16T13:29:17
25662979.20      foxs22  COMPLETED   00:02:42      0:0 2024-05-16T13:29:17 2024-05-16T13:31:59
25662979.21   multifoxs  COMPLETED   00:00:56      0:0 2024-05-16T13:32:00 2024-05-16T13:32:56
```

And here is another with `--ntasks=1 --cpus-per-task=## --cpu-bind=cores`. but with conf set to 2 for more MD runs.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25663642     bilbomd.s+  COMPLETED   00:10:39      0:0 2024-05-16T13:46:38 2024-05-16T13:57:17
25663642.ba+      batch  COMPLETED   00:10:39      0:0 2024-05-16T13:46:38 2024-05-16T13:57:17
25663642.ex+     extern  COMPLETED   00:11:14      0:0 2024-05-16T13:46:38 2024-05-16T13:57:52
25663642.0      pdb2crd  COMPLETED   00:01:40      0:0 2024-05-16T13:46:44 2024-05-16T13:48:24
25663642.1      pdb2crd     FAILED   00:02:05    126:0 2024-05-16T13:46:46 2024-05-16T13:48:51
25663642.2         meld     FAILED   00:01:39      2:0 2024-05-16T13:48:51 2024-05-16T13:50:30
25663642.3     minimize     FAILED   00:00:13      2:0 2024-05-16T13:50:30 2024-05-16T13:50:43
25663642.4     initfoxs  COMPLETED   00:00:08      0:0 2024-05-16T13:50:49 2024-05-16T13:50:57
25663642.5         heat     FAILED   00:00:19      2:0 2024-05-16T13:51:07 2024-05-16T13:51:26
25663642.6          md4     FAILED   00:01:12      2:0 2024-05-16T13:51:28 2024-05-16T13:52:40
25663642.7          md5     FAILED   00:02:04      2:0 2024-05-16T13:51:34 2024-05-16T13:53:38
25663642.8          md1     FAILED   00:02:02    126:0 2024-05-16T13:51:36 2024-05-16T13:53:38
25663642.9          md3     FAILED   00:00:22      2:0 2024-05-16T13:51:40 2024-05-16T13:52:02
25663642.10         md2     FAILED   00:00:18      2:0 2024-05-16T13:51:45 2024-05-16T13:52:03
25663642.11     dcd2pdb     FAILED   00:00:22      1:0 2024-05-16T13:52:03 2024-05-16T13:52:25
25663642.12     dcd2pdb     FAILED   00:00:43      1:0 2024-05-16T13:52:03 2024-05-16T13:52:46
25663642.13     dcd2pdb     FAILED   00:00:19      1:0 2024-05-16T13:52:25 2024-05-16T13:52:44
25663642.14     dcd2pdb     FAILED   00:00:55      1:0 2024-05-16T13:52:43 2024-05-16T13:53:38
25663642.15     dcd2pdb     FAILED   00:00:28      1:0 2024-05-16T13:52:44 2024-05-16T13:53:12
25663642.16     dcd2pdb     FAILED   00:00:50      1:0 2024-05-16T13:52:48 2024-05-16T13:53:38
25663642.17     dcd2pdb     FAILED   00:00:26      1:0 2024-05-16T13:53:12 2024-05-16T13:53:38
25663642.18     dcd2pdb     FAILED   00:02:19      1:0 2024-05-16T13:53:38 2024-05-16T13:55:57
25663642.19     dcd2pdb     FAILED   00:00:45      1:0 2024-05-16T13:53:38 2024-05-16T13:54:23
25663642.20     dcd2pdb     FAILED   00:00:57      1:0 2024-05-16T13:53:38 2024-05-16T13:54:35
25663642.21      foxs22  COMPLETED   00:01:52      0:0 2024-05-16T13:53:49 2024-05-16T13:55:41
25663642.22      foxs38  COMPLETED   00:02:06      0:0 2024-05-16T13:53:53 2024-05-16T13:55:59
25663642.23      foxs34  COMPLETED   00:01:32      0:0 2024-05-16T13:54:27 2024-05-16T13:55:59
25663642.24      foxs30  COMPLETED   00:01:06      0:0 2024-05-16T13:54:43 2024-05-16T13:55:49
25663642.25      foxs26  COMPLETED   00:00:14      0:0 2024-05-16T13:55:45 2024-05-16T13:55:59
25663642.26      foxs22  COMPLETED   00:00:08      0:0 2024-05-16T13:55:51 2024-05-16T13:55:59
25663642.27      foxs38  COMPLETED   00:00:31      0:0 2024-05-16T13:55:59 2024-05-16T13:56:30
25663642.28      foxs30  COMPLETED   00:00:41      0:0 2024-05-16T13:55:59 2024-05-16T13:56:40
25663642.29      foxs34  COMPLETED   00:00:10      0:0 2024-05-16T13:55:59 2024-05-16T13:56:09
25663642.30      foxs26  COMPLETED   00:00:04      0:0 2024-05-16T13:55:59 2024-05-16T13:56:03
25663642.31   multifoxs  COMPLETED   00:00:15      0:0 2024-05-16T13:57:12 2024-05-16T13:57:27
```

Initial pdb2crd failed

```shell
Error: OCI runtime error: crun: open `/tmp/62704_hpc/storage/overlay/7d0d4822de846afcf5094e0a655296b1e2c3b0844d3e73155c3a643e21be5e44/merged`: Transport endpoint is not connected
srun: error: nid003249: task 0: Exited with exit code 126
srun: Terminating StepId=25663642.1
```

It seems the podman-hpc image is sometimes having trouble accessing files

lets try on `cpu` vs `gpu` node. Doesn't seem to help.

with `--ntasks=1 --cpus-per-task=24 --cpu-bind=cores` for the parallel steps

This job worked, but a very odd pause for `md1`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25672286     bilbomd.s+  COMPLETED   00:17:17      0:0 2024-05-16T17:06:08 2024-05-16T17:23:25
25672286.ba+      batch  COMPLETED   00:17:17      0:0 2024-05-16T17:06:08 2024-05-16T17:23:25
25672286.ex+     extern  COMPLETED   00:17:23      0:0 2024-05-16T17:06:08 2024-05-16T17:23:31
25672286.0      pdb2crd  COMPLETED   00:00:08      0:0 2024-05-16T17:06:30 2024-05-16T17:06:38
25672286.1      pdb2crd  COMPLETED   00:00:24      0:0 2024-05-16T17:06:38 2024-05-16T17:07:02
25672286.2         meld  COMPLETED   00:00:06      0:0 2024-05-16T17:07:02 2024-05-16T17:07:08
25672286.3     minimize  COMPLETED   00:00:51      0:0 2024-05-16T17:07:49 2024-05-16T17:08:40
25672286.4     initfoxs  COMPLETED   00:00:06      0:0 2024-05-16T17:08:40 2024-05-16T17:08:46
25672286.5         heat  COMPLETED   00:00:47      0:0 2024-05-16T17:08:46 2024-05-16T17:09:33
25672286.6          md2  COMPLETED   00:02:35      0:0 2024-05-16T17:09:33 2024-05-16T17:12:08
25672286.7          md3  COMPLETED   00:02:30      0:0 2024-05-16T17:09:33 2024-05-16T17:12:03
25672286.8          md5  COMPLETED   00:02:35      0:0 2024-05-16T17:09:33 2024-05-16T17:12:08
25672286.9          md4  COMPLETED   00:02:35      0:0 2024-05-16T17:09:33 2024-05-16T17:12:08
25672286.12         md1  COMPLETED   00:02:36      0:0 2024-05-16T17:13:55 2024-05-16T17:16:31
25672286.13    dcd2pdb1  COMPLETED   00:00:33      0:0 2024-05-16T17:16:31 2024-05-16T17:17:04
25672286.14    dcd2pdb4  COMPLETED   00:00:11      0:0 2024-05-16T17:16:31 2024-05-16T17:16:42
25672286.15    dcd2pdb3  COMPLETED   00:00:33      0:0 2024-05-16T17:16:31 2024-05-16T17:17:04
25672286.16    dcd2pdb5  COMPLETED   00:00:33      0:0 2024-05-16T17:16:31 2024-05-16T17:17:04
25672286.18    dcd2pdb2  COMPLETED   00:00:14      0:0 2024-05-16T17:18:52 2024-05-16T17:19:06
25672286.19      foxs38  COMPLETED   00:01:53      0:0 2024-05-16T17:19:04 2024-05-16T17:20:57
25672286.20      foxs26  COMPLETED   00:01:23      0:0 2024-05-16T17:19:08 2024-05-16T17:20:31
25672286.21      foxs30  COMPLETED   00:01:38      0:0 2024-05-16T17:19:12 2024-05-16T17:20:50
25672286.22      foxs34  COMPLETED   00:02:15      0:0 2024-05-16T17:19:12 2024-05-16T17:21:27
25672286.24      foxs22  COMPLETED   00:01:17      0:0 2024-05-16T17:21:36 2024-05-16T17:22:53
25672286.25   multifoxs  COMPLETED   00:00:38      0:0 2024-05-16T17:22:53 2024-05-16T17:23:31
```

I now believe the pause is because teh total number of --ntasks for teh parallel `sruns` was very close to 128

## 5/17/2024 Lets run some more tests

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25708403     bilbomd.s+  COMPLETED   00:14:31      0:0 2024-05-17T09:30:03 2024-05-17T09:44:34
25708403.ba+      batch  COMPLETED   00:14:31      0:0 2024-05-17T09:30:03 2024-05-17T09:44:34
25708403.ex+     extern  COMPLETED   00:14:32      0:0 2024-05-17T09:30:03 2024-05-17T09:44:35
25708403.0      pdb2crd  COMPLETED   00:00:11      0:0 2024-05-17T09:30:09 2024-05-17T09:30:20
25708403.1      pdb2crd  COMPLETED   00:00:08      0:0 2024-05-17T09:30:12 2024-05-17T09:30:20
25708403.2         meld  COMPLETED   00:00:05      0:0 2024-05-17T09:30:21 2024-05-17T09:30:26
25708403.3     minimize  COMPLETED   00:00:33      0:0 2024-05-17T09:30:26 2024-05-17T09:30:59
25708403.4     initfoxs  COMPLETED   00:00:05      0:0 2024-05-17T09:30:59 2024-05-17T09:31:04
25708403.5         heat  COMPLETED   00:00:28      0:0 2024-05-17T09:31:04 2024-05-17T09:31:32
25708403.6          md1  COMPLETED   00:02:31      0:0 2024-05-17T09:31:32 2024-05-17T09:34:03
25708403.7          md2  COMPLETED   00:02:26      0:0 2024-05-17T09:31:32 2024-05-17T09:33:58
25708403.8          md5  COMPLETED   00:02:18      0:0 2024-05-17T09:31:32 2024-05-17T09:33:50
25708403.9          md4  COMPLETED   00:02:18      0:0 2024-05-17T09:31:32 2024-05-17T09:33:50
25708403.12         md3  COMPLETED   00:02:19      0:0 2024-05-17T09:35:44 2024-05-17T09:38:03
25708403.13    dcd2pdb1  COMPLETED   00:00:09      0:0 2024-05-17T09:38:03 2024-05-17T09:38:12
25708403.14    dcd2pdb2  COMPLETED   00:00:09      0:0 2024-05-17T09:38:03 2024-05-17T09:38:12
25708403.15    dcd2pdb5  COMPLETED   00:00:09      0:0 2024-05-17T09:38:03 2024-05-17T09:38:12
25708403.16    dcd2pdb4  COMPLETED   00:00:09      0:0 2024-05-17T09:38:03 2024-05-17T09:38:12
25708403.18    dcd2pdb3  COMPLETED   00:00:11      0:0 2024-05-17T09:40:08 2024-05-17T09:40:19
25708403.19      foxs22  COMPLETED   00:01:17      0:0 2024-05-17T09:40:17 2024-05-17T09:41:34
25708403.20      foxs30  COMPLETED   00:01:17      0:0 2024-05-17T09:40:17 2024-05-17T09:41:34
25708403.21      foxs34  COMPLETED   00:01:16      0:0 2024-05-17T09:40:17 2024-05-17T09:41:33
25708403.24      foxs38  COMPLETED   00:01:45      0:0 2024-05-17T09:42:20 2024-05-17T09:44:05
25708403.25      foxs26  COMPLETED   00:01:26      0:0 2024-05-17T09:42:25 2024-05-17T09:43:51
25708403.26   multifoxs  COMPLETED   00:00:29      0:0 2024-05-17T09:44:05 2024-05-17T09:44:34
```

some problems

```shell
21863 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/dynamics_rg22.out
21870 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/dynamics_rg26.out
21854 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/dynamics_rg30.out
21866 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/dynamics_rg34.out
21854 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/dynamics_rg38.out
check number of PDB files in each FoXS dir
200
200
200
200
200
check number of PDB.DAT files in each FoXS dir
200
200
170
152
200
check number of lines in foxs_dat_files.txt
922 /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a/multifoxs/foxs_dat_files.txt
```

I'm going to try using GNU parallel for the FoXS steps. I'll still have `gen-bilbomd-slurm.sh` make the individual `run_foxs_rg##_run#.sh` scripts, but I will modify them to use GNU parallel rather than a for loop.

it seems that having 5 parallel `srun` command with `--ntasks=1 --cpus-per-task=25 --cpu-bind=cores` (i.e 5 x 25 = 125 cores requested) on a GPU machine (128 CPU cores) causes only 4 to run at a time. I reduced `--cpus-per-task` to `24` and now all 5 jobs seems to run at the same time. Maybe it's important to leave a few cores for the system?

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25714358     bilbomd.s+  COMPLETED   00:05:12      0:0 2024-05-17T11:39:58 2024-05-17T11:45:10
25714358.ba+      batch  COMPLETED   00:05:12      0:0 2024-05-17T11:39:58 2024-05-17T11:45:10
25714358.ex+     extern  COMPLETED   00:05:14      0:0 2024-05-17T11:39:58 2024-05-17T11:45:12
25714358.0      pdb2crd  COMPLETED   00:00:15      0:0 2024-05-17T11:40:02 2024-05-17T11:40:17
25714358.1      pdb2crd  COMPLETED   00:00:36      0:0 2024-05-17T11:40:03 2024-05-17T11:40:39
25714358.2         meld  COMPLETED   00:00:06      0:0 2024-05-17T11:40:39 2024-05-17T11:40:45
25714358.3     minimize  COMPLETED   00:00:32      0:0 2024-05-17T11:40:45 2024-05-17T11:41:17
25714358.4     initfoxs  COMPLETED   00:00:07      0:0 2024-05-17T11:41:19 2024-05-17T11:41:26
25714358.5         heat  COMPLETED   00:00:28      0:0 2024-05-17T11:41:26 2024-05-17T11:41:54
25714358.6          md1  COMPLETED   00:02:32      0:0 2024-05-17T11:41:54 2024-05-17T11:44:26
25714358.7          md4  COMPLETED   00:02:26      0:0 2024-05-17T11:41:54 2024-05-17T11:44:20
25714358.8          md2  COMPLETED   00:02:34      0:0 2024-05-17T11:41:54 2024-05-17T11:44:28
25714358.9          md3  COMPLETED   00:02:24      0:0 2024-05-17T11:41:54 2024-05-17T11:44:18
25714358.10         md5  COMPLETED   00:02:21      0:0 2024-05-17T11:41:54 2024-05-17T11:44:15
25714358.11    dcd2pdb2  COMPLETED   00:00:18      0:0 2024-05-17T11:44:29 2024-05-17T11:44:47
25714358.12    dcd2pdb3  COMPLETED   00:00:17      0:0 2024-05-17T11:44:29 2024-05-17T11:44:46
25714358.13    dcd2pdb1  COMPLETED   00:00:20      0:0 2024-05-17T11:44:29 2024-05-17T11:44:49
25714358.14    dcd2pdb4  COMPLETED   00:00:09      0:0 2024-05-17T11:44:29 2024-05-17T11:44:38
25714358.15    dcd2pdb5  COMPLETED   00:00:12      0:0 2024-05-17T11:44:29 2024-05-17T11:44:41
25714358.16      foxs30  COMPLETED   00:00:12      0:0 2024-05-17T11:44:39 2024-05-17T11:44:51
25714358.17      foxs34     FAILED   00:00:15    127:0 2024-05-17T11:44:41 2024-05-17T11:44:56
25714358.18      foxs26     FAILED   00:00:07    126:0 2024-05-17T11:44:49 2024-05-17T11:44:56
25714358.19      foxs38     FAILED   00:00:07    126:0 2024-05-17T11:44:49 2024-05-17T11:44:56
25714358.20      foxs22     FAILED   00:00:07    126:0 2024-05-17T11:44:49 2024-05-17T11:44:56
25714358.21   multifoxs  COMPLETED   00:00:14      0:0 2024-05-17T11:44:56 2024-05-17T11:45:10
```

Maybe running 5 parallel `srun` with each one launching a GNU parallel script is too much....

```shell
Error: OCI runtime error: crun: cannot mkdir `sys`: Cannot allocate memory
Error: mounting storage for container fd58b7a6ff19bf9a60a9ac257b4dd3e705f507fcaa8478832846a9e54d0a85c1: creating overlay mount to /tmp/62704_hpc/storage/overlay/0386c71256ad440fb2118e58e5a953b3e44012f4fa4df6f4f9ebda600a14dbec/merged, mount_data="lowerdir=/pscratch/sd/s/sclassen/storage/overlay/l/F3D2SRNX3MI5P72XVYUGZ33G5B,upperdir=/tmp/62704_hpc/storage/overlay/0386c71256ad440fb2118e58e5a953b3e44012f4fa4df6f4f9ebda600a14dbec/diff,workdir=/tmp/62704_hpc/storage/overlay/0386c71256ad440fb2118e58e5a953b3e44012f4fa4df6f4f9ebda600a14dbec/work,volatile": using mount program /usr/bin/fuse-overlayfs-wrap: <stderr empty>: exit status 1
parallel: Warning: No more processes: Decreasing number of running jobs to 23.
parallel: Warning: Try increasing 'ulimit -u' (try: ulimit -u `ulimit -Hu`)
parallel: Warning: or increasing 'nproc' in /etc/security/limits.conf
parallel: Warning: or increasing /proc/sys/kernel/pid_max
Error: mounting storage for container a9575bd49b85497dffe504df46303ee553c59e0eb73b56d0609940fd56ca83a7: creating overlay mount to /tmp/62704_hpc/storage/overlay/6f57cce2a3bebd009e31e0049df757605929daeaf4627db93740ccee7b098a6d/merged, mount_data="lowerdir=/pscratch/sd/s/sclassen/storage/overlay/l/F3D2SRNX3MI5P72XVYUGZ33G5B,upperdir=/tmp/62704_hpc/storage/overlay/6f57cce2a3bebd009e31e0049df757605929daeaf4627db93740ccee7b098a6d/diff,workdir=/tmp/62704_hpc/storage/overlay/6f57cce2a3bebd009e31e0049df757605929daeaf4627db93740ccee7b098a6d/work,volatile": using mount program /usr/bin/fuse-overlayfs-wrap: <stderr empty>: exit status 1
parallel: Warning: No more processes: Decreasing number of running jobs to 22.
parallel: Warning: Try increasing 'ulimit -u' (try: ulimit -u `ulimit -Hu`)
parallel: Warning: or increasing 'nproc' in /etc/security/limits.conf
parallel: Warning: or increasing /proc/sys/kernel/pid_max
parallel: Warning: No more processes: Decreasing number of running jobs to 21.
parallel: Warning: Try increasing 'ulimit -u' (try: ulimit -u `ulimit -Hu`)
parallel: Warning: or increasing 'nproc' in /etc/security/limits.conf
parallel: Warning: or increasing /proc/sys/kernel/pid_max
parallel: Warning: No more processes: Decreasing number of running jobs to 20.
parallel: Warning: Try increasing 'ulimit -u' (try: ulimit -u `ulimit -Hu`)
parallel: Warning: or increasing 'nproc' in /etc/security/limits.conf
parallel: Warning: or increasing /proc/sys/kernel/pid_max
parallel: Warning: No more processes: Decreasing number of running jobs to 19.
parallel: Warning: Try increasing 'ulimit -u' (try: ulimit -u `ulimit -Hu`)
parallel: Warning: or increasing 'nproc' in /etc/security/limits.conf
parallel: Warning: or increasing /proc/sys/kernel/pid_max
parallel: Warning: No more processes: Decreasing number of running jobs to 18.
```

Lets's try doing the foxs gnu parallel scripts sequentially...

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25714994     bilbomd.s+  COMPLETED   00:06:54      0:0 2024-05-17T11:50:51 2024-05-17T11:57:45
25714994.ba+      batch  COMPLETED   00:06:54      0:0 2024-05-17T11:50:51 2024-05-17T11:57:45
25714994.ex+     extern  COMPLETED   00:07:01      0:0 2024-05-17T11:50:51 2024-05-17T11:57:52
25714994.0      pdb2crd  COMPLETED   00:00:37      0:0 2024-05-17T11:51:03 2024-05-17T11:51:40
25714994.1      pdb2crd  COMPLETED   00:00:48      0:0 2024-05-17T11:51:05 2024-05-17T11:51:53
25714994.2         meld  COMPLETED   00:00:05      0:0 2024-05-17T11:51:53 2024-05-17T11:51:58
25714994.3     minimize  COMPLETED   00:00:29      0:0 2024-05-17T11:51:59 2024-05-17T11:52:28
25714994.4     initfoxs  COMPLETED   00:00:04      0:0 2024-05-17T11:52:29 2024-05-17T11:52:33
25714994.5         heat  COMPLETED   00:00:30      0:0 2024-05-17T11:52:33 2024-05-17T11:53:03
25714994.6          md1  COMPLETED   00:02:32      0:0 2024-05-17T11:53:03 2024-05-17T11:55:35
25714994.7          md3  COMPLETED   00:02:25      0:0 2024-05-17T11:53:03 2024-05-17T11:55:28
25714994.8          md2  COMPLETED   00:02:26      0:0 2024-05-17T11:53:03 2024-05-17T11:55:29
25714994.9          md4  COMPLETED   00:02:20      0:0 2024-05-17T11:53:04 2024-05-17T11:55:24
25714994.10         md5  COMPLETED   00:02:25      0:0 2024-05-17T11:53:07 2024-05-17T11:55:32
25714994.11    dcd2pdb1  COMPLETED   00:00:10      0:0 2024-05-17T11:55:35 2024-05-17T11:55:45
25714994.12    dcd2pdb2  COMPLETED   00:00:22      0:0 2024-05-17T11:55:35 2024-05-17T11:55:57
25714994.13    dcd2pdb5  COMPLETED   00:00:26      0:0 2024-05-17T11:55:36 2024-05-17T11:56:02
25714994.14    dcd2pdb4  COMPLETED   00:00:14      0:0 2024-05-17T11:55:36 2024-05-17T11:55:50
25714994.15    dcd2pdb3  COMPLETED   00:00:17      0:0 2024-05-17T11:55:36 2024-05-17T11:55:53
25714994.16      foxs22  COMPLETED   00:00:12      0:0 2024-05-17T11:55:57 2024-05-17T11:56:09
25714994.17      foxs26  COMPLETED   00:00:17      0:0 2024-05-17T11:56:09 2024-05-17T11:56:26
25714994.18      foxs30  COMPLETED   00:00:13      0:0 2024-05-17T11:56:24 2024-05-17T11:56:37
25714994.19      foxs34  COMPLETED   00:00:17      0:0 2024-05-17T11:56:39 2024-05-17T11:56:56
25714994.20      foxs38  COMPLETED   00:00:15      0:0 2024-05-17T11:56:56 2024-05-17T11:57:11
25714994.21   multifoxs  COMPLETED   00:00:34      0:0 2024-05-17T11:57:11 2024-05-17T11:57:45
```

That seems to have worked!!!

Lets try with a longer MD run... say `conformational_sampling: 3`

this did not work

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25715612     bilbomd.s+  COMPLETED   00:16:39      0:0 2024-05-17T12:01:16 2024-05-17T12:17:55
25715612.ba+      batch  COMPLETED   00:16:39      0:0 2024-05-17T12:01:16 2024-05-17T12:17:55
25715612.ex+     extern  COMPLETED   00:16:42      0:0 2024-05-17T12:01:16 2024-05-17T12:17:58
25715612.0      pdb2crd  COMPLETED   00:00:51      0:0 2024-05-17T12:01:27 2024-05-17T12:02:18
25715612.1      pdb2crd  COMPLETED   00:00:07      0:0 2024-05-17T12:01:27 2024-05-17T12:01:34
25715612.2         meld  COMPLETED   00:00:10      0:0 2024-05-17T12:02:19 2024-05-17T12:02:29
25715612.3     minimize  COMPLETED   00:00:55      0:0 2024-05-17T12:02:30 2024-05-17T12:03:25
25715612.4     initfoxs  COMPLETED   00:00:46      0:0 2024-05-17T12:03:27 2024-05-17T12:04:13
25715612.5         heat  COMPLETED   00:00:34      0:0 2024-05-17T12:04:13 2024-05-17T12:04:47
25715612.6          md3  COMPLETED   00:08:46      0:0 2024-05-17T12:04:47 2024-05-17T12:13:33
25715612.7          md1  COMPLETED   00:07:34      0:0 2024-05-17T12:04:59 2024-05-17T12:12:33
25715612.8          md5  COMPLETED   00:06:47      0:0 2024-05-17T12:05:03 2024-05-17T12:11:50
25715612.9          md2  COMPLETED   00:06:59      0:0 2024-05-17T12:05:04 2024-05-17T12:12:03
25715612.10         md4  COMPLETED   00:07:06      0:0 2024-05-17T12:05:06 2024-05-17T12:12:12
25715612.11    dcd2pdb8  COMPLETED   00:00:19      0:0 2024-05-17T12:12:39 2024-05-17T12:12:58
25715612.12    dcd2pdb5  COMPLETED   00:00:14      0:0 2024-05-17T12:12:39 2024-05-17T12:12:53
25715612.13   dcd2pdb10  COMPLETED   00:00:15      0:0 2024-05-17T12:12:40 2024-05-17T12:12:55
25715612.14    dcd2pdb6  COMPLETED   00:01:42      0:0 2024-05-17T12:12:41 2024-05-17T12:14:23
25715612.15    dcd2pdb2  COMPLETED   00:01:41      0:0 2024-05-17T12:12:42 2024-05-17T12:14:23
25715612.16   dcd2pdb12     FAILED   00:00:14      1:0 2024-05-17T12:12:43 2024-05-17T12:12:57
25715612.17   dcd2pdb14     FAILED   00:00:58    126:0 2024-05-17T12:12:44 2024-05-17T12:13:42
25715612.18    dcd2pdb3     FAILED   00:00:59    126:0 2024-05-17T12:12:44 2024-05-17T12:13:43
25715612.19    dcd2pdb4     FAILED   00:00:08    126:0 2024-05-17T12:12:44 2024-05-17T12:12:52
25715612.20    dcd2pdb1     FAILED   00:00:59    126:0 2024-05-17T12:12:45 2024-05-17T12:13:44
25715612.21    dcd2pdb7     FAILED   00:00:46    125:0 2024-05-17T12:12:46 2024-05-17T12:13:32
25715612.22   dcd2pdb13     FAILED   00:00:20    125:0 2024-05-17T12:12:47 2024-05-17T12:13:07
25715612.23   dcd2pdb11  COMPLETED   00:01:35      0:0 2024-05-17T12:12:48 2024-05-17T12:14:23
25715612.24    dcd2pdb9  COMPLETED   00:01:13      0:0 2024-05-17T12:12:53 2024-05-17T12:14:06
25715612.25   dcd2pdb15  COMPLETED   00:00:33      0:0 2024-05-17T12:12:54 2024-05-17T12:13:27
25715612.26      foxs22  COMPLETED   00:00:35      0:0 2024-05-17T12:13:04 2024-05-17T12:13:39
25715612.27      foxs22  COMPLETED   00:00:45      0:0 2024-05-17T12:13:38 2024-05-17T12:14:23
25715612.28      foxs22  COMPLETED   00:00:20      0:0 2024-05-17T12:14:03 2024-05-17T12:14:23
25715612.29      foxs26  COMPLETED   00:00:10      0:0 2024-05-17T12:14:13 2024-05-17T12:14:23
25715612.30      foxs26  COMPLETED   00:00:22      0:0 2024-05-17T12:14:23 2024-05-17T12:14:45
25715612.31      foxs26  COMPLETED   00:00:32      0:0 2024-05-17T12:14:45 2024-05-17T12:15:17
25715612.32      foxs30  COMPLETED   00:00:07      0:0 2024-05-17T12:15:14 2024-05-17T12:15:21
25715612.33      foxs30  COMPLETED   00:01:13      0:0 2024-05-17T12:15:25 2024-05-17T12:16:38
25715612.34      foxs30  COMPLETED   00:00:55      0:0 2024-05-17T12:15:49 2024-05-17T12:16:44
25715612.35      foxs34  COMPLETED   00:00:26      0:0 2024-05-17T12:16:15 2024-05-17T12:16:41
25715612.36      foxs34  COMPLETED   00:00:24      0:0 2024-05-17T12:16:40 2024-05-17T12:17:04
25715612.37      foxs34  COMPLETED   00:00:07      0:0 2024-05-17T12:17:04 2024-05-17T12:17:11
25715612.38      foxs38  COMPLETED   00:00:07      0:0 2024-05-17T12:17:11 2024-05-17T12:17:18
25715612.39      foxs38  COMPLETED   00:00:06      0:0 2024-05-17T12:17:18 2024-05-17T12:17:24
25715612.40      foxs38  COMPLETED   00:00:27      0:0 2024-05-17T12:17:24 2024-05-17T12:17:51
25715612.41   multifoxs     FAILED   00:00:04      6:0 2024-05-17T12:17:51 2024-05-17T12:17:55
```

I think launching 15 simulataneous podman-hpc instances is not a good idea. I'm going to go nack to conformational_sampling = 1 so I can test the foxs steps with each foxs step having access to all cores.... actually they seem pretty darn fast with only 24 cores...

Lets figure out how to improve the dcd2pdb step. Could we have a single `srun` that uses gnu parallel inside the container to run all dcd2pdb charmm runs?

```shell
echo "Running CHARMM Extract PDB from DCD Trajectories..."
echo "Starting dcd2pdb_rg22_run1.inp"
srun --ntasks=1 --cpus-per-task=8 --cpu-bind=cores --job-name dcd2pdb1 podman-hpc run --rm --userns=keep-id -v /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a:/bilbomd/work -v /global/cfs/cdirs/m4659/bilbomd-uploads/4678615a-ec3d-4a2e-b639-28a4a349867a:/cfs bilbomd/bilbomd-perlmutter-worker:0.0.7 /bin/bash -c "cd /bilbomd/work/ && charmm -o dcd2pdb_rg22_run1.out -i dcd2pdb_rg22_run1.inp" &

```

Something like this:

```shell
srun --ntasks=1 --cpus-per-task=120 --cpu-bind=cores --job-name dcd2pdb podman-hpc run --rm --userns=keep-id -v /pscratch/sd/s/sclassen/bilbmod/4678615a-ec3d-4a2e-b639-28a4a349867a:/bilbomd/work -v /global/cfs/cdirs/m4659/bilbomd-uploads/4678615a-ec3d-4a2e-b639-28a4a349867a:/cfs bilbomd/bilbomd-perlmutter-worker:0.0.7 /bin/bash -c "cd /bilbomd/work/ && ./run_dcd2pdb.sh"
```

and the `run_dcd2pdb.sh` looks something like this:

```shell
#!/bin/bash
parallel 'charmm -o {.}.out -i {}' ::: dcd2pdb_rg*.inp
```

This seems to have worked.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25717365     bilbomd.s+  COMPLETED   00:14:05      0:0 2024-05-17T12:44:13 2024-05-17T12:58:18
25717365.ba+      batch  COMPLETED   00:14:05      0:0 2024-05-17T12:44:13 2024-05-17T12:58:18
25717365.ex+     extern  COMPLETED   00:14:05      0:0 2024-05-17T12:44:13 2024-05-17T12:58:18
25717365.0      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-17T12:44:18 2024-05-17T12:44:24
25717365.1      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-17T12:44:19 2024-05-17T12:44:25
25717365.2         meld  COMPLETED   00:00:05      0:0 2024-05-17T12:44:25 2024-05-17T12:44:30
25717365.3     minimize  COMPLETED   00:00:31      0:0 2024-05-17T12:44:31 2024-05-17T12:45:02
25717365.4     initfoxs  COMPLETED   00:00:07      0:0 2024-05-17T12:45:05 2024-05-17T12:45:12
25717365.5         heat  COMPLETED   00:01:01      0:0 2024-05-17T12:45:13 2024-05-17T12:46:14
25717365.6          md1  COMPLETED   00:07:41      0:0 2024-05-17T12:46:14 2024-05-17T12:53:55
25717365.7          md3  COMPLETED   00:07:10      0:0 2024-05-17T12:46:14 2024-05-17T12:53:24
25717365.8          md2  COMPLETED   00:07:02      0:0 2024-05-17T12:46:14 2024-05-17T12:53:16
25717365.9          md4  COMPLETED   00:06:53      0:0 2024-05-17T12:46:14 2024-05-17T12:53:07
25717365.10         md5  COMPLETED   00:07:10      0:0 2024-05-17T12:46:14 2024-05-17T12:53:24
25717365.11     dcd2pdb  COMPLETED   00:00:10      0:0 2024-05-17T12:53:59 2024-05-17T12:54:09
25717365.12      foxs22  COMPLETED   00:00:09      0:0 2024-05-17T12:54:11 2024-05-17T12:54:20
25717365.13      foxs22  COMPLETED   00:00:08      0:0 2024-05-17T12:54:21 2024-05-17T12:54:29
25717365.14      foxs22  COMPLETED   00:00:09      0:0 2024-05-17T12:54:30 2024-05-17T12:54:39
25717365.15      foxs26  COMPLETED   00:00:10      0:0 2024-05-17T12:54:39 2024-05-17T12:54:49
25717365.16      foxs26  COMPLETED   00:00:09      0:0 2024-05-17T12:54:49 2024-05-17T12:54:58
25717365.17      foxs26  COMPLETED   00:00:09      0:0 2024-05-17T12:54:58 2024-05-17T12:55:07
25717365.18      foxs30  COMPLETED   00:00:11      0:0 2024-05-17T12:55:09 2024-05-17T12:55:20
25717365.19      foxs30  COMPLETED   00:00:15      0:0 2024-05-17T12:55:22 2024-05-17T12:55:37
25717365.20      foxs30  COMPLETED   00:00:10      0:0 2024-05-17T12:55:37 2024-05-17T12:55:47
25717365.21      foxs34  COMPLETED   00:00:09      0:0 2024-05-17T12:55:47 2024-05-17T12:55:56
25717365.22      foxs34  COMPLETED   00:00:09      0:0 2024-05-17T12:55:56 2024-05-17T12:56:05
25717365.23      foxs34  COMPLETED   00:00:32      0:0 2024-05-17T12:56:05 2024-05-17T12:56:37
25717365.24      foxs38  COMPLETED   00:00:09      0:0 2024-05-17T12:56:37 2024-05-17T12:56:46
25717365.25      foxs38  COMPLETED   00:00:09      0:0 2024-05-17T12:56:46 2024-05-17T12:56:55
25717365.26      foxs38  COMPLETED   00:00:09      0:0 2024-05-17T12:56:55 2024-05-17T12:57:04
25717365.27   multifoxs  COMPLETED   00:01:06      0:0 2024-05-17T12:57:04 2024-05-17T12:58:10
```

There might be some way to improve the foxs runs? With the current MD settings each "run" produces 200 pdb files. This is why I was thinking that I should execute the `foxs##` runs serially, but they are very fast and the overhead to standup/teardown all those docker containers is significant. Maybe they can be batched....

Each Rg has anywhere from 1-4 runs. I could either run gnu parallel scripts for each Rg (all runs) or maybe a single GNU parallel script for everything?

OK. it took a lot of back and forth, but I was able to get a version going with gnu parallel for all FoXS runs.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25725338     bilbomd.s+  COMPLETED   00:08:51      0:0 2024-05-17T16:00:40 2024-05-17T16:09:31
25725338.ba+      batch  COMPLETED   00:08:51      0:0 2024-05-17T16:00:40 2024-05-17T16:09:31
25725338.ex+     extern  COMPLETED   00:08:51      0:0 2024-05-17T16:00:40 2024-05-17T16:09:31
25725338.0      pdb2crd  COMPLETED   00:00:05      0:0 2024-05-17T16:00:50 2024-05-17T16:00:55
25725338.1      pdb2crd  COMPLETED   00:00:09      0:0 2024-05-17T16:00:54 2024-05-17T16:01:03
25725338.2         meld  COMPLETED   00:00:14      0:0 2024-05-17T16:01:19 2024-05-17T16:01:33
25725338.3     minimize  COMPLETED   00:00:50      0:0 2024-05-17T16:01:45 2024-05-17T16:02:35
25725338.4     initfoxs  COMPLETED   00:00:56      0:0 2024-05-17T16:02:37 2024-05-17T16:03:33
25725338.5         heat  COMPLETED   00:02:01      0:0 2024-05-17T16:03:35 2024-05-17T16:05:36
25725338.6          md4  COMPLETED   00:02:21      0:0 2024-05-17T16:05:36 2024-05-17T16:07:57
25725338.7          md5  COMPLETED   00:02:20      0:0 2024-05-17T16:05:36 2024-05-17T16:07:56
25725338.8          md2  COMPLETED   00:02:34      0:0 2024-05-17T16:05:36 2024-05-17T16:08:10
25725338.9          md3  COMPLETED   00:02:26      0:0 2024-05-17T16:05:36 2024-05-17T16:08:02
25725338.10         md1  COMPLETED   00:02:37      0:0 2024-05-17T16:05:36 2024-05-17T16:08:13
25725338.11     dcd2pdb  COMPLETED   00:00:11      0:0 2024-05-17T16:08:15 2024-05-17T16:08:26
25725338.12        foxs  COMPLETED   00:00:29      0:0 2024-05-17T16:08:26 2024-05-17T16:08:55
25725338.13   multifoxs  COMPLETED   00:00:35      0:0 2024-05-17T16:08:56 2024-05-17T16:09:31
```

Looks OK conf_sampling=1 time=08:51

try again with `conformational_sampling: 1`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25725664     bilbomd.s+  COMPLETED   00:05:08      0:0 2024-05-17T16:18:08 2024-05-17T16:23:16
25725664.ba+      batch  COMPLETED   00:05:08      0:0 2024-05-17T16:18:08 2024-05-17T16:23:16
25725664.ex+     extern  COMPLETED   00:05:08      0:0 2024-05-17T16:18:08 2024-05-17T16:23:16
25725664.0      pdb2crd  COMPLETED   00:00:08      0:0 2024-05-17T16:18:13 2024-05-17T16:18:21
25725664.1      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-17T16:18:14 2024-05-17T16:18:20
25725664.2         meld  COMPLETED   00:00:04      0:0 2024-05-17T16:18:21 2024-05-17T16:18:25
25725664.3     minimize  COMPLETED   00:00:33      0:0 2024-05-17T16:18:25 2024-05-17T16:18:58
25725664.4     initfoxs  COMPLETED   00:00:04      0:0 2024-05-17T16:18:58 2024-05-17T16:19:02
25725664.5         heat  COMPLETED   00:00:28      0:0 2024-05-17T16:19:02 2024-05-17T16:19:30
25725664.6          md5  COMPLETED   00:02:23      0:0 2024-05-17T16:19:30 2024-05-17T16:21:53
25725664.7          md3  COMPLETED   00:02:23      0:0 2024-05-17T16:19:30 2024-05-17T16:21:53
25725664.8          md1  COMPLETED   00:02:35      0:0 2024-05-17T16:19:30 2024-05-17T16:22:05
25725664.9          md2  COMPLETED   00:02:29      0:0 2024-05-17T16:19:30 2024-05-17T16:21:59
25725664.10         md4  COMPLETED   00:02:23      0:0 2024-05-17T16:19:30 2024-05-17T16:21:53
25725664.11     dcd2pdb  COMPLETED   00:00:13      0:0 2024-05-17T16:22:05 2024-05-17T16:22:18
25725664.12        foxs  COMPLETED   00:00:29      0:0 2024-05-17T16:22:18 2024-05-17T16:22:47
25725664.13   multifoxs  COMPLETED   00:00:28      0:0 2024-05-17T16:22:48 2024-05-17T16:23:16
```

Looks OK conf_sampling=1 time=05:08

Try with `conformational_sampling: 3`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25725777     bilbomd.s+  COMPLETED   00:11:09      0:0 2024-05-17T16:25:56 2024-05-17T16:37:05
25725777.ba+      batch  COMPLETED   00:11:09      0:0 2024-05-17T16:25:56 2024-05-17T16:37:05
25725777.ex+     extern  COMPLETED   00:11:10      0:0 2024-05-17T16:25:56 2024-05-17T16:37:06
25725777.0      pdb2crd  COMPLETED   00:00:05      0:0 2024-05-17T16:25:59 2024-05-17T16:26:04
25725777.1      pdb2crd  COMPLETED   00:00:05      0:0 2024-05-17T16:25:59 2024-05-17T16:26:04
25725777.2         meld  COMPLETED   00:00:05      0:0 2024-05-17T16:26:04 2024-05-17T16:26:09
25725777.3     minimize  COMPLETED   00:00:28      0:0 2024-05-17T16:26:09 2024-05-17T16:26:37
25725777.4     initfoxs  COMPLETED   00:00:04      0:0 2024-05-17T16:26:38 2024-05-17T16:26:42
25725777.5         heat  COMPLETED   00:00:30      0:0 2024-05-17T16:26:42 2024-05-17T16:27:12
25725777.6          md3  COMPLETED   00:06:54      0:0 2024-05-17T16:27:12 2024-05-17T16:34:06
25725777.7          md1  COMPLETED   00:07:23      0:0 2024-05-17T16:27:12 2024-05-17T16:34:35
25725777.8          md2  COMPLETED   00:07:03      0:0 2024-05-17T16:27:12 2024-05-17T16:34:15
25725777.9          md5  COMPLETED   00:06:54      0:0 2024-05-17T16:27:12 2024-05-17T16:34:06
25725777.10         md4  COMPLETED   00:07:02      0:0 2024-05-17T16:27:12 2024-05-17T16:34:14
25725777.11     dcd2pdb  COMPLETED   00:00:11      0:0 2024-05-17T16:34:36 2024-05-17T16:34:47
25725777.12        foxs  COMPLETED   00:01:20      0:0 2024-05-17T16:34:47 2024-05-17T16:36:07
25725777.13   multifoxs  COMPLETED   00:00:58      0:0 2024-05-17T16:36:07 2024-05-17T16:37:05
```

Looks OK conf_sampling=3 time=11:09

And try again 2 with `conformational_sampling: 3`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25726210     bilbomd.s+  COMPLETED   00:11:43      0:0 2024-05-17T16:41:54 2024-05-17T16:53:37
25726210.ba+      batch  COMPLETED   00:11:43      0:0 2024-05-17T16:41:54 2024-05-17T16:53:37
25726210.ex+     extern  COMPLETED   00:11:45      0:0 2024-05-17T16:41:54 2024-05-17T16:53:39
25726210.0      pdb2crd  COMPLETED   00:00:05      0:0 2024-05-17T16:41:57 2024-05-17T16:42:02
25726210.1      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-17T16:41:57 2024-05-17T16:42:03
25726210.2         meld  COMPLETED   00:00:04      0:0 2024-05-17T16:42:03 2024-05-17T16:42:07
25726210.3     minimize  COMPLETED   00:00:30      0:0 2024-05-17T16:42:08 2024-05-17T16:42:38
25726210.4     initfoxs  COMPLETED   00:00:08      0:0 2024-05-17T16:42:38 2024-05-17T16:42:46
25726210.5         heat  COMPLETED   00:00:28      0:0 2024-05-17T16:42:46 2024-05-17T16:43:14
25726210.6          md3  COMPLETED   00:06:50      0:0 2024-05-17T16:43:14 2024-05-17T16:50:04
25726210.7          md5  COMPLETED   00:06:48      0:0 2024-05-17T16:43:15 2024-05-17T16:50:03
25726210.8          md2  COMPLETED   00:07:12      0:0 2024-05-17T16:43:15 2024-05-17T16:50:27
25726210.9          md1  COMPLETED   00:07:38      0:0 2024-05-17T16:43:16 2024-05-17T16:50:54
25726210.10         md4  COMPLETED   00:07:24      0:0 2024-05-17T16:43:18 2024-05-17T16:50:42
25726210.11     dcd2pdb  COMPLETED   00:00:34      0:0 2024-05-17T16:50:55 2024-05-17T16:51:29
25726210.12        foxs  COMPLETED   00:01:21      0:0 2024-05-17T16:51:30 2024-05-17T16:52:51
25726210.13   multifoxs  COMPLETED   00:00:46      0:0 2024-05-17T16:52:51 2024-05-17T16:53:37
```

Looks OK conf_sampling=3 time=11:43

So things to test next include:

- larger systems
- speed up md with OpenMPI?
- BilboMdCRD
- BilboMdAuto

end of Friday 5/17/2024

## Testing Monday May 20, 2024

### Try a `BilboMdAuto` job with `conformational_sampling: 1`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25833702     bilbomd.s+  COMPLETED   00:11:15      0:0 2024-05-20T14:32:01 2024-05-20T14:43:16
25833702.ba+      batch  COMPLETED   00:11:15      0:0 2024-05-20T14:32:01 2024-05-20T14:43:16
25833702.ex+     extern  COMPLETED   00:11:15      0:0 2024-05-20T14:32:01 2024-05-20T14:43:16
25833702.0      pdb2crd  COMPLETED   00:00:08      0:0 2024-05-20T14:32:05 2024-05-20T14:32:13
25833702.1         meld  COMPLETED   00:00:05      0:0 2024-05-20T14:32:14 2024-05-20T14:32:19
25833702.2    pae2const  COMPLETED   00:00:08      0:0 2024-05-20T14:32:20 2024-05-20T14:32:28
25833702.3     minimize  COMPLETED   00:00:56      0:0 2024-05-20T14:32:28 2024-05-20T14:33:24
25833702.4     initfoxs  COMPLETED   00:00:07      0:0 2024-05-20T14:33:24 2024-05-20T14:33:31
25833702.5         heat  COMPLETED   00:01:06      0:0 2024-05-20T14:33:31 2024-05-20T14:34:37
25833702.6          md5  COMPLETED   00:06:33      0:0 2024-05-20T14:34:37 2024-05-20T14:41:10
25833702.7          md4  COMPLETED   00:06:36      0:0 2024-05-20T14:34:37 2024-05-20T14:41:13
25833702.8          md3  COMPLETED   00:06:36      0:0 2024-05-20T14:34:37 2024-05-20T14:41:13
25833702.9          md2  COMPLETED   00:06:28      0:0 2024-05-20T14:34:37 2024-05-20T14:41:05
25833702.10         md1  COMPLETED   00:06:53      0:0 2024-05-20T14:34:37 2024-05-20T14:41:30
25833702.11     dcd2pdb  COMPLETED   00:00:15      0:0 2024-05-20T14:41:30 2024-05-20T14:41:45
25833702.12        foxs  COMPLETED   00:00:37      0:0 2024-05-20T14:41:46 2024-05-20T14:42:23
25833702.13   multifoxs  COMPLETED   00:00:52      0:0 2024-05-20T14:42:24 2024-05-20T14:43:16
```

### Tried a `BilboMdAuto` job with `conformational_sampling: 2`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25834685     bilbomd.s+  COMPLETED   00:18:37      0:0 2024-05-20T14:48:21 2024-05-20T15:06:58
25834685.ba+      batch  COMPLETED   00:18:37      0:0 2024-05-20T14:48:21 2024-05-20T15:06:58
25834685.ex+     extern  COMPLETED   00:18:37      0:0 2024-05-20T14:48:21 2024-05-20T15:06:58
25834685.0      pdb2crd  COMPLETED   00:00:08      0:0 2024-05-20T14:48:26 2024-05-20T14:48:34
25834685.1         meld  COMPLETED   00:00:06      0:0 2024-05-20T14:48:34 2024-05-20T14:48:40
25834685.2    pae2const  COMPLETED   00:00:08      0:0 2024-05-20T14:48:40 2024-05-20T14:48:48
25834685.3     minimize  COMPLETED   00:00:56      0:0 2024-05-20T14:48:49 2024-05-20T14:49:45
25834685.4     initfoxs  COMPLETED   00:00:06      0:0 2024-05-20T14:49:46 2024-05-20T14:49:52
25834685.5         heat  COMPLETED   00:01:01      0:0 2024-05-20T14:49:53 2024-05-20T14:50:54
25834685.6          md1  COMPLETED   00:13:49      0:0 2024-05-20T14:50:55 2024-05-20T15:04:44
25834685.7          md4  COMPLETED   00:13:38      0:0 2024-05-20T14:50:55 2024-05-20T15:04:33
25834685.8          md5  COMPLETED   00:12:43      0:0 2024-05-20T14:50:55 2024-05-20T15:03:38
25834685.9          md3  COMPLETED   00:12:45      0:0 2024-05-20T14:50:55 2024-05-20T15:03:40
25834685.10         md2  COMPLETED   00:12:57      0:0 2024-05-20T14:50:55 2024-05-20T15:03:52
25834685.11     dcd2pdb  COMPLETED   00:00:16      0:0 2024-05-20T15:04:44 2024-05-20T15:05:00
25834685.12        foxs  COMPLETED   00:01:12      0:0 2024-05-20T15:05:00 2024-05-20T15:06:12
25834685.13   multifoxs  COMPLETED   00:00:46      0:0 2024-05-20T15:06:12 2024-05-20T15:06:58
```

### Try a `BilboMdAuto` job with `conformational_sampling: 3`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25837527     bilbomd.s+  COMPLETED   00:25:25      0:0 2024-05-20T15:44:21 2024-05-20T16:09:46
25837527.ba+      batch  COMPLETED   00:25:25      0:0 2024-05-20T15:44:21 2024-05-20T16:09:46
25837527.ex+     extern  COMPLETED   00:25:25      0:0 2024-05-20T15:44:21 2024-05-20T16:09:46
25837527.0      pdb2crd  COMPLETED   00:00:06      0:0 2024-05-20T15:44:26 2024-05-20T15:44:32
25837527.1         meld  COMPLETED   00:00:05      0:0 2024-05-20T15:44:33 2024-05-20T15:44:38
25837527.2    pae2const  COMPLETED   00:00:07      0:0 2024-05-20T15:44:39 2024-05-20T15:44:46
25837527.3     minimize  COMPLETED   00:00:54      0:0 2024-05-20T15:44:46 2024-05-20T15:45:40
25837527.4     initfoxs  COMPLETED   00:00:06      0:0 2024-05-20T15:45:40 2024-05-20T15:45:46
25837527.5         heat  COMPLETED   00:01:02      0:0 2024-05-20T15:45:46 2024-05-20T15:46:48
25837527.6          md3  COMPLETED   00:19:04      0:0 2024-05-20T15:46:52 2024-05-20T16:05:56
25837527.7          md5  COMPLETED   00:19:44      0:0 2024-05-20T15:46:53 2024-05-20T16:06:37
25837527.8          md2  COMPLETED   00:19:20      0:0 2024-05-20T15:46:55 2024-05-20T16:06:15
25837527.9          md4  COMPLETED   00:19:08      0:0 2024-05-20T15:46:56 2024-05-20T16:06:04
25837527.10         md1  COMPLETED   00:19:36      0:0 2024-05-20T15:46:56 2024-05-20T16:06:32
25837527.11     dcd2pdb  COMPLETED   00:00:14      0:0 2024-05-20T16:06:37 2024-05-20T16:06:51
25837527.12        foxs  COMPLETED   00:01:43      0:0 2024-05-20T16:06:52 2024-05-20T16:08:35
25837527.13   multifoxs  COMPLETED   00:01:11      0:0 2024-05-20T16:08:35 2024-05-20T16:09:46
```

### Try a `BilboMdCRD` job with `conformational_sampling: 1`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25839136     bilbomd.s+  COMPLETED   00:07:59      0:0 2024-05-20T16:23:04 2024-05-20T16:31:03
25839136.ba+      batch  COMPLETED   00:07:59      0:0 2024-05-20T16:23:04 2024-05-20T16:31:03
25839136.ex+     extern  COMPLETED   00:07:59      0:0 2024-05-20T16:23:04 2024-05-20T16:31:03
25839136.0     minimize  COMPLETED   00:00:31      0:0 2024-05-20T16:23:07 2024-05-20T16:23:38
25839136.1     initfoxs  COMPLETED   00:00:05      0:0 2024-05-20T16:23:38 2024-05-20T16:23:43
25839136.2         heat  COMPLETED   00:01:00      0:0 2024-05-20T16:23:43 2024-05-20T16:24:43
25839136.3          md5  COMPLETED   00:04:43      0:0 2024-05-20T16:24:44 2024-05-20T16:29:27
25839136.4          md2  COMPLETED   00:04:46      0:0 2024-05-20T16:24:44 2024-05-20T16:29:30
25839136.5          md4  COMPLETED   00:04:35      0:0 2024-05-20T16:24:44 2024-05-20T16:29:19
25839136.6          md3  COMPLETED   00:04:35      0:0 2024-05-20T16:24:44 2024-05-20T16:29:19
25839136.7          md1  COMPLETED   00:05:01      0:0 2024-05-20T16:24:44 2024-05-20T16:29:45
25839136.8      dcd2pdb  COMPLETED   00:00:11      0:0 2024-05-20T16:29:46 2024-05-20T16:29:57
25839136.9         foxs  COMPLETED   00:00:29      0:0 2024-05-20T16:29:58 2024-05-20T16:30:27
25839136.10   multifoxs  COMPLETED   00:00:36      0:0 2024-05-20T16:30:27 2024-05-20T16:31:03
```

### Try a `BilboMdCRD` job with `conformational_sampling: 3`

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25839618     bilbomd.s+  COMPLETED   00:19:00      0:0 2024-05-20T16:38:19 2024-05-20T16:57:19
25839618.ba+      batch  COMPLETED   00:19:00      0:0 2024-05-20T16:38:19 2024-05-20T16:57:19
25839618.ex+     extern  COMPLETED   00:19:00      0:0 2024-05-20T16:38:19 2024-05-20T16:57:19
25839618.0     minimize  COMPLETED   00:00:35      0:0 2024-05-20T16:38:30 2024-05-20T16:39:05
25839618.1     initfoxs  COMPLETED   00:00:08      0:0 2024-05-20T16:39:05 2024-05-20T16:39:13
25839618.2         heat  COMPLETED   00:01:12      0:0 2024-05-20T16:39:17 2024-05-20T16:40:29
25839618.3          md4  COMPLETED   00:13:54      0:0 2024-05-20T16:40:31 2024-05-20T16:54:25
25839618.4          md5  COMPLETED   00:13:11      0:0 2024-05-20T16:40:32 2024-05-20T16:53:43
25839618.5          md3  COMPLETED   00:13:38      0:0 2024-05-20T16:40:36 2024-05-20T16:54:14
25839618.6          md2  COMPLETED   00:14:00      0:0 2024-05-20T16:40:39 2024-05-20T16:54:39
25839618.7          md1     FAILED   00:10:36     11:0 2024-05-20T16:40:41 2024-05-20T16:51:17
25839618.8      dcd2pdb     FAILED   00:00:16      1:0 2024-05-20T16:54:40 2024-05-20T16:54:56
25839618.9         foxs  COMPLETED   00:01:20      0:0 2024-05-20T16:54:56 2024-05-20T16:56:16
25839618.10   multifoxs  COMPLETED   00:00:57      0:0 2024-05-20T16:56:22 2024-05-20T16:57:19
```

Errored out:

```shell
srun: Job 25839618 step creation temporarily disabled, retrying (Requested nodes are busy)
srun: Step created for StepId=25839618.1
srun: Job 25839618 step creation temporarily disabled, retrying (Requested nodes are busy)
srun: Job 25839618 step creation temporarily disabled, retrying (Requested nodes are busy)
srun: Job 25839618 step creation temporarily disabled, retrying (Requested nodes are busy)
srun: Step created for StepId=25839618.4
srun: Step created for StepId=25839618.6
srun: Step created for StepId=25839618.7

Program received signal SIGSEGV: Segmentation fault - invalid memory reference.

Backtrace for this error:
#0  0x7f164bd3ac5d in ???
#1  0x7f164bd39d85 in ???
#2  0x7f164b8e231f in ???
#3  0x55c745315dd9 in ???
#4  0x55c745319014 in ???
#5  0x55c74532e480 in ???
#6  0x55c745348aa5 in ???
#7  0x55c74534cab9 in ???
#8  0x55c7448cf847 in ???
#9  0x55c7447e36fe in ???
#10  0x55c7447cb966 in ???
#11  0x55c7447e00e4 in ???
#12  0x55c744782122 in ???
#13  0x55c744780d6e in ???
#14  0x7f164b8c71c9 in ???
#15  0x7f164b8c728a in ???
#16  0x55c744780d94 in ???
#17  0xffffffffffffffff in ???
srun: error: nid001157: task 0: Exited with exit code 139
srun: Terminating StepId=25839618.7
srun: Job 25839618 step creation temporarily disabled, retrying (Requested nodes are busy)
srun: Step created for StepId=25839618.8
srun: error: nid001157: task 0: Exited with exit code 1
srun: Terminating StepId=25839618.8

```

Need to test `sleep` between md srun commands

## Testing Tuesday May 21, 2024

### Try a `BilboMdCRD` job with `conformational_sampling: 3` and `sleep 2` beween md sruns

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25871596     bilbomd.s+  COMPLETED   00:24:04      0:0 2024-05-21T10:00:05 2024-05-21T10:24:09
25871596.ba+      batch  COMPLETED   00:24:04      0:0 2024-05-21T10:00:05 2024-05-21T10:24:09
25871596.ex+     extern  COMPLETED   00:24:40      0:0 2024-05-21T10:00:05 2024-05-21T10:24:45
25871596.0     minimize  COMPLETED   00:00:54      0:0 2024-05-21T10:00:08 2024-05-21T10:01:02
25871596.1     initfoxs  COMPLETED   00:00:44      0:0 2024-05-21T10:01:04 2024-05-21T10:01:48
25871596.2         heat  COMPLETED   00:01:55      0:0 2024-05-21T10:01:48 2024-05-21T10:03:43
25871596.3          md1  COMPLETED   00:16:20      0:0 2024-05-21T10:03:43 2024-05-21T10:20:03
25871596.4          md2  COMPLETED   00:13:56      0:0 2024-05-21T10:03:45 2024-05-21T10:17:41
25871596.5          md3  COMPLETED   00:13:44      0:0 2024-05-21T10:04:05 2024-05-21T10:17:49
25871596.6          md4  COMPLETED   00:13:43      0:0 2024-05-21T10:04:05 2024-05-21T10:17:48
25871596.7          md5  COMPLETED   00:15:09      0:0 2024-05-21T10:05:02 2024-05-21T10:20:11
25871596.8      dcd2pdb  COMPLETED   00:00:21      0:0 2024-05-21T10:20:11 2024-05-21T10:20:32
25871596.9         foxs  COMPLETED   00:01:52      0:0 2024-05-21T10:20:40 2024-05-21T10:22:32
25871596.10   multifoxs  COMPLETED   00:01:59      0:0 2024-05-21T10:22:44 2024-05-21T10:24:43
```

Seems odd that md3 and md4 started at the same time...

### Try a `BilboMdCRD` job with `conformational_sampling: 3` and `sleep 2` beween md sruns

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25873844     bilbomd.s+  COMPLETED   00:24:34      0:0 2024-05-21T10:28:27 2024-05-21T10:53:01
25873844.ba+      batch  COMPLETED   00:24:34      0:0 2024-05-21T10:28:27 2024-05-21T10:53:01
25873844.ex+     extern  COMPLETED   00:24:34      0:0 2024-05-21T10:28:27 2024-05-21T10:53:01
25873844.0     minimize  COMPLETED   00:00:57      0:0 2024-05-21T10:28:36 2024-05-21T10:29:33
25873844.1     initfoxs  COMPLETED   00:01:11      0:0 2024-05-21T10:29:41 2024-05-21T10:30:52
25873844.2         heat  COMPLETED   00:01:45      0:0 2024-05-21T10:30:52 2024-05-21T10:32:37
25873844.3          md5  COMPLETED   00:14:22      0:0 2024-05-21T10:32:37 2024-05-21T10:46:59
25873844.4          md3  COMPLETED   00:14:22      0:0 2024-05-21T10:32:37 2024-05-21T10:46:59
25873844.5          md1  COMPLETED   00:15:09      0:0 2024-05-21T10:32:37 2024-05-21T10:47:46
25873844.6          md4  COMPLETED   00:14:22      0:0 2024-05-21T10:32:37 2024-05-21T10:46:59
25873844.7          md2  COMPLETED   00:14:04      0:0 2024-05-21T10:32:37 2024-05-21T10:46:41
25873844.8      dcd2pdb  COMPLETED   00:00:43      0:0 2024-05-21T10:48:03 2024-05-21T10:48:46
25873844.9         foxs  COMPLETED   00:02:49      0:0 2024-05-21T10:49:00 2024-05-21T10:51:49
25873844.10   multifoxs  COMPLETED   00:01:02      0:0 2024-05-21T10:51:59 2024-05-21T10:53:01
```

### Try a `BilboMdAuto` job with `conformational_sampling: 3` and `sleep 2` beween md sruns

```shell
25874199     bilbomd.s+    TIMEOUT   00:30:07      0:0 2024-05-21T10:32:56 2024-05-21T11:03:03
25874199.ba+      batch  CANCELLED   00:30:09     0:15 2024-05-21T10:32:56 2024-05-21T11:03:05
25874199.ex+     extern    TIMEOUT   00:30:07      0:0 2024-05-21T10:32:56 2024-05-21T11:03:03
25874199.0      pdb2crd  COMPLETED   00:00:37      0:0 2024-05-21T10:33:16 2024-05-21T10:33:53
25874199.1         meld  COMPLETED   00:01:04      0:0 2024-05-21T10:33:56 2024-05-21T10:35:00
25874199.2    pae2const  COMPLETED   00:00:11      0:0 2024-05-21T10:35:00 2024-05-21T10:35:11
25874199.3     minimize  COMPLETED   00:01:40      0:0 2024-05-21T10:35:18 2024-05-21T10:36:58
25874199.4     initfoxs  COMPLETED   00:01:21      0:0 2024-05-21T10:36:58 2024-05-21T10:38:19
25874199.5         heat  COMPLETED   00:02:23      0:0 2024-05-21T10:38:19 2024-05-21T10:40:42
25874199.6          md2  COMPLETED   00:19:40      0:0 2024-05-21T10:40:42 2024-05-21T11:00:22
25874199.7          md3  COMPLETED   00:19:34      0:0 2024-05-21T10:40:42 2024-05-21T11:00:16
25874199.8          md1  COMPLETED   00:20:08      0:0 2024-05-21T10:40:42 2024-05-21T11:00:50
25874199.9          md4  COMPLETED   00:19:40      0:0 2024-05-21T10:40:42 2024-05-21T11:00:22
25874199.10         md5  COMPLETED   00:20:08      0:0 2024-05-21T10:40:42 2024-05-21T11:00:50
25874199.11     dcd2pdb  COMPLETED   00:00:32      0:0 2024-05-21T11:00:50 2024-05-21T11:01:22
25874199.12        foxs  COMPLETED   00:02:23      0:0 2024-05-21T11:01:30 2024-05-21T11:03:53
```

Not sure what's going on...

### Try a `BilboMdPDB` job with `conformational_sampling: 4` and `sleep 10` beween md sruns

```shell
25875147     bilbomd.s+  COMPLETED   00:09:15      0:0 2024-05-21T10:53:01 2024-05-21T11:02:16
25875147.ba+      batch  COMPLETED   00:09:15      0:0 2024-05-21T10:53:01 2024-05-21T11:02:16
25875147.ex+     extern  COMPLETED   00:09:15      0:0 2024-05-21T10:53:01 2024-05-21T11:02:16
25875147.0      pdb2crd  COMPLETED   00:00:24      0:0 2024-05-21T10:53:15 2024-05-21T10:53:39
25875147.1      pdb2crd     FAILED   00:00:21    126:0 2024-05-21T10:53:18 2024-05-21T10:53:39
25875147.2         meld     FAILED   00:00:35      2:0 2024-05-21T10:53:39 2024-05-21T10:54:14
25875147.3     minimize     FAILED   00:01:49      2:0 2024-05-21T10:54:43 2024-05-21T10:56:32
25875147.4     initfoxs  COMPLETED   00:00:08      0:0 2024-05-21T10:56:32 2024-05-21T10:56:40
25875147.5         heat     FAILED   00:00:14      2:0 2024-05-21T10:56:46 2024-05-21T10:57:00
25875147.6          md2     FAILED   00:01:33      2:0 2024-05-21T10:57:13 2024-05-21T10:58:46
25875147.7          md1     FAILED   00:01:29      2:0 2024-05-21T10:57:17 2024-05-21T10:58:46
25875147.8          md3     FAILED   00:02:15      2:0 2024-05-21T10:57:17 2024-05-21T10:59:32
25875147.9          md4     FAILED   00:01:18      2:0 2024-05-21T10:57:28 2024-05-21T10:58:46
25875147.10         md5     FAILED   00:01:30      2:0 2024-05-21T10:57:43 2024-05-21T10:59:13
25875147.11     dcd2pdb     FAILED   00:01:18     20:0 2024-05-21T10:59:32 2024-05-21T11:00:50
25875147.12        foxs  COMPLETED   00:01:12      0:0 2024-05-21T11:00:50 2024-05-21T11:02:02
25875147.13   multifoxs     FAILED   00:00:14      6:0 2024-05-21T11:02:06 2024-05-21T11:02:20
```

I think we may also need sleep between the `pdb2crd` runs...Let's try that again

### Try a `BilboMdPDB` job with `conformational_sampling: 4` and `sleep 10` beween pdb2crd and md sruns

jobid: 25876444 regualar QOS for 00:40:00

It really is a bit annoying that the regular QOS has such long wait times. I think 99% of BilboMD jobs could be run on teh debug queue if teh limit was 1 hour instead of 30 min.

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25876444     bilbomd.s+  COMPLETED   00:22:28      0:0 2024-05-21T11:20:15 2024-05-21T11:42:43
25876444.ba+      batch  COMPLETED   00:22:28      0:0 2024-05-21T11:20:15 2024-05-21T11:42:43
25876444.ex+     extern  COMPLETED   00:22:28      0:0 2024-05-21T11:20:15 2024-05-21T11:42:43
25876444.0      pdb2crd  COMPLETED   00:00:56      0:0 2024-05-21T11:20:22 2024-05-21T11:21:18
25876444.1      pdb2crd  COMPLETED   00:00:09      0:0 2024-05-21T11:20:35 2024-05-21T11:20:44
25876444.2         meld  COMPLETED   00:00:07      0:0 2024-05-21T11:21:19 2024-05-21T11:21:26
25876444.3     minimize  COMPLETED   00:02:08      0:0 2024-05-21T11:21:42 2024-05-21T11:23:50
25876444.4     initfoxs  COMPLETED   00:02:08      0:0 2024-05-21T11:23:50 2024-05-21T11:25:58
25876444.5         heat  COMPLETED   00:00:52      0:0 2024-05-21T11:26:29 2024-05-21T11:27:21
25876444.6          md3  COMPLETED   00:09:19      0:0 2024-05-21T11:27:21 2024-05-21T11:36:40
25876444.7          md2  COMPLETED   00:09:19      0:0 2024-05-21T11:27:21 2024-05-21T11:36:40
25876444.8          md1  COMPLETED   00:11:06      0:0 2024-05-21T11:27:21 2024-05-21T11:38:27
25876444.9          md4  COMPLETED   00:09:07      0:0 2024-05-21T11:27:33 2024-05-21T11:36:40
25876444.10         md5  COMPLETED   00:09:08      0:0 2024-05-21T11:28:11 2024-05-21T11:37:19
25876444.11     dcd2pdb  COMPLETED   00:00:53      0:0 2024-05-21T11:38:27 2024-05-21T11:39:20
25876444.12        foxs  COMPLETED   00:01:52      0:0 2024-05-21T11:39:20 2024-05-21T11:41:12
25876444.13   multifoxs  COMPLETED   00:01:07      0:0 2024-05-21T11:41:36 2024-05-21T11:42:43
```

### Try a `BilboMdAuto` job with `conformational_sampling: 4` and `sleep 10`

jobid: 25878041 regualar QOS for 00:40:00

```shell
JobID           JobName      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- -------- ------------------- -------------------
25878041     bilbomd.s+     FAILED   00:38:38    127:0 2024-05-21T11:45:15 2024-05-21T12:23:53
25878041.ba+      batch     FAILED   00:38:38    127:0 2024-05-21T11:45:15 2024-05-21T12:23:53
25878041.ex+     extern  COMPLETED   00:39:18      0:0 2024-05-21T11:45:15 2024-05-21T12:24:33
25878041.0      pdb2crd  COMPLETED   00:00:34      0:0 2024-05-21T11:46:06 2024-05-21T11:46:40
25878041.1         meld  COMPLETED   00:00:08      0:0 2024-05-21T11:46:49 2024-05-21T11:46:57
25878041.2    pae2const  COMPLETED   00:00:32      0:0 2024-05-21T11:47:06 2024-05-21T11:47:38
25878041.3     minimize  COMPLETED   00:01:10      0:0 2024-05-21T11:47:47 2024-05-21T11:48:57
25878041.4     initfoxs  COMPLETED   00:00:10      0:0 2024-05-21T11:48:58 2024-05-21T11:49:08
25878041.5         heat  COMPLETED   00:02:05      0:0 2024-05-21T11:50:16 2024-05-21T11:52:21
25878041.6          md5  COMPLETED   00:26:55      0:0 2024-05-21T11:52:21 2024-05-21T12:19:16
25878041.7          md2  COMPLETED   00:26:53      0:0 2024-05-21T11:52:23 2024-05-21T12:19:16
25878041.8          md4  COMPLETED   00:26:35      0:0 2024-05-21T11:52:41 2024-05-21T12:19:16
25878041.9          md1  COMPLETED   00:26:35      0:0 2024-05-21T11:52:41 2024-05-21T12:19:16
25878041.10         md3  COMPLETED   00:26:19      0:0 2024-05-21T11:52:42 2024-05-21T12:19:01
25878041.11     dcd2pdb  COMPLETED   00:00:35      0:0 2024-05-21T12:19:16 2024-05-21T12:19:51
25878041.12        foxs  COMPLETED   00:02:30      0:0 2024-05-21T12:19:51 2024-05-21T12:22:21
25878041.13   multifoxs  COMPLETED   00:02:12      0:0 2024-05-21T12:22:21 2024-05-21T12:24:33
```

This worked except for my `msacct` alias caused an error. probably need to add shopt command to honor aliases. Despite teh `sleep 10` commands being added after every parallel `srun` command the Start times are still sometimes concurrent. Maybe an issue with how slurm is keeping track of jobs and giving them timestamps?

### Try a `BilboMdCRD` job with `conformational_sampling: 4` and `sleep 10`

jobid: 25880631 regualar QOS for 00:40:00

```shell
JobID           JobName    Account  AllocCPUS      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- ---------- ---------- -------- ------------------- -------------------
25880631     bilbomd.s+    m4659_g        128     FAILED   00:28:56      1:0 2024-05-21T12:34:19 2024-05-21T13:03:15
25880631.ba+      batch    m4659_g        128     FAILED   00:28:56      1:0 2024-05-21T12:34:19 2024-05-21T13:03:15
25880631.ex+     extern    m4659_g        128  COMPLETED   00:30:28      0:0 2024-05-21T12:34:19 2024-05-21T13:04:47
25880631.0     minimize    m4659_g        120  COMPLETED   00:00:41      0:0 2024-05-21T12:34:36 2024-05-21T12:35:17
25880631.1     initfoxs    m4659_g        120  COMPLETED   00:00:32      0:0 2024-05-21T12:35:20 2024-05-21T12:35:52
25880631.2         heat    m4659_g        120  COMPLETED   00:01:29      0:0 2024-05-21T12:35:52 2024-05-21T12:37:21
25880631.3          md1    m4659_g         24  COMPLETED   00:20:26      0:0 2024-05-21T12:37:21 2024-05-21T12:57:47
25880631.4          md2    m4659_g         24  COMPLETED   00:18:46      0:0 2024-05-21T12:37:21 2024-05-21T12:56:07
25880631.5          md3    m4659_g         24  COMPLETED   00:19:55      0:0 2024-05-21T12:37:21 2024-05-21T12:57:16
25880631.6          md4    m4659_g         24  COMPLETED   00:18:15      0:0 2024-05-21T12:37:51 2024-05-21T12:56:06
25880631.7          md5    m4659_g         24  COMPLETED   00:18:43      0:0 2024-05-21T12:38:15 2024-05-21T12:56:58
25880631.8      dcd2pdb    m4659_g        120  COMPLETED   00:00:15      0:0 2024-05-21T12:57:47 2024-05-21T12:58:02
25880631.9         foxs    m4659_g        120  COMPLETED   00:02:53      0:0 2024-05-21T12:58:37 2024-05-21T13:01:30
25880631.10   multifoxs    m4659_g        120  COMPLETED   00:02:24      0:0 2024-05-21T13:01:42 2024-05-21T13:04:06
```

Failed because %j is not how you are supposed to get the job ID within the Slurm batch file. Lets try `$SLURM_JOB_ID`

### Lets also try another Auto job with some different inputs

This is the gln4 test files from Michal

jobid: 25882816 regualar QOS for 00:40:00

```shell
JobID           JobName    Account  AllocCPUS      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- ---------- ---------- -------- ------------------- -------------------
25882816     bilbomd.s+    m4659_g        128    RUNNING   00:08:40      0:0 2024-05-21T13:25:19             Unknown
25882816.ba+      batch    m4659_g        128    RUNNING   00:08:40      0:0 2024-05-21T13:25:19             Unknown
25882816.ex+     extern    m4659_g        128    RUNNING   00:08:40      0:0 2024-05-21T13:25:19             Unknown
25882816.0      pdb2crd    m4659_g        120  COMPLETED   00:00:19      0:0 2024-05-21T13:25:28 2024-05-21T13:25:47
25882816.1         meld    m4659_g        120  COMPLETED   00:00:31      0:0 2024-05-21T13:26:02 2024-05-21T13:26:33
25882816.2    pae2const    m4659_g        120  COMPLETED   00:01:04      0:0 2024-05-21T13:26:33 2024-05-21T13:27:37
25882816.3     minimize    m4659_g        120  COMPLETED   00:02:47      0:0 2024-05-21T13:28:03 2024-05-21T13:30:50
25882816.4     initfoxs    m4659_g        120  COMPLETED   00:00:20      0:0 2024-05-21T13:30:56 2024-05-21T13:31:16
25882816.5         heat    m4659_g        120  COMPLETED   00:01:25      0:0 2024-05-21T13:31:16 2024-05-21T13:32:41
25882816.6          md1    m4659_g         24    RUNNING   00:01:18      0:0 2024-05-21T13:32:41             Unknown
25882816.7          md2    m4659_g         24    RUNNING   00:01:18      0:0 2024-05-21T13:32:41             Unknown
25882816.8          md3    m4659_g         24    RUNNING   00:01:02      0:0 2024-05-21T13:32:57             Unknown
25882816.9          md4    m4659_g         24    RUNNING   00:00:48      0:0 2024-05-21T13:33:11             Unknown
25882816.10         md5    m4659_g         24    RUNNING   00:00:13      0:0 2024-05-21T13:33:46             Unknown
```

weird start times....

```shell
JobID           JobName    Account  AllocCPUS      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- ---------- ---------- -------- ------------------- -------------------
25882816     bilbomd.s+    m4659_g        128  COMPLETED   00:32:54      0:0 2024-05-21T13:25:19 2024-05-21T13:58:13
25882816.ba+      batch    m4659_g        128  COMPLETED   00:32:54      0:0 2024-05-21T13:25:19 2024-05-21T13:58:13
25882816.ex+     extern    m4659_g        128  COMPLETED   00:33:03      0:0 2024-05-21T13:25:19 2024-05-21T13:58:22
25882816.0      pdb2crd    m4659_g        120  COMPLETED   00:00:19      0:0 2024-05-21T13:25:28 2024-05-21T13:25:47
25882816.1         meld    m4659_g        120  COMPLETED   00:00:31      0:0 2024-05-21T13:26:02 2024-05-21T13:26:33
25882816.2    pae2const    m4659_g        120  COMPLETED   00:01:04      0:0 2024-05-21T13:26:33 2024-05-21T13:27:37
25882816.3     minimize    m4659_g        120  COMPLETED   00:02:47      0:0 2024-05-21T13:28:03 2024-05-21T13:30:50
25882816.4     initfoxs    m4659_g        120  COMPLETED   00:00:20      0:0 2024-05-21T13:30:56 2024-05-21T13:31:16
25882816.5         heat    m4659_g        120  COMPLETED   00:01:25      0:0 2024-05-21T13:31:16 2024-05-21T13:32:41
25882816.6          md1    m4659_g         24  COMPLETED   00:20:50      0:0 2024-05-21T13:32:41 2024-05-21T13:53:31
25882816.7          md2    m4659_g         24  COMPLETED   00:20:50      0:0 2024-05-21T13:32:41 2024-05-21T13:53:31
25882816.8          md3    m4659_g         24  COMPLETED   00:20:34      0:0 2024-05-21T13:32:57 2024-05-21T13:53:31
25882816.9          md4    m4659_g         24  COMPLETED   00:20:22      0:0 2024-05-21T13:33:11 2024-05-21T13:53:33
25882816.10         md5    m4659_g         24  COMPLETED   00:20:37      0:0 2024-05-21T13:33:46 2024-05-21T13:54:23
25882816.11     dcd2pdb    m4659_g        120  COMPLETED   00:00:37      0:0 2024-05-21T13:54:23 2024-05-21T13:55:00
25882816.12        foxs    m4659_g        120  COMPLETED   00:02:30      0:0 2024-05-21T13:55:00 2024-05-21T13:57:30
25882816.13   multifoxs    m4659_g        120  COMPLETED   00:01:00      0:0 2024-05-21T13:57:30 2024-05-21T13:58:30
```

### `BilboMDAuto` gln4 test conf=4

jobid: 25884937 regular QOS 00:40:00

```shell
JobID           JobName    Account  AllocCPUS      State    Elapsed ExitCode               Start                 End
------------ ---------- ---------- ---------- ---------- ---------- -------- ------------------- -------------------
25884937     bilbomd.s+    m4659_g        128    TIMEOUT   00:40:16      0:0 2024-05-21T14:21:51 2024-05-21T15:02:07
25884937.ba+      batch    m4659_g        128  CANCELLED   00:40:20     0:15 2024-05-21T14:21:51 2024-05-21T15:02:11
25884937.ex+     extern    m4659_g        128  COMPLETED   00:40:46      0:0 2024-05-21T14:21:51 2024-05-21T15:02:37
25884937.0      pdb2crd    m4659_g        120  COMPLETED   00:00:49      0:0 2024-05-21T14:22:09 2024-05-21T14:22:58
25884937.1         meld    m4659_g        120  COMPLETED   00:00:18      0:0 2024-05-21T14:22:58 2024-05-21T14:23:16
25884937.2    pae2const    m4659_g        120  COMPLETED   00:00:19      0:0 2024-05-21T14:23:16 2024-05-21T14:23:35
25884937.3     minimize    m4659_g        120  COMPLETED   00:02:05      0:0 2024-05-21T14:23:56 2024-05-21T14:26:01
25884937.4     initfoxs    m4659_g        120  COMPLETED   00:00:33      0:0 2024-05-21T14:26:21 2024-05-21T14:26:54
25884937.5         heat    m4659_g        120  COMPLETED   00:01:37      0:0 2024-05-21T14:26:54 2024-05-21T14:28:31
25884937.6          md1    m4659_g         24  COMPLETED   00:28:14      0:0 2024-05-21T14:28:31 2024-05-21T14:56:45
25884937.7          md2    m4659_g         24  COMPLETED   00:28:36      0:0 2024-05-21T14:28:31 2024-05-21T14:57:07
25884937.8          md3    m4659_g         24  COMPLETED   00:28:20      0:0 2024-05-21T14:28:31 2024-05-21T14:56:51
25884937.9          md4    m4659_g         24  COMPLETED   00:28:01      0:0 2024-05-21T14:28:39 2024-05-21T14:56:40
25884937.10         md5    m4659_g         24  COMPLETED   00:27:14      0:0 2024-05-21T14:28:54 2024-05-21T14:56:08
25884937.11     dcd2pdb    m4659_g        120  COMPLETED   00:00:20      0:0 2024-05-21T14:57:41 2024-05-21T14:58:01
25884937.12        foxs    m4659_g        120  COMPLETED   00:03:51      0:0 2024-05-21T14:58:02 2024-05-21T15:01:53
```
