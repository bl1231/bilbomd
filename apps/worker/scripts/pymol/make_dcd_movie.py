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

import yaml

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
    # p.add_argument(
    #     "--fov",
    #     type=float,
    #     default=20.0,
    #     help="Field of view in degrees (default: 20.0)",
    # )
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
    p.add_argument(
        "--pingpong",
        action="store_true",
        help="Create ping-pong effect (play forward then backward continuously)",
    )
    p.add_argument(
        "--config",
        help="YAML config file for domain coloring (e.g., openmm_config.yaml)",
    )
    p.add_argument(
        "--color-scheme",
        default="default",
        choices=["default", "constraints", "custom"],
        help="Coloring scheme: 'default' (bychain/spectrum), 'constraints' (based on config), 'custom' (user-defined)",
    )
    return p.parse_args()


def _parse_constraints_config(config_path: str):
    """
    Parse the YAML config file and extract constraint information.
    Returns a dict with 'fixed_bodies' and 'rigid_bodies' lists.
    """
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)

        constraints = config.get("constraints", {})
        fixed_bodies = constraints.get("fixed_bodies", [])
        rigid_bodies = constraints.get("rigid_bodies", [])

        print(
            f"[config] Found {len(fixed_bodies)} fixed bodies and {len(rigid_bodies)} rigid bodies"
        )
        return {"fixed_bodies": fixed_bodies, "rigid_bodies": rigid_bodies}
    except Exception as e:
        print(f"[config] Error parsing config file: {e}")
        return {"fixed_bodies": [], "rigid_bodies": []}


def _apply_constraint_coloring(obj_name: str, constraints_config: dict):
    """
    Apply coloring based on constraints configuration.
    """
    print("[coloring] Applying constraint-based coloring scheme")

    # Default color for unconstrained regions
    cmd.color("bluewhite", obj_name)

    # Color fixed bodies (darker blue)
    for fixed_body in constraints_config["fixed_bodies"]:
        name = fixed_body.get("name", "UnnamedFixedBody")
        segments = fixed_body.get("segments", [])

        # Build selection string for all segments in this fixed body
        segment_selections = []
        for segment in segments:
            chain_id = segment.get("chain_id", "A")
            residues = segment.get("residues", {})
            start_res = residues.get("start")
            stop_res = residues.get("stop")

            if start_res is not None and stop_res is not None:
                segment_selection = f"chain {chain_id} and resi {start_res}-{stop_res}"
                segment_selections.append(segment_selection)
                print(
                    f"[coloring] {name}: chain {chain_id} residues {start_res}-{stop_res}"
                )

        # Apply coloring to all segments of this fixed body
        if segment_selections:
            full_selection = " or ".join([f"({sel})" for sel in segment_selections])
            cmd.color("tv_blue", f"({obj_name}) and ({full_selection})")
            print(f"[coloring] {name} -> blue")

    # Color rigid bodies (orange)
    for rigid_body in constraints_config["rigid_bodies"]:
        name = rigid_body.get("name", "UnnamedRigidBody")
        segments = rigid_body.get("segments", [])

        # Build selection string for all segments in this rigid body
        segment_selections = []
        for segment in segments:
            chain_id = segment.get("chain_id", "A")
            residues = segment.get("residues", {})
            start_res = residues.get("start")
            stop_res = residues.get("stop")

            if start_res is not None and stop_res is not None:
                segment_selection = f"chain {chain_id} and resi {start_res}-{stop_res}"
                segment_selections.append(segment_selection)
                print(
                    f"[coloring] {name}: chain {chain_id} residues {start_res}-{stop_res}"
                )

        # Apply coloring to all segments of this rigid body
        if segment_selections:
            full_selection = " or ".join([f"({sel})" for sel in segment_selections])
            cmd.color("orange", f"({obj_name}) and ({full_selection})")
            print(f"[coloring] {name} -> orange")


def _apply_coloring_scheme(obj_name: str, args, constraints_config=None):
    """
    Apply the requested coloring scheme to the object.
    """
    if args.color_scheme == "constraints" and constraints_config:
        _apply_constraint_coloring(obj_name, constraints_config)
    elif args.color_scheme == "custom":
        # You can extend this for user-defined coloring schemes
        print("[coloring] Custom coloring not implemented yet, using default")
        _apply_default_coloring(obj_name)
    else:
        # Default coloring
        _apply_default_coloring(obj_name)


def _apply_default_coloring(obj_name: str):
    """
    Apply default coloring (bychain or spectrum).
    """
    print("[coloring] Applying default coloring scheme")
    try:
        cmd.color("bychain", obj_name)
        print("[coloring] Applied bychain coloring")
    except Exception:
        cmd.spectrum("count", "rainbow", obj_name)
        print("[coloring] Applied spectrum coloring")


def main():
    args = parse_args()
    pdb, dcd, outmovie = args.pdb, args.dcd, args.out
    width, height = args.width, args.height
    fps, crf = args.fps, args.crf
    stride = max(1, args.stride)

    # Parse constraints config if provided
    constraints_config = None
    if args.config and os.path.exists(args.config):
        constraints_config = _parse_constraints_config(args.config)
    elif args.config:
        print(f"[config] Warning: Config file not found: {args.config}")

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
        # print(f"[orient] Setting field_of_view to {args.fov} degrees")
        # cmd.set("field_of_view", float(args.fov))

        # Compute aggregate extent across the trajectory to choose a good zoom and clip
        mn, mx = _aggregate_extent(obj_name, nstates, step=max(1, stride * 5))
        span = [mx[i] - mn[i] for i in range(3)]
        max_span = max(span)
        # center = [(mn[i] + mx[i]) / 2.0 for i in range(3)]  # computed but not used

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

    def _create_pingpong_frames(frames_dir: str) -> str:
        """
        Create a ping-pong effect by duplicating frames in reverse order.
        Returns the new frames directory with ping-pong frames.
        """
        pingpong_dir = frames_dir + "_pingpong"
        os.makedirs(pingpong_dir, exist_ok=True)

        # Get all frame files in order
        frame_files = sorted([f for f in os.listdir(frames_dir) if f.endswith(".png")])

        if not frame_files:
            return frames_dir

        print(f"[pingpong] Creating ping-pong effect with {len(frame_files)} frames")

        # Copy forward frames
        for i, frame_file in enumerate(frame_files):
            src = os.path.join(frames_dir, frame_file)
            dst = os.path.join(pingpong_dir, f"frame_{i + 1:05d}.png")
            shutil.copy2(src, dst)

        # Copy reverse frames (excluding first and last to avoid duplication)
        reverse_frames = frame_files[1:-1]  # Skip first and last frame
        reverse_frames.reverse()

        for i, frame_file in enumerate(reverse_frames):
            src = os.path.join(frames_dir, frame_file)
            dst = os.path.join(
                pingpong_dir, f"frame_{len(frame_files) + i + 1:05d}.png"
            )
            shutil.copy2(src, dst)

        total_frames = len(frame_files) + len(reverse_frames)
        print(f"[pingpong] Created {total_frames} total frames (forward + reverse)")

        return pingpong_dir

    # Debug: Check if input files exist
    print(f"[debug] PDB file: {pdb} (exists: {os.path.exists(pdb)})")
    print(f"[debug] DCD file: {dcd} (exists: {os.path.exists(dcd)})")

    # temp dir for frames (under same parent as output for easier volume mounts)
    out_dir = os.path.dirname(os.path.abspath(outmovie)) or os.getcwd()
    frames_dir = tempfile.mkdtemp(prefix="pymol_frames_", dir=out_dir)
    print(f"[debug] Frames directory: {frames_dir}")

    try:
        # --- PyMOL scene setup ---
        print("[debug] Setting up PyMOL scene in the style of David Goodsell...")
        cmd.reinitialize()

        # load pdb
        print("[debug] Loading PDB...")
        cmd.load(pdb, "mol")
        # cmd.bg_color("black")
        # cmd.set("orthoscopic", 1)
        # cmd.set("antialias", 2)
        # cmd.set("specular", 0.25)
        # cmd.set("ambient", 0.3)
        # cmd.set("ray_opaque_background", 1)
        # if args.ray:
        #     cmd.set("ray_trace_frames", 1)

        # David Goodsell style settings
        # Background settings (flat look)
        cmd.bg_color("white")
        cmd.set("ambient", 1.0)
        cmd.set("specular", 0.0)
        cmd.set("direct", 0.0)
        cmd.set("shininess", 0.0)
        cmd.set("ray_shadows", 0)
        cmd.set("depth_cue", 0)
        cmd.set("antialias", 2)

        # Frame-tracking outline: use PyMOL's toon-style ray edges when ray-tracing
        # This draws object-space silhouettes every frame and follows the trajectory.
        if args.ray:
            cmd.set("ray_trace_mode", 1)  # toon/edge outlines during ray
            cmd.set("ray_shadows", 0)  # keep the flat Goodsell look

        # load dcd trajectory
        print("[debug] Loading DCD...")
        cmd.load_traj(dcd, "mol")

        # style
        print("[debug] Setting up visualization...")
        cmd.hide("everything", "mol")
        cmd.show("cartoon", "mol")

        # apply coloring scheme
        _apply_coloring_scheme("mol", args, constraints_config)

        # automatic orientation / zoom / clipping based on options
        nstates = int(cmd.count_states("mol"))
        print(f"[debug] Number of states detected: {nstates}")
        if nstates == 0:
            raise SystemExit(
                "No trajectory frames detected. Is the DCD aligned to the PDB?"
            )

        _auto_orient_and_zoom("mol", nstates)

        # Supersampling for antialiasing
        supersample_scale = 2.0
        render_width = int(width * supersample_scale)
        render_height = int(height * supersample_scale)
        print(
            f"[render] Supersampling 2x -> render size {render_width}x{render_height}"
        )

        # render frames
        print(f"[pymol] rendering {nstates} frames (stride={stride}) to {frames_dir}")
        frame_idx = 0
        total_frames = len(range(1, nstates + 1, stride))
        for state in range(1, nstates + 1, stride):
            cmd.frame(state)
            frame_idx += 1
            outpng = os.path.join(frames_dir, f"frame_{frame_idx:05d}.png")
            cmd.png(
                outpng,
                width=render_width,
                height=render_height,
                ray=1 if args.ray else 0,
            )

            # Progress update every 10 frames
            if frame_idx % 10 == 0 or frame_idx == total_frames:
                progress_pct = (frame_idx / total_frames) * 100
                print(
                    f"[progress] Rendered {frame_idx}/{total_frames} frames ({progress_pct:.1f}%)"
                )

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

        # Optionally create ping-pong effect
        if args.pingpong:
            final_frames_dir = _create_pingpong_frames(frames_dir)
        else:
            final_frames_dir = frames_dir

        # encode with ffmpeg
        os.makedirs(os.path.dirname(os.path.abspath(outmovie)), exist_ok=True)
        scale_filter = f"scale={width}:{height}"
        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-framerate",
            str(fps),
            "-i",
            os.path.join(final_frames_dir, "frame_%05d.png"),
            "-vf",
            scale_filter,
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
            if args.pingpong and os.path.exists(frames_dir + "_pingpong"):
                print(f"[cleanup] keeping ping-pong frames in {frames_dir}_pingpong")
        else:
            shutil.rmtree(frames_dir, ignore_errors=True)
            print(f"[cleanup] removed {frames_dir}")
            if args.pingpong and os.path.exists(frames_dir + "_pingpong"):
                shutil.rmtree(frames_dir + "_pingpong", ignore_errors=True)
                print(f"[cleanup] removed {frames_dir}_pingpong")

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
