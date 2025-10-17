#!/usr/bin/env python3
"""
Make a simple trajectory movie from PDB + DCD using headless PyMOL.

Run with:
  pymol -cqr make_dcd_movie.py -- --pdb model.pdb --dcd traj.dcd --out movie.mp4
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

# IMPORTANT: this script is meant to be executed by PyMOL:
#   pymol -cqr make_dcd_movie.py -- [ARGS...]
from pymol import cmd  # type: ignore

print("[SCRIPT START] make_dcd_movie.py is being executed")
print(f"[SCRIPT START] Python version: {sys.version}")
print(f"[SCRIPT START] Arguments: {sys.argv}")


def parse_args():
    p = argparse.ArgumentParser(
        description="Render a trajectory movie from PDB+DCD using PyMOL."
    )
    p.add_argument("--pdb", required=True, help="Topology PDB file")
    p.add_argument("--dcd", required=True, help="Trajectory DCD file")
    p.add_argument(
        "--out", default="movie.mp4", help="Output MP4 path (default: movie.mp4)"
    )
    p.add_argument(
        "--stride", type=int, default=1, help="Frame stride when rendering (default: 1)"
    )
    p.add_argument(
        "--width", type=int, default=1280, help="Frame width (default: 1280)"
    )
    p.add_argument(
        "--height", type=int, default=720, help="Frame height (default: 720)"
    )
    p.add_argument(
        "--fps", type=int, default=30, help="Video frames per second (default: 30)"
    )
    p.add_argument(
        "--crf",
        type=int,
        default=22,
        help="x264 CRF quality (lower=better, default: 22)",
    )
    p.add_argument(
        "--ray",
        action="store_true",
        help="Enable ray tracing for each frame (slower, nicer)",
    )
    p.add_argument(
        "--keep-frames",
        action="store_true",
        help="Do not delete PNG frames after encoding",
    )
    p.add_argument(
        "--align-ca",
        action="store_true",
        help="Align all trajectory states to state 1 using CA atoms (removes drift)",
    )
    p.add_argument(
        "--fov",
        type=float,
        default=20.0,
        help="Field of view in degrees (default: 20.0)",
    )
    p.add_argument(
        "--orient",
        choices=["principal", "none"],
        default="principal",
        help="Automatic orientation. 'principal' uses principal axes; 'none' leaves as-is (default: principal)",
    )
    p.add_argument(
        "--zoom-buffer",
        type=float,
        default=2.0,
        help="Extra Å to add around the molecule when auto-zooming (default: 2.0 Å)",
    )
    p.add_argument(
        "--viewport",
        action="store_true",
        help="Set PyMOL viewport to match --width/--height (useful for ray-tracing)",
    )
    p.add_argument(
        "--clip",
        action="store_true",
        help="Auto set slab clipping to object span to maximize on-screen occupancy",
    )
    return p.parse_args()


def main():
    args = parse_args()
    pdb, dcd, outmovie = args.pdb, args.dcd, args.out
    width, height = args.width, args.height
    fps, crf = args.fps, args.crf
    stride = max(1, args.stride)

    def _aggregate_extent(obj_name: str, nstates: int, step: int = 10):
        """
        Compute an aggregate bounding box across trajectory states.
        Uses every `step`-th state for speed.
        Returns (min_xyz, max_xyz).
        """
        import math

        first = True
        min_xyz = [math.inf, math.inf, math.inf]
        max_xyz = [-math.inf, -math.inf, -math.inf]
        for state in range(1, nstates + 1, max(1, step)):
            cmd.frame(state)
            mn, mx = cmd.get_extent(obj_name)
            if mn is None or mx is None:
                continue
            for i in range(3):
                if mn[i] < min_xyz[i]:
                    min_xyz[i] = mn[i]
                if mx[i] > max_xyz[i]:
                    max_xyz[i] = mx[i]
            first = False
        if first:
            # fallback to current state only
            mn, mx = cmd.get_extent(obj_name)
            return mn, mx
        return tuple(min_xyz), tuple(max_xyz)

    def _auto_orient_and_zoom(obj_name: str, nstates: int):
        """
        Optionally align frames, orient, set FOV, auto-zoom, and optional clipping.
        """
        # Optional alignment to remove drift
        if args.align_ca:
            print("[orient] Aligning all states to state 1 using CA atoms (intra_fit)")
            try:
                # Align each state to state 1 using CA atoms
                cmd.intra_fit(f"{obj_name} and name CA", 1, 1)
            except Exception as e:
                print(f"[orient] intra_fit failed: {e}")

        # Principal-axes orientation on the current coordinates
        if args.orient == "principal":
            print("[orient] Applying principal-axes orientation (cmd.orient)")
            cmd.orient(obj_name)

        # Match viewport to output size if requested
        if args.viewport:
            print(f"[orient] Setting viewport to {width}x{height}")
            cmd.viewport(width, height)

        # Field of view
        print(f"[orient] Setting field_of_view to {args.fov} degrees")
        cmd.set("field_of_view", float(args.fov))

        # Compute aggregate extent across the trajectory to choose a good zoom and clip
        mn, mx = _aggregate_extent(obj_name, nstates, step=max(1, stride * 5))
        span = [mx[i] - mn[i] for i in range(3)]
        max_span = max(span)
        center = [(mn[i] + mx[i]) / 2.0 for i in range(3)]

        # Center and zoom with a small buffer
        cmd.center(obj_name)
        buffer = float(args.zoom_buffer)
        print(
            f"[orient] Auto-zoom with buffer {buffer} Å (max span ≈ {max_span:.2f} Å)"
        )
        try:
            cmd.zoom(obj_name, buffer)
        except Exception:
            # Fallback: slab-based zoom
            pass

        # Optional clipping slab approximately to object span
        if args.clip:
            slab = max_span + 2.0 * buffer
            print(f"[orient] Setting clip slab to ~{slab:.2f} Å")
            try:
                cmd.clip("slab", slab)
            except Exception as e:
                print(f"[orient] clip slab failed: {e}")

    # Debug: Check if input files exist
    print(f"[debug] PDB file: {pdb} (exists: {os.path.exists(pdb)})")
    print(f"[debug] DCD file: {dcd} (exists: {os.path.exists(dcd)})")

    # temp dir for frames (under same parent as output for easier volume mounts)
    out_dir = os.path.dirname(os.path.abspath(outmovie)) or os.getcwd()
    frames_dir = tempfile.mkdtemp(prefix="pymol_frames_", dir=out_dir)
    print(f"[debug] Frames directory: {frames_dir}")

    try:
        # --- PyMOL scene setup ---
        print("[debug] Setting up PyMOL scene...")
        cmd.reinitialize()
        cmd.bg_color("white")
        cmd.set("orthoscopic", 1)
        cmd.set("antialias", 2)
        cmd.set("specular", 0.25)
        cmd.set("ambient", 0.5)
        cmd.set("ray_opaque_background", 1)
        if args.ray:
            cmd.set("ray_trace_mode", 1)

        # load data
        print("[debug] Loading PDB...")
        cmd.load(pdb, "mol")
        print("[debug] Loading DCD...")
        # interval=stride here would *skip loading* frames; we prefer to load all and stride on render
        cmd.load_traj(dcd, "mol")

        # style
        print("[debug] Setting up visualization...")
        cmd.hide("everything", "mol")
        cmd.show("cartoon", "mol")
        # color each chain differently; fall back to spectrum if single chain
        try:
            cmd.color("bychain", "mol")
        except Exception:
            cmd.spectrum("count", "rainbow", "mol")

        # automatic orientation / zoom / clipping based on options
        nstates = int(cmd.count_states("mol"))
        print(f"[debug] Number of states detected: {nstates}")
        if nstates == 0:
            raise SystemExit(
                "No trajectory frames detected. Is the DCD aligned to the PDB?"
            )

        _auto_orient_and_zoom("mol", nstates)

        # render frames
        print(f"[pymol] rendering {nstates} frames (stride={stride}) to {frames_dir}")
        frame_idx = 0
        for state in range(1, nstates + 1, stride):
            cmd.frame(state)
            frame_idx += 1
            outpng = os.path.join(frames_dir, f"frame_{frame_idx:05d}.png")
            print(f"[debug] Rendering frame {frame_idx} (state {state}) -> {outpng}")
            cmd.png(outpng, width=width, height=height, ray=1 if args.ray else 0)

            # Check if PNG was actually created
            if os.path.exists(outpng):
                print(
                    f"[debug] Frame {frame_idx} created successfully ({os.path.getsize(outpng)} bytes)"
                )
            else:
                print(f"[debug] WARNING: Frame {frame_idx} was not created!")

        # Check if we have any frames before encoding
        frame_files = [f for f in os.listdir(frames_dir) if f.endswith(".png")]
        print(f"[debug] Found {len(frame_files)} PNG files in {frames_dir}")

        if not frame_files:
            print(
                "ERROR: No PNG frames were created. Check PyMOL rendering.",
                file=sys.stderr,
            )
            return

        # Check if ffmpeg is available
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
            print("[debug] ffmpeg is available")
        except (subprocess.CalledProcessError, FileNotFoundError):
            print(
                "ERROR: ffmpeg not found in PATH. Install it in the container.",
                file=sys.stderr,
            )
            return

        # encode with ffmpeg
        os.makedirs(os.path.dirname(os.path.abspath(outmovie)), exist_ok=True)
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-i",
            os.path.join(frames_dir, "frame_%05d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "slow",
            "-crf",
            str(crf),
            "-movflags",
            "+faststart",
            outmovie,
        ]
        print("[ffmpeg] encoding:", " ".join(ffmpeg_cmd))

        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(
                f"ERROR: ffmpeg failed with return code {result.returncode}",
                file=sys.stderr,
            )
            print(f"STDOUT: {result.stdout}", file=sys.stderr)
            print(f"STDERR: {result.stderr}", file=sys.stderr)
            return
        else:
            print("[debug] ffmpeg completed successfully")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        return

    finally:
        # cleanup
        if args.keep_frames:
            print(f"[cleanup] keeping frames in {frames_dir}")
        else:
            shutil.rmtree(frames_dir, ignore_errors=True)
            print(f"[cleanup] removed {frames_dir}")

    # Check if output file was created
    if os.path.exists(outmovie):
        file_size = os.path.getsize(outmovie)
        print(
            f"[done] wrote {outmovie} ({width}x{height} @ {fps}fps, CRF {crf}) - {file_size} bytes"
        )
    else:
        print(f"ERROR: Output file {outmovie} was not created!", file=sys.stderr)


if __name__ == "__main__":
    main()
