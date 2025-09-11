import os
import pandas as pd
import matplotlib.pyplot as plt
import sys

if len(sys.argv) != 2:
    print("Usage: python plot_rgyrs.py <md_directory>")
    sys.exit(1)

base_dir = sys.argv[1]
plot_data = []
rg_targets = []

# Collect CSV data from each rg_* subdir
for subdir in sorted(os.listdir(base_dir)):
    full_path = os.path.join(base_dir, subdir)
    if os.path.isdir(full_path) and subdir.startswith("rg_"):
        # Look for a CSV in the subdir
        csv_files = [f for f in os.listdir(full_path) if f.endswith(".csv")]
        if not csv_files:
            print(f"No CSV found in {full_path}")
            continue
        csv_path = os.path.join(full_path, csv_files[0])
        if os.path.exists(csv_path):
            df = pd.read_csv(csv_path)
            df["Rg_Angstrom"] = df["Radius_of_Gyration_nm"]
            label = subdir.replace("rg_", "Rg = ")
            plot_data.append((df["Step"], df["Rg_Angstrom"], label))
            rg_value = float(subdir.split("_")[1])
            rg_targets.append((rg_value, label))

# Plot all curves
plt.figure(figsize=(10, 6))
color_map = {}
for steps, rgyr, label in plot_data:
    line, = plt.plot(steps, rgyr, label=label)
    color_map[label] = line.get_color()

for rg_value, label in rg_targets:
    color = color_map.get(label, None)
    plt.axhline(y=rg_value, linestyle='--', linewidth=1, alpha=0.6, label=f"{label} target", color=color)

plt.title("Radius of Gyration over Time")
plt.xlabel("Step")
plt.ylabel("Radius of Gyration (Å)")
plt.legend(loc="best")
# plt.grid(True)
plt.tight_layout()

# Save to file
output_file = f"rgyr_plot.png"
plt.savefig(output_file, dpi=300)
print(f"Plot saved to {output_file}")