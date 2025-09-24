import sys
import yaml

base_path, constraints_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

with open(base_path, "r", encoding="utf-8") as f:
    cfg = yaml.safe_load(f) or {}

with open(constraints_path, "r", encoding="utf-8") as f:
    cons = yaml.safe_load(f) or {}

if "constraints" in cons:
    cfg["constraints"] = cons["constraints"]
else:
    raise SystemExit("constraints.yaml missing top-level 'constraints'")

with open(out_path, "w", encoding="utf-8") as f:
    yaml.safe_dump(cfg, f, sort_keys=False)
