#!/usr/bin/env python3
"""
BilboMD API Job Submission Tool

Submit jobs to the BilboMD API with configurable parameters.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

import requests


class BilboMDSubmitter:
    def __init__(self):
        self.script_dir = Path(__file__).parent
        self.load_env()

    def load_env(self):
        """Load environment variables from .env file if it exists."""
        env_file = self.script_dir / ".env"
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.strip() and not line.startswith("#"):
                        key, value = line.strip().split("=", 1)
                        os.environ[key] = value.strip("\"'")

        # Get required environment variables
        self.api_token = os.getenv("BILBOMD_API_TOKEN")
        self.api_url = os.getenv(
            "BILBOMD_API_URL",
            "https://bilbomd-nersc.bl1231.als.lbl.gov/api/v1/external/jobs",
        )

        if not self.api_token:
            print("Error: BILBOMD_API_TOKEN environment variable not set")
            sys.exit(1)

    def get_file_mapping(
        self, sample_dir: Path, pipeline: str
    ) -> Dict[str, Optional[Path]]:
        """Get file mappings based on pipeline type."""
        files = {
            "pdb_file": None,
            "crd_file": None,
            "dat_file": None,
            "pae_file": None,
            "psf_file": None,
            "dcd_file": None,
            "entities_json": None,  # Added for alphafold
        }

        # Common files
        pdb_files = list(sample_dir.glob("*.pdb"))
        dat_files = list(sample_dir.glob("*.dat"))
        pae_files = list(sample_dir.glob("*pae*.json"))

        if pdb_files:
            files["pdb_file"] = pdb_files[0]
        if dat_files:
            files["dat_file"] = dat_files[0]
        if pae_files:
            files["pae_file"] = pae_files[0]

        # Pipeline-specific files
        if pipeline in ["crd"]:
            crd_files = list(sample_dir.glob("*.crd"))
            psf_files = list(sample_dir.glob("*.psf"))
            if crd_files:
                files["crd_file"] = crd_files[0]
            if psf_files:
                files["psf_file"] = psf_files[0]
        elif pipeline in ["scoper"]:
            dcd_files = list(sample_dir.glob("*.dcd"))
            if dcd_files:
                files["dcd_file"] = dcd_files[0]
        elif pipeline in ["af"]:
            # Look for entities.json file for alphafold pipeline
            entities_files = list(sample_dir.glob("entities.json"))
            if entities_files:
                files["entities_json"] = entities_files[0]

        return files

    def get_bilbomd_mode(self, pipeline: str) -> str:
        """Map pipeline to bilbomd_mode."""
        mode_mapping = {
            "pdb": "pdb",
            "crd": "crd",
            "auto": "auto",
            "af": "alphafold",
            "sans": "sans",
            "scoper": "scoper",
        }
        return mode_mapping.get(pipeline, pipeline)

    def generate_title(self, sample: str, pipeline: str, md_engine: str) -> str:
        """Generate a unique title for the job."""
        date_str = datetime.now().strftime("%m%d")
        timestamp_suffix = str(int(datetime.now().timestamp()))[-4:]
        return f"{date_str}-{sample}-{pipeline}-{md_engine.lower()}-{timestamp_suffix}"

    def submit_job(
        self,
        sample_dir: Path,
        pipeline: str,
        md_engine: str,
        title: Optional[str] = None,
    ) -> None:
        """Submit a job to the BilboMD API."""

        # Validate inputs
        if not sample_dir.exists():
            print(f"Error: Sample directory {sample_dir} does not exist")
            sys.exit(1)

        if pipeline not in ["pdb", "crd", "auto", "af", "sans", "scoper"]:
            print(f"Error: Invalid pipeline '{pipeline}'")
            sys.exit(1)

        if md_engine not in ["openmm", "charmm"]:
            print(f"Error: Invalid MD engine '{md_engine}'")
            sys.exit(1)

        # Get files
        files = self.get_file_mapping(sample_dir, pipeline)

        # Generate title if not provided
        if not title:
            title = self.generate_title(sample_dir.name, pipeline, md_engine)

        # Prepare form data
        form_data = {
            "bilbomd_mode": self.get_bilbomd_mode(pipeline),
            "md_engine": md_engine.upper(),
            "title": title,
        }

        # Handle entities.json for alphafold pipeline
        if pipeline == "af" and files["entities_json"]:
            try:
                with open(files["entities_json"], "r") as f:
                    entities_content = f.read()
                    # Validate it's valid JSON
                    json.loads(entities_content)
                    form_data["entities_json"] = entities_content
                    print(f"Found entities.json: {files['entities_json']}")
            except (json.JSONDecodeError, FileNotFoundError) as e:
                print(f"Error reading entities.json: {e}")
                sys.exit(1)
        elif pipeline == "af":
            print("Error: entities.json file required for alphafold pipeline")
            sys.exit(1)

        # Prepare files for upload (exclude entities_json as it's handled as form data)
        files_to_upload = {}
        for file_key, file_path in files.items():
            if file_key == "entities_json":
                continue  # Skip entities_json as it's form data, not file upload
            if file_path and file_path.exists():
                files_to_upload[file_key] = open(file_path, "rb")
                print(f"Found {file_key}: {file_path}")

        # Check for required files
        if pipeline == "af":
            # For alphafold, we need at least dat_file and entities_json
            if not files["dat_file"] or not files["entities_json"]:
                print("Error: Alphafold pipeline requires dat_file and entities.json")
                sys.exit(1)
        elif not files_to_upload:
            print(f"Error: No input files found in {sample_dir}")
            sys.exit(1)

        try:
            print("\nSubmitting job:")
            print(f"  Sample: {sample_dir.name}")
            print(f"  Pipeline: {pipeline}")
            print(f"  MD Engine: {md_engine}")
            print(f"  Title: {title}")
            print(f"  API URL: {self.api_url}")

            # Make the request
            headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Accept": "application/json",
            }

            response = requests.post(
                f"{self.api_url}/",
                headers=headers,
                data=form_data,
                files=files_to_upload,
            )

            print(f"\nHTTP Status: {response.status_code}")

            try:
                response_json = response.json()
                print(json.dumps(response_json, indent=2))
            except json.JSONDecodeError:
                print(response.text)

        except requests.exceptions.RequestException as e:
            print(f"Error making request: {e}")
            sys.exit(1)
        finally:
            # Close all opened files
            for f in files_to_upload.values():
                f.close()


def main():
    parser = argparse.ArgumentParser(
        description="Submit jobs to the BilboMD API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --sample data/auto1 --pipeline auto --md openmm
  %(prog)s --sample data/lysozyme --pipeline pdb --md charmm --title "my-test-job"
  %(prog)s --sample data/crd_test --pipeline crd --md openmm
  %(prog)s --sample data/af-complex --pipeline af --md openmm
        """,
    )

    parser.add_argument(
        "--sample", required=True, help="Directory containing sample data files"
    )
    parser.add_argument(
        "--pipeline",
        required=True,
        choices=["pdb", "crd", "auto", "af", "sans", "scoper"],
        help="BilboMD pipeline to use",
    )
    parser.add_argument(
        "--md", required=True, choices=["openmm", "charmm"], help="MD engine to use"
    )
    parser.add_argument(
        "--title", help="Custom job title (auto-generated if not provided)"
    )

    args = parser.parse_args()

    submitter = BilboMDSubmitter()
    sample_dir = Path(args.sample)

    submitter.submit_job(sample_dir, args.pipeline, args.md, args.title)


if __name__ == "__main__":
    main()
