import os
import json
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib import colormaps as cm

def load_json_file(json_file):
    """Load data from a JSON file."""
    with open(json_file, "r", encoding="utf-8") as file:
        data = json.load(file)
    return data

def plot_combined_complex_chi(data_dict, output_file, title="Combined Complex Number vs. Chi-Square", min_y=None):
    """Generate a line plot for combined complex number vs. chi-square series."""
    plt.figure(figsize=(12, 8))
    # Calculate global min and max for chi_square across all series
    global_y_min = float('inf')
    global_y_max = float('-inf')

    # Plot each series with a different color
    for label, data in data_dict.items():
        df = pd.DataFrame(data)
        plt.plot(df["complex_number"], df["chi_square"], marker="o", linestyle="-", label=label, alpha=0.7)
        # Update global min and max
        global_y_min = min(global_y_min, df["chi_square"].min())
        global_y_max = max(global_y_max, df["chi_square"].max())


    print(f"Dynamic Y-axis limits: min={global_y_min}, max={global_y_max}")

    # Set dynamic y-axis limits with padding
    y_padding = (global_y_max - global_y_min) * 0.1  # Add 10% padding
    y_min_limit = min_y if min_y is not None else global_y_min - y_padding
    y_max_limit = global_y_max + y_padding
    plt.ylim(1.5, 3.0)
    print(f"Adjusted Y-axis limits: min={y_min_limit}, max={y_max_limit}")

    plt.xlabel("Complex Number")
    plt.ylabel("Chi-Square")
    plt.title(title)
    plt.grid(True)
    plt.legend(title="Ensemble", bbox_to_anchor=(1.05, 1), loc='upper left')
    plt.tight_layout()

    print(f"Saving combined complex vs. chi-square plot to: {output_file}")
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    plt.close()

def generate_combined_complex_plot(json_dir):
    """Generate a single plot combining all complex number vs. chi-square series."""
    data_dict = {}
    for root, _, files in os.walk(json_dir):
        for file in files:
            if file.endswith("_complex.json"):
                json_file = os.path.join(root, file)
                data = load_json_file(json_file)

                # Use the filename (without extension) as the series label
                label = os.path.splitext(file)[0]
                data_dict[label] = data

    if data_dict:
        output_file = os.path.join(json_dir, "combined_complex_chi_square.png")
        plot_combined_complex_chi(data_dict, output_file)

# Example usage
# json_directory = "test/parsing/980a27bb-e3a2-41d3-b544-e81f29ca2f7a/multifoxs"
json_directory = "test/parsing/bc84e5e0-938a-48d2-97f0-8f2055cdf3fa/multifoxs"
generate_combined_complex_plot(json_directory)