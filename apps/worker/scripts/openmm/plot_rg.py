#!/usr/bin/env python
"""
Quick script to plot Rg convergence from MD simulations.

Usage:
    python plot_rg.py md/rg_32/rgyr.csv --target 3.2
    python plot_rg.py md/rg_*/rgyr.csv  # Plot all Rg trajectories
"""

import sys
import argparse
from pathlib import Path
from utils.rgyr import plot_rg_convergence


def main():
    parser = argparse.ArgumentParser(description='Plot Rg convergence from rgyr.csv files')
    parser.add_argument('csv_files', nargs='+', help='Path to rgyr.csv file(s)')
    parser.add_argument('--target', type=float, help='Target Rg value in nm (optional)')
    parser.add_argument('--output', '-o', help='Output file path (optional, auto-generated if not provided)')

    args = parser.parse_args()

    # Process each CSV file
    for csv_file in args.csv_files:
        csv_path = Path(csv_file)

        if not csv_path.exists():
            print(f"Warning: File not found: {csv_file}")
            continue

        print(f"\nProcessing: {csv_file}")

        # Determine output filename
        if args.output:
            output = args.output
        else:
            output = str(csv_path.with_suffix('.png'))

        # Plot
        plot_rg_convergence(str(csv_path), target_rg_nm=args.target, output_file=output)


if __name__ == '__main__':
    main()
