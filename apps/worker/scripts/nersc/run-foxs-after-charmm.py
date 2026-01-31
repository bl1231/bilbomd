#!/usr/bin/env python3
import os
import glob
import subprocess
import sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

def run_foxs_on_pdb(pdb_file, run_dir):
    """Run FoXS on a single PDB file and handle output."""
    try:
        # Run foxs -p {pdb_file}
        cmd = ['foxs', '-p', pdb_file]
        
        # Open log files for appending
        with open('foxs.log', 'a') as log_file, open('foxs_error.log', 'a') as error_file:
            result = subprocess.run(cmd, stdout=log_file, stderr=error_file, check=True)
        
        # Generate the .dat file path and add to foxs_dat_files.txt
        pdb_basename = os.path.splitext(pdb_file)[0]
        current_dir = os.getcwd()
        dat_path = f"{current_dir}/{pdb_basename}.dat"
        
        # Replace /bilbomd/work with .. 
        relative_dat_path = dat_path.replace('/bilbomd/work', '..')
        
        # Append to foxs_dat_files.txt
        with open('foxs_dat_files.txt', 'a') as dat_file:
            dat_file.write(f"{relative_dat_path}\n")
            
        print(f"  Processed: {pdb_file}")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"  Error processing {pdb_file}: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"  Unexpected error with {pdb_file}: {e}", file=sys.stderr)
        return False

def process_directory(run_dir):
    """Process a single run directory."""
    print(f"Processing directory: {run_dir}")
    
    if not os.path.isdir(run_dir):
        print(f"Directory not found: {run_dir}")
        return
    
    # Change to the directory
    original_dir = os.getcwd()
    try:
        os.chdir(run_dir)
        
        # Find all PDB files in the directory
        pdb_files = glob.glob('*.pdb')
        if not pdb_files:
            print(f"  No PDB files found in {run_dir}")
            return
        
        print(f"  Found {len(pdb_files)} PDB files")
        
        # Process PDB files in parallel
        with ThreadPoolExecutor(max_workers=4) as executor:
            # Submit all tasks
            futures = {executor.submit(run_foxs_on_pdb, pdb_file, run_dir): pdb_file 
                      for pdb_file in pdb_files}
            
            # Wait for completion and collect results
            success_count = 0
            for future in as_completed(futures):
                pdb_file = futures[future]
                try:
                    if future.result():
                        success_count += 1
                except Exception as e:
                    print(f"  Task failed for {pdb_file}: {e}", file=sys.stderr)
        
        print(f"  Successfully processed {success_count}/{len(pdb_files)} PDB files")
        
    finally:
        # Always change back to /bilbomd/work/foxs (or the original directory)
        foxs_work_dir = '/bilbomd/work/foxs'
        if os.path.exists(foxs_work_dir):
            os.chdir(foxs_work_dir)
        else:
            os.chdir(original_dir)

def create_consolidated_foxs_list():
    """Create a consolidated foxs_dat_files.txt file from all individual rg*_run* directories."""
    print("Creating consolidated foxs_dat_files.txt...")
    
    consolidated_entries = []
    
    # Find all rg*_run* directories
    run_dirs = glob.glob('./rg*_run*')
    run_dirs = [d for d in run_dirs if os.path.isdir(d)]
    
    for run_dir in sorted(run_dirs):
        foxs_list_path = os.path.join(run_dir, 'foxs_dat_files.txt')
        if os.path.exists(foxs_list_path):
            with open(foxs_list_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # Convert ../foxs/rg35_run1/file.dat to foxs/rg35_run1/file.dat
                        if line.startswith('../foxs/'):
                            relative_path = line[3:]  # Remove '../' prefix
                            consolidated_entries.append(relative_path)
                        else:
                            consolidated_entries.append(line)
    
    # Write consolidated file to parent directory (charmm/md level)
    os.chdir('..')  # Go up from foxs to md directory
    with open('foxs_dat_files.txt', 'w') as f:
        for entry in consolidated_entries:
            f.write(f"{entry}\n")
    
    print(f"Created consolidated foxs_dat_files.txt with {len(consolidated_entries)} entries")
    os.chdir('foxs')  # Return to foxs directory

def main():
    """Main function to find and process all rg*_run* directories."""
    print("Run FoXS...")
    
    # Find all directories matching rg*_run* pattern
    run_dirs = glob.glob('./rg*_run*')
    run_dirs = [d for d in run_dirs if os.path.isdir(d)]
    
    if not run_dirs:
        print("No rg*_run* directories found")
        return
    
    print(f"Found {len(run_dirs)} directories to process")
    
    # Process each directory
    for run_dir in sorted(run_dirs):
        process_directory(run_dir)
    
    # Create consolidated foxs_dat_files.txt for MultiFoXS compatibility
    create_consolidated_foxs_list()
    
    print("FoXS processing complete")

if __name__ == "__main__":
    main()
