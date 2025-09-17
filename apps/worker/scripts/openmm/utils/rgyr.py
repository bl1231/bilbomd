# from openmm.app import *
from openmm import CustomCVForce, CustomCentroidBondForce
from openmm.unit import nanometer, dalton, angstroms
import csv
import numpy as np


class MinimalReporter:
    def __init__(self, interval=500):
        self.interval = interval

    def describeNextReport(self, simulation):
        return (self.interval, True, False, False, False)

    def report(self, simulation, state):
        print(f"MinimalReporter called at step {simulation.currentStep}")


class TestReporter:
    def __init__(self, interval=500):
        self.interval = interval

    def describeNextReport(self, simulation):
        return (self.interval, False, False, False, False)

    def report(self, simulation, state):
        print(f"TestReporter triggered at step {simulation.currentStep}")


class RadiusOfGyrationReporter:
    def __init__(
        self,
        atom_indices,
        system,
        filename,
        reportInterval=500,
    ):
        self.atom_indices = atom_indices
        self.system = system
        self.reportInterval = reportInterval
        self.filename = filename
        # Open CSV file and write header
        self.csvfile = open(self.filename, "w", newline="")
        self.writer = csv.writer(self.csvfile)
        self.writer.writerow(["Step", "Radius_of_Gyration_nm"])

    def describeNextReport(self, simulation):
        # print(f"describeNextReport called at step {simulation.currentStep}, interval={self.reportInterval}")
        # return (self.reportInterval, True, True, True, True)
        return (self.reportInterval, True, False, False, False)

    def report(self, simulation, state):
        try:
            # I'm worried that this is ignoring virtual particles
            # or virtual particles cause the real particles to be ignored?
            positions = state.getPositions()
            # print(f"report called at step {simulation.currentStep}, positions={len(positions)}")
            # for i in self.atom_indices:
            #     mass_i = self.system.getParticleMass(i)
            #     print(f"Atom {i} mass: {mass_i}")
            # masses = np.array([self.system.getParticleMass(i).value_in_unit(dalton) for i in self.atom_indices])
            masses = np.array([12.011] * len(self.atom_indices))
            # print("Atom masses:")
            # for i, m in zip(self.atom_indices, masses):
            #     print(f"  Atom {i}: mass = {m} Da")
            coords = np.array(
                [positions[i].value_in_unit(angstroms) for i in self.atom_indices]
            )
            total_mass = np.sum(masses)
            com = np.average(coords, axis=0, weights=masses)
            sq_dists = np.sum((coords - com) ** 2, axis=1)
            rg2 = np.sum(masses * sq_dists) / total_mass
            rg = np.sqrt(rg2)
            # Write step and Rg to CSV
            self.writer.writerow([simulation.currentStep, rg])
            self.csvfile.flush()  # ensure data is written promptly
            print(f"Step {simulation.currentStep}: Radius of Gyration = {rg:.4f} nm")
        except Exception as e:
            print(f"Exception in RadiusOfGyrationReporter: {e}")

    def __del__(self):
        if hasattr(self, "csvfile") and not self.csvfile.closed:
            self.csvfile.close()


class RadiusOfGyrationCVForce(CustomCVForce):
    def __init__(
        self, atom_indices, k_rg, rg0, weigh_by_mass=False, system=None, force_group=0
    ):
        """
        # this is from Peter Eastman's suggestion here: https://github.com/openmm/openmm/issues/4095
        Adds a radius of gyration restraint to a system using a harmonic potential.

        Parameters:
            atom_indices (list of int): Atom indices to include in the Rg calculation.
            k (float or Quantity): Force constant, in kJ/mol/nm².
            rg0 (float or Quantity): Reference Rg, in nm.
            weigh_by_mass (bool): Whether to compute mass-weighted Rg.
            system (System): OpenMM System object (needed if weigh_by_mass=True).
            force_group (int): Force group to assign.
        """
        num_atoms = len(atom_indices)
        print(f"num_atoms in Rg calc: {num_atoms}")

        # Define expression: mean squared distance between atoms and group centroid
        rg2_force = CustomCentroidBondForce(2, f"(distance(g1, g2)^2)/{num_atoms}")

        # Add groups: one per atom (g1), one for full group (g2)
        for i in atom_indices:
            rg2_force.addGroup([i], [1.0])  # g1: single atom

        # g2: whole group, possibly mass-weighted
        if weigh_by_mass:
            if system is None:
                raise ValueError("Must pass `system` when weigh_by_mass=True")
            weights = [
                system.getParticleMass(i).value_in_unit(dalton) for i in atom_indices
            ]
        else:
            weights = [1.0] * num_atoms

        rg2_force.addGroup(atom_indices, weights)  # g2

        print("Added groups to rg2_force")
        # Add bonds between atom-groups (g1) and centroid (g2)
        for i in range(num_atoms):
            rg2_force.addBond(
                [i, num_atoms]
            )  # last group is full group (index = num_atoms)

        print("Added bonds to rg2_force")
        # Create CV force based on sqrt(Rg²)
        super().__init__("0.5 * k_rg * (sqrt(cv) - rg0)^2")
        self.addGlobalParameter("k_rg", k_rg)
        self.addGlobalParameter("rg0", rg0)
        self.addCollectiveVariable("cv", rg2_force)
        self.setForceGroup(force_group)
        print("Done creating CVForce object for Rg")


def compute_radius_of_gyration(positions, atom_indices, masses):
    coords = np.array([positions[i].value_in_unit(nanometer) for i in atom_indices])
    mass_array = np.array([masses[i] for i in atom_indices])
    total_mass = np.sum(mass_array)
    com = np.average(coords, axis=0, weights=mass_array)
    squared_dists = np.sum((coords - com) ** 2, axis=1)
    rg2 = np.sum(mass_array * squared_dists) / total_mass
    return np.sqrt(rg2)


def add_radius_of_gyration_restraint(
    system, atom_indices, k_rg, rg_target, force_group=0
):
    """
    # ChatGPT prompt: openmm restraint force radius of gyation like CHARMM
    Adds a harmonic radius of gyration restraint to an OpenMM system.

    Parameters:
    - system: OpenMM System object
    - atom_indices: list of atom indices over which to compute Rg
    - k_rg: force constant (kJ/mol/nm^2)
    - rg_target: target Rg value (nm)
    - force_group: optional force group ID
    """
    n = len(atom_indices)

    """
    # Expression for Rg^2
    expr = (
        "comx=0; comy=0; comz=0; mass=0;"
        + "".join([f"comx+=m{i}*x{i}; comy+=m{i}*y{i}; comz+=m{i}*z{i}; mass+=m{i};" for i in range(n)])
        + "comx/=mass; comy/=mass; comz/=mass;"
        + "rg2=0;"
        + "".join([
            f"dx=x{i}-comx; dy=y{i}-comy; dz=z{i}-comz; rg2+=(dx*dx + dy*dy + dz*dz);" for i in range(n)
        ])
        + "rg2/=mass;"
        + "rg2;"
    )
    """
    expr = (
        "comx=0; comy=0; comz=0;"
        + "".join(
            [f"comx+=m{i}*x{i}; comy+=m{i}*y{i}; comz+=m{i}*z{i};" for i in range(n)]
        )
        + "mass="
        + "+".join([f"m{i}" for i in range(n)])
        + ";"
        + "comx/=mass; comy/=mass; comz/=mass;"
        + "rg2=0;"
        + "".join(
            [
                f"dx=x{i}-comx; dy=y{i}-comy; dz=z{i}-comz; rg2+=m{i}*(dx*dx + dy*dy + dz*dz);"
                for i in range(n)
            ]
        )
        + "rg2/=mass;"
        + "rg2;"
    )

    # CustomCentroidBondForce to compute Rg²
    centroid_force = CustomCentroidBondForce(1, expr)
    centroid_force.addGroup(atom_indices)

    # CustomCVForce applying harmonic potential on sqrt(Rg²)
    cv_force = CustomCVForce("0.5 * k * (sqrt(cv) - rg0)^2")
    cv_force.addCollectiveVariable("cv", centroid_force)
    cv_force.addGlobalParameter("k", k_rg)
    cv_force.addGlobalParameter("rg0", rg_target)
    cv_force.setForceGroup(force_group)

    system.addForce(cv_force)

    return cv_force
