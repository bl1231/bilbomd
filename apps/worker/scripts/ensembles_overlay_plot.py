"""
ensemble_overlay_plot.py

Plots Rgyr vs. Dmax with top complexes overlayed on the scatter plot.
"""

import os
import json
import re
import numpy as np
import matplotlib.pyplot as plt
import argparse


def load_json_data(json_file):
    """Load data from a JSON file."""
    with open(json_file, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_rgyr_dmax(data):
    """Extract rgyr and dmax values from the data."""
    rgyr = [item["rgyr"] for item in data]
    dmax = [item["dmax"] for item in data]
    return rgyr, dmax


def get_ensemble_files(ensembles_dir):
    """Get sorted list of ensemble files from the directory."""
    return sorted(
        [
            f
            for f in os.listdir(ensembles_dir)
            if f.startswith("ensembles_size_") and f.endswith(".txt")
        ]
    )


def process_ensemble_file(ensemble_path, N, data, color):
    """Process the ensemble file and plot the top complex."""
    with open(ensemble_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Extract the chi2 value from the first line
    first_line_matches = re.search(r'\|\s*([\d.]+)', lines[0])
    if first_line_matches:
        chi2_value = float(first_line_matches.group(1))
        print(f"Chi2 value extracted: {chi2_value}")
    else:
        chi2_value = None
        print("No chi2 value found in the first line.")

    # Extract PDBs from the top complex lines (N lines starting from line 2)
    for i in range(1, N + 1):
        line = lines[i]
        matches = re.findall(r'\|\s*([\d.]+)\s*\(.*?\)\s*\|\s*../foxs/rg\d+_run\d+/(\w+)', line)
        print(f"Matches: {matches}")
        # Plot each PDB in the top complex with a distinct color and scaled by the ratio
        for ratio, pdb_prefix in matches:
            print(f"Processing PDB: {pdb_prefix} with ratio: {ratio}")
            for item in data:
                if item["pdb"].lower().startswith(pdb_prefix.lower()):
                    # Convert the ratio to a float and scale the point size
                    point_size = float(ratio) * 200
                    plt.scatter(
                        item["rgyr"],
                        item["dmax"],
                        s=point_size,
                        label=f"Best {N}-state model (chi2={chi2_value}, {float(ratio) * 100:.2f}%)",
                        color=color,
                    )


def get_rg_from_job_json(results_dir):
    """Retrieve the 'rg' value from the bilbomd_job.json file."""
    job_json_path = os.path.join(results_dir, "bilbomd_job.json")
    try:
        with open(job_json_path, "r", encoding="utf-8") as f:
            job_data = json.load(f)
            rg = job_data.get("rg", None)  # Default to None if 'rg' is not found
            if rg is not None:
                print(f"Experimental SAXS Rgyr value loaded: {rg} Å")
            else:
                print("Rgyr value not found in bilbomd_job.json, using default.")
            return rg
    except FileNotFoundError:
        print("bilbomd_job.json not found, using default Rgyr value.")
        return None


def plot_rgyr_vs_dmax(uuid):
    """Create a scatter plot of Rgyr vs Dmax."""
    # Define paths based on the UUID
    base_dir = f"test/parsing/{uuid}/multifoxs/"
    json_file = os.path.join(base_dir, "consolidated_rgyr_dmax_data.json")
    ensembles_dir = base_dir

    # Define the results directory and create it if it doesn't exist
    results_dir = f"test/parsing/{uuid}/results/"
    os.makedirs(results_dir, exist_ok=True)

    # Load the data from the JSON file
    data = load_json_data(json_file)

    # Extract rgyr and dmax values for the scatter plot
    rgyr, dmax = extract_rgyr_dmax(data)

    # Plot the initial scatter plot from JSON data
    plt.figure(figsize=(10, 6))
    plt.scatter(rgyr, dmax, s=2, label="All MD trajectory PDBs", alpha=0.4, color="grey")

    # Get and process ensemble files
    ensemble_files = get_ensemble_files(ensembles_dir)
    colors = plt.get_cmap('turbo')(np.linspace(0, 1, len(ensemble_files)))

    for idx, ensemble_file in enumerate(ensemble_files):
        ensemble_path = os.path.join(ensembles_dir, ensemble_file)
        print(f"Processing ensemble file: {ensemble_path}")

        # Extract N from the filename
        match = re.search(r"ensemble[s]?_size_(\d+)\.txt", ensemble_file)
        if not match:
            print(f"Skipping file: {ensemble_file}")
            continue
        N = int(match.group(1))

        # Process the ensemble file
        process_ensemble_file(ensemble_path, N, data, colors[idx])

    # Retrieve the Rgyr value from bilbomd_job.json or use default if unavailable
    rg = get_rg_from_job_json(results_dir)
    if rg is None:
        rg = 0.0  # Default Rgyr if not found in bilbomd_job.json

    plt.axvline(x=rg, color="blue", linestyle="--", linewidth=1.5, label=f"Experimental SAXS Rgyr={rg}Å")
    plt.xlabel("Rgyr (Å)")
    plt.ylabel("Dmax (Å)")
    plt.title("Rgyr vs. Dmax with Best N-sate models")
    plt.legend(loc="lower right")
    plt.tight_layout()

    # Save the plot as a PNG file in the results directory
    output_file = os.path.join(results_dir, "rgyr_vs_dmax_plot.png")
    plt.savefig(output_file, dpi=300)
    plt.close()
    print(f"Plot saved as {output_file}")


def main():
    """Main function to handle command-line arguments and run the script."""
    parser = argparse.ArgumentParser(
        description="Plot Rgyr vs. Dmax with top complexes."
    )
    parser.add_argument(
        "--uuid",
        type=str,
        default="569f96b3-8d28-4c75-b506-d6d79975ede0",
        help="UUID for the directory structure (default: 569f96b3-8d28-4c75-b506-d6d79975ede0)",
    )

    args = parser.parse_args()
    uuid = args.uuid

    plot_rgyr_vs_dmax(uuid)


if __name__ == "__main__":
    main()