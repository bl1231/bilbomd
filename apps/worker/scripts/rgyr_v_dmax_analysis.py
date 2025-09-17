import argparse
import json
import os
import re

import pandas as pd

os.environ["MKL_SERVICE_FORCE_INTEL"] = "1"

def parse_pdb_file(pdb_file):
    """Parse a PDB file to extract Rgyr and Dmax."""
    with open(pdb_file, "r", encoding="utf-8") as file:
        for line in file:
            if line.startswith("REMARK DCD2PDB_RG"):
                parts = line.split()
                if len(parts) >= 4:
                    rgyr = float(parts[2])
                    dmax = float(parts[3])
                    pdb_prefix = parts[1]
                    return pdb_prefix, rgyr, dmax
    return None, None, None


def parse_ensemble_size_file(ensemble_file):
    """Parse an ensemble size file to extract PDB occurrences and counts."""
    pdb_occurrences = {}
    pdb_counts = {}

    with open(ensemble_file, "r", encoding="utf-8") as file:
        for line in file:
            match = re.search(r"([^/\\]+)\.pdb\.dat\s+\(([\d\.]+)\)", line)
            if match:
                pdb_name = match.group(1).upper()
                occurrence = float(match.group(2))
                # print(f"PDB: {pdb_name}, Occurrence: {occurrence}")
                
                # Count the number of times each PDB is found
                pdb_counts[pdb_name] = pdb_counts.get(pdb_name, 0) + 1
                
                # Assign the first non-zero occurrence percentage
                if pdb_name not in pdb_occurrences or pdb_occurrences[pdb_name] == 0.0:
                    pdb_occurrences[pdb_name] = occurrence
                
    return pdb_occurrences, pdb_counts

def collect_pdb_data(foxs_dir):
    """Collect Rgyr, Dmax, and initial size data from PDB files."""
    pdb_data = {}

    for root, _, files in os.walk(foxs_dir):
        for file in files:
            if file.endswith(".pdb"):
                pdb_file = os.path.join(root, file)
                pdb_prefix, rgyr, dmax = parse_pdb_file(pdb_file)
                if pdb_prefix is not None:
                    pdb_data[pdb_prefix] = {
                        "rgyr": rgyr,
                        "dmax": dmax,
                        "pdb": pdb_prefix
                    }

    return pdb_data

def build_scatter_data(base_dir):
    """Build scatter data and save separate CSV and JSON files for each ensemble size file."""
    foxs_dir = os.path.join(base_dir, "foxs")
    multifoxs_dir = os.path.join(base_dir, "multifoxs")
    print(f"FoXS directory: {foxs_dir}")
    print(f"MultiFoXS directory: {multifoxs_dir}")

    # Collect PDB data from the foxs directory
    pdb_data = collect_pdb_data(foxs_dir)

    # Traverse through the multifoxs directory for ensemble size files
    for root, _, files in os.walk(multifoxs_dir):
        print(f"Processing directory: {root}")
        ensemble_files = [
            f for f in files if f.startswith("ensembles_size_") and f.endswith(".txt")
        ]

        # Process each ensemble size file separately
        for ensemble_file in ensemble_files:
            print(f"Processing ensemble size file: {ensemble_file}")

            # Extract N from the filename
            match = re.search(r"ensemble[s]?_size_(\d+)\.txt", ensemble_file)
            if not match:
                print(f"Skipping file: {ensemble_file}")
                continue
            N = int(match.group(1))

            ensemble_path = os.path.join(root, ensemble_file)
            pdb_occurrences, pdb_counts = parse_ensemble_size_file(ensemble_path)

            # Update pdb_data to include occurrence percentages and model counts
            for pdb_prefix, occurrence in pdb_occurrences.items():
                percent_key = f"percent-in-{N}-state-models"
                count_key = f"{N}-state-model-count"
                
                if pdb_prefix in pdb_data:
                    pdb_data[pdb_prefix][percent_key] = occurrence
                    pdb_data[pdb_prefix][count_key] = pdb_counts[pdb_prefix]
                else:
                    pdb_data[pdb_prefix] = {
                        "rgyr": None,
                        "dmax": None,
                        "pdb": pdb_prefix,
                        percent_key: occurrence,
                        count_key: pdb_counts[pdb_prefix]
                    }

    # Fill missing fields for each ensemble size
    for pdb_prefix, data in pdb_data.items():
        for ensemble_file in ensemble_files:
            match = re.search(r"ensemble[s]?_size_(\d+)\.txt", ensemble_file)
            if match:
                N = match.group(1)
                percent_key = f"percent-of-{N}-state-models"
                count_key = f"{N}-state-model-count"
                data.setdefault(percent_key, 0.0)
                data.setdefault(count_key, 0)

    # Save the consolidated data to a single JSON file
    consolidated_json_path = os.path.join(multifoxs_dir, "consolidated_rgyr_dmax_data.json")
    with open(consolidated_json_path, "w", encoding="utf-8") as json_file:
        json.dump(list(pdb_data.values()), json_file, indent=2)
    print(f"Saved consolidated data to {consolidated_json_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Build scatter data from PDB and ensemble size files."
    )
    parser.add_argument(
        "base_directory",
        type=str,
        help="Path to the base directory containing the 'foxs' and 'multifoxs' directories.",
    )
    args = parser.parse_args()
    print(f"Base directory: {args.base_directory}")
    build_scatter_data(args.base_directory)