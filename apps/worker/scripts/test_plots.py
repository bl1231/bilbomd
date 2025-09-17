"""
stuff
"""

import os
import json
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib import colormaps as cm
from matplotlib.cm import ScalarMappable

# import numpy as np
from matplotlib.colors import Normalize


def load_json_file(json_file):
    """Load data from a JSON file."""
    with open(json_file, "r", encoding="utf-8") as file:
        data = json.load(file)
    return data


def debug_dataframe(df):
    """Print basic statistics of the dataframe for debugging."""
    print("\nDataFrame Statistics:")
    print(df.describe())
    print("\nColumn Min Values:")
    print(df.min())
    print("\nColumn Max Values:")
    print(df.max())
    print("\nColumn Types:")
    print(df.dtypes)


def plot_scatter(data, output_file, title="Scatter Plot of Rgyr vs Dmax", min_size=2, vline_x=36.0):
    """Generate a scatter plot from the data with color scaling based on size."""
    df = pd.DataFrame(data)

    # Debug the dataframe before proceeding with plotting
    debug_dataframe(df)

    # Sort the dataframe so non-zero 'occur' values are plotted on top
    df = df.sort_values(by="occur", ascending=True)

    # Set a minimum size for points
    sizes = df["occur"].apply(lambda x: max(x * 100, min_size))

    # Normalize sizes for color mapping
    print(f"Min: {df['occur'].min()}, Max: {df['occur'].max()}")
    norm_sizes = (df["occur"] - df["occur"].min()) / (
        df["occur"].max() - df["occur"].min()
    )
    # colors = cm.get_cmap("YlOrRd_r")(norm_sizes)
    colors = cm["YlOrRd_r"](norm_sizes)

    plt.figure(figsize=(10, 6), facecolor="black")  # Set figure background to black
    plt.scatter(df["rgyr"], df["dmax"], s=sizes, c=colors, alpha=0.5)
    # Add a vertical reference line if provided
    if vline_x is not None:
        plt.axvline(x=vline_x, color='blue', linestyle='--', linewidth=1.5, label=f'Rg {vline_x}')

    # Set black background for axes
    ax = plt.gca()
    ax.set_facecolor("black")
    ax.grid(color="gray", linestyle="--", alpha=0.3)
    ax.tick_params(colors="white")
    ax.spines["bottom"].set_color("white")
    ax.spines["left"].set_color("white")
    ax.xaxis.label.set_color("white")
    ax.yaxis.label.set_color("white")
    ax.title.set_color("white")

    plt.xlabel("Rgyr")
    plt.ylabel("Dmax")
    plt.title(title)

    norm = Normalize(df["occur"].min(), df["occur"].max())
    sm = ScalarMappable(cmap="YlOrRd_r", norm=norm)
    sm.set_array([])
    cbar = plt.colorbar(sm, ax=ax, label="Occurrence (normalized)")
    cbar.ax.yaxis.set_tick_params(color="white")
    cbar.ax.yaxis.set_tick_params(labelcolor="white")

    # Add the legend and adjust the label color for the vertical line
    legend = plt.legend(loc='lower right')
    for text in legend.get_texts():
        if f'Rg {vline_x}' in text.get_text():
            text.set_color('blue')  # Set label text color to match the line

    # Save the figure as a PNG file
    print(f"Saving plot to: {output_file}")
    plt.savefig(output_file, dpi=300, bbox_inches="tight", facecolor="black")
    plt.close()  # Close the plot to free memory

def plot_complex_chi(data, output_file, title="Complex Number vs. Chi-Square"):
    """Generate a line plot for complex number vs. chi-square."""
    df = pd.DataFrame(data)

    plt.figure(figsize=(10, 6))
    plt.plot(df["complex_number"], df["chi_square"], marker="o", linestyle="-", color="red", alpha=0.7)

    plt.xlabel("Complex Number")
    plt.ylabel("Chi-Square")
    plt.title(title)
    plt.grid(True)

    print(f"Saving complex vs. chi-square plot to: {output_file}")
    plt.savefig(output_file, dpi=300, bbox_inches="tight")
    plt.close()


def generate_plots_from_json_files(json_dir):
    """Generate plots from JSON files in the specified directory."""
    for root, _, files in os.walk(json_dir):
        for file in files:
            if file.endswith(".json"):
                json_file = os.path.join(root, file)
                data = load_json_file(json_file)

                # Determine if this is a scatter or complex/chi-square JSON
                if "complex_number" in data[0]:
                    plot_title = f"Complex Number vs. Chi-Square: {os.path.splitext(file)[0]}"
                    output_file = os.path.join(root, f"{os.path.splitext(file)[0]}_complex.png")
                    plot_complex_chi(data, output_file, title=plot_title)
                else:
                    plot_title = f"Scatter Plot: {os.path.splitext(file)[0]}"
                    output_file = os.path.join(root, f"{os.path.splitext(file)[0]}.png")
                    plot_scatter(data, output_file, title=plot_title)


# Example usage
# json_directory = "test/data/30feae80-611b-4c3f-8f4a-f33980387441/multifoxs"
# json_directory = "test/data/6fe8378a-7204-4042-8ea2-e71cebbd5977/multifoxs"
# json_directory = "test/parsing/980a27bb-e3a2-41d3-b544-e81f29ca2f7a/multifoxs"
json_directory = "test/parsing/bc84e5e0-938a-48d2-97f0-8f2055cdf3fa/multifoxs"
generate_plots_from_json_files(json_directory)
