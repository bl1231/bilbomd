from openmm import CustomCVForce, CustomCentroidBondForce
from openmm.unit import angstroms
import csv
import numpy as np
from utils.logger import get_logger

logger = get_logger("rgyr")


class RgyrDmaxCapture:
    """
    Computes Rgyr/Dmax in memory during MD; writes CSV once after simulation.
    Eliminates per-step disk flushes and stdout prints that block the trajectory.
    """

    def __init__(self, atom_indices, reportInterval=500):
        self.atom_indices = atom_indices
        self.reportInterval = reportInterval
        self.rows: list[tuple[int, float, float]] = []

    def describeNextReport(self, simulation):
        return (self.reportInterval, True, False, False, False)

    def report(self, simulation, state):
        positions = state.getPositions()
        coords = np.array(
            [positions[i].value_in_unit(angstroms) for i in self.atom_indices]
        )
        com = coords.mean(axis=0)
        rg = float(np.sqrt(np.mean(np.sum((coords - com) ** 2, axis=1))))
        diff = coords[:, None, :] - coords[None, :, :]
        dmax = float(np.max(np.sqrt(np.sum(diff ** 2, axis=-1))))
        self.rows.append((simulation.currentStep, rg, dmax))

    def write_csv(self, filepath: str) -> None:
        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Step", "Rgyr_A", "Dmax_A"])
            writer.writerows(self.rows)
        logger.info(f"Wrote {len(self.rows)} Rgyr/Dmax rows to {filepath}")


class RadiusOfGyrationCVForce(CustomCVForce):
    def __init__(self, atom_indices, k_rg, rg0, force_group=0):
        """
        # this is from Peter Eastman's suggestion here: https://github.com/openmm/openmm/issues/4095
        Adds a radius of gyration restraint to a system using a harmonic potential.
        All atoms are weighted equally.

        Parameters:
            atom_indices (list of int): Atom indices to include in the Rg calculation.
            k (float or Quantity): Force constant, in kJ/mol/nm².
            rg0 (float or Quantity): Reference Rg, in nm.
            force_group (int): Force group to assign.
        """
        num_atoms = len(atom_indices)
        logger.debug(f"num_atoms in Rg calc: {num_atoms}")

        # Define expression: mean squared distance between atoms and group centroid
        rg2_force = CustomCentroidBondForce(2, f"(distance(g1, g2)^2)/{num_atoms}")

        # Add groups: one per atom (g1), one for full group (g2)
        for i in atom_indices:
            rg2_force.addGroup([i], [1.0])  # g1: single atom

        rg2_force.addGroup(atom_indices, [1.0] * num_atoms)  # g2: whole group

        logger.debug("Added groups to rg2_force")
        # Add bonds between atom-groups (g1) and centroid (g2)
        for i in range(num_atoms):
            rg2_force.addBond(
                [i, num_atoms]
            )  # last group is full group (index = num_atoms)

        logger.debug("Added bonds to rg2_force")
        # Create CV force based on sqrt(Rg²)
        super().__init__("0.5 * k_rg * (sqrt(cv) - rg0)^2")
        self.addGlobalParameter("k_rg", k_rg)
        self.addGlobalParameter("rg0", rg0)
        self.addCollectiveVariable("cv", rg2_force)
        self.setForceGroup(force_group)
        logger.debug("Done creating CVForce object for Rg")
