import os
import json
import numpy as np
import matplotlib.pyplot as plt
from sklearn.neighbors import KernelDensity
import argparse

def load_json_data(json_file):
    """Load data from a JSON file."""
    with open(json_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_n_state_fields(data):
    """Get unique N-state-model-count fields from data."""
    return sorted({key for item in data for key in item.keys() if key.endswith("state-model-count")})

def filter_non_zero_state(data, state):
    """Filter out entries with zero values for a specified N-state-model-count."""
    return [item for item in data if item.get(state, 0) > 0]

# Calculate optimal bins using Freedman-Diaconis rule
def calculate_bins(data):
    # Ensure data is a 1D array for percentile calculations
    data = np.asarray(data).flatten()
    iqr = np.percentile(data, 75) - np.percentile(data, 25)
    bin_width = 2 * iqr / np.cbrt(len(data))
    return max(1, int((data.max() - data.min()) / bin_width))


def plot_histogram_and_kde(values, weights, label, output_dir, variable_name):
    """Plot a histogram and KDE for a given set of values, with KDE on a secondary y-axis."""
    # Remove None values from values and corresponding weights
    values, weights = zip(*[(v, w) for v, w in zip(values, weights) if v is not None])

    # Convert values and weights to numpy arrays for compatibility
    values = np.array(values).reshape(-1, 1)
    weights = np.array(weights)

    # Check total weighted count to verify correct weighting
    print(f"Total weighted count for {label} ({variable_name}): {weights.sum()}")

    # Create the figure and plot the histogram on the primary y-axis
    fig, ax1 = plt.subplots(figsize=(10, 6))
    bins = calculate_bins(values)
    bins=30
    # print(f"Using {bins} bins for {variable_name} histogram")
    counts, bin_edges, bars = ax1.hist(
        values, bins=bins, weights=weights, density=False, alpha=0.6, edgecolor='black', label=f'{variable_name} Histogram ({label})'
    )

    # Use bar_label to annotate the bars with counts
    ax1.bar_label(bars, labels=[f"{int(count)}" for count in counts], padding=5, fontsize=10, color='black') # type: ignore

    # Set primary y-axis labels for histogram
    ax1.set_ylim(0, np.max(counts) * 1.2)
    ax1.set_xlabel(variable_name)
    ax1.set_ylabel('Count')
    ax1.set_title(f'{variable_name} Distribution with KDE for {label}')

    # Create a secondary y-axis for KDE
    ax2 = ax1.twinx()

    # Perform KDE and plot it on the secondary y-axis
    kde = KernelDensity( kernel='gaussian', bandwidth=2)
    kde.fit(values, sample_weight=weights)
    value_range = np.linspace(values.min(), values.max(), 1000).reshape(-1, 1)
    log_density = kde.score_samples(value_range)
    density = np.exp(log_density)
    
    ax2.plot(value_range, density, color='blue', label=f'{variable_name} KDE ({label})')
    ax2.set_ylim(0, density.max() * 1.4)
    ax2.set_ylabel('Density (KDE)')

    # Add legends
    ax1.legend(loc='upper left')
    ax2.legend(loc='upper right')
    plt.tight_layout()

    # Save the plot
    output_file = os.path.join(output_dir, f"{variable_name}_{label}_kde_plot.png")
    plt.savefig(output_file, dpi=300)
    plt.close()
    print(f"Plot saved as {output_file}")

def count_n_state_model_counts(data, states):
    """Count the total occurrences for each N-state-model-count field."""
    counts = {state: 0 for state in states}

    for item in data:
        for state in states:
            counts[state] += item.get(state, 0)  # Add the count if present, otherwise add 0

    # Print the total count for each state
    for state, total in counts.items():
        print(f"Total {state}: {total}")

    return counts

def plot_state_distributions(uuid):
    """Plot histograms and KDEs for rgyr and dmax values for each N-state-model-count."""
    base_dir = f"test/parsing/{uuid}/multifoxs/"
    json_file = os.path.join(base_dir, "consolidated_rgyr_dmax_data.json")

    # Define the results directory and create it if it doesn't exist
    results_dir = f"test/parsing/{uuid}/results/"
    os.makedirs(results_dir, exist_ok=True)

    # Load data
    data = load_json_data(json_file)

    # Identify unique N-state-model-count fields
    states = get_n_state_fields(data)
    print(f"Identified N-state-model-count fields: {states}")

    # Count occurrences for each N-state-model-count
    count_n_state_model_counts(data, states)

    # Define variables to analyze
    # variables = ["rgyr", "dmax"]
    variables = ["rgyr"]

    for state in states:
        # Filter out entries with zero values for the current state
        filtered_data = filter_non_zero_state(data, state)
        print(f"Processing {state} with {len(filtered_data)} entries")

        for variable in variables:
            # Extract the non-zero values for the current variable and corresponding weights
            values = [item[variable] for item in filtered_data if variable in item]
            weights = [item[state] for item in filtered_data]
            
            if values:
                plot_histogram_and_kde(values, weights, state, results_dir, variable)

def main():
    """Main function to handle command-line arguments and run the script."""
    parser = argparse.ArgumentParser(description='Plot distributions with KDE for each N-state-model-count.')
    parser.add_argument(
        "--uuid",
        type=str,
        default="569f96b3-8d28-4c75-b506-d6d79975ede0",
        help="UUID for the directory structure (default: 569f96b3-8d28-4c75-b506-d6d79975ede0)",
    )
    args = parser.parse_args()
    uuid = args.uuid

    plot_state_distributions(uuid)

if __name__ == '__main__':
    main()