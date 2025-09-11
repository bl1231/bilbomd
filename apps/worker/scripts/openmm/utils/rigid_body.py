"""Rigid Body Constraints in OpenMM"""
from itertools import combinations

import numpy as np
import numpy.linalg as lin
import openmm as omm
from openmm import unit, Vec3
from openmm.app import Topology
from openmm.unit import amu, nanometer


def apply_rigid_body_constraint(
    system: omm.System, atom_indices: list[int], positions: list, topology: Topology = None
):
    """
    Applies absolute rigid body constraints to a group of atoms in an OpenMM system.

    Parameters:
    - system: the OpenMM System object to modify
    - atom_indices: list of atom indices to treat as a rigid body (at least 3 required)
    - positions: list of Vec3 positions corresponding to atoms in the system, used to
        determine the initial distances.
    - topology: (optional) OpenMM Topology object, used for debugging.

    This function adds constraints to fix the distances between every pair of selected
    atoms, ensuring that their relative positions remain absolutely fixed.
    """
    if len(atom_indices) < 3:
        raise ValueError("At least 3 atoms are required to define a rigid body.")

    # Debug output using topology if provided, otherwise just the indices
    if topology is not None:
        atom_info = {
            atom.index: atom.element.name
            for atom in topology.atoms()
            if atom.index in atom_indices
        }
        print(f"Applying rigid body constraints to atoms: {atom_info}")
    else:
        print(f"Applying rigid body constraints to atoms: {atom_indices}")

    # Add constraints for each unique pair of atoms
    added_pairs = set()
    for i, a1 in enumerate(atom_indices):
        for a2 in atom_indices[i + 1 :]:
            pair = tuple(sorted((a1, a2)))
            if pair in added_pairs:
                continue
            pos1 = positions[a1]
            pos2 = positions[a2]
            # Compute Euclidean distance
            d = (
                (pos1[0] - pos2[0]) ** 2
                + (pos1[1] - pos2[1]) ** 2
                + (pos1[2] - pos2[2]) ** 2
            ) ** 0.5

            # Check if a constraint between these two atoms already exists
            exists = False
            num_constraints = system.getNumConstraints()
            for j in range(num_constraints):
                p1, p2, _ = system.getConstraintParameters(j)
                if (p1 == a1 and p2 == a2) or (p1 == a2 and p2 == a1):
                    exists = True
                    break
            if not exists:
                system.addConstraint(a1, a2, d)
                added_pairs.add(pair)
    print("Rigid body constraints applied successfully.")
    return system


def get_rigid_bodies(modeller, configs):
    """
    Returns a dictionary mapping rigid body names to a list of atom indices,
    based on the given configurations.

    Each configuration should contain:
        - "name": a name for the rigid body.
        - "segments": a list of segments, where each segment has:
            - "chain_id": the chain identifier.
            - "residues": either a dictionary with keys "start" and "stop" or an iterable of residue IDs.
    """
    rigid_bodies = {}

    for config in configs:
        name = config["name"]
        segments = config.get("segments", [])

        body_atoms = rigid_bodies.get(name, [])

        for segment in segments:
            chain_id = segment["chain_id"]
            residues_config = segment["residues"]
            if isinstance(residues_config, dict):
                start = residues_config["start"]
                stop = residues_config["stop"]
                residues = set(range(start, stop))
            else:
                residues = set(residues_config)

            for res in modeller.topology.residues():
                if res.chain.id == chain_id and int(res.id) in residues:
                    for atom in res.atoms():
                        body_atoms.append(atom.index)

        if body_atoms:
            rigid_bodies[name] = body_atoms

    return rigid_bodies


def create_rigid_bodies(system, positions, bodies):
    """Modify a System to turn specified sets of particles into rigid bodies.

    For every rigid body, four particles are selected as "real" particles whose positions are integrated.
    Constraints are added between them to make them move as a rigid body.  All other particles in the body
    are then turned into virtual sites whose positions are computed based on the "real" particles.

    Because virtual sites are massless, the mass properties of the rigid bodies will be slightly different
    from the corresponding sets of particles in the original system.  The masses of the non-virtual particles
    are chosen to guarantee that the total mass and center of mass of each rigid body exactly match those of
    the original particles.  The moment of inertia will be similar to that of the original particles, but
    not identical.

    Care is needed when using constraints, since virtual particles cannot participate in constraints.  If the
    input system includes any constraints, this function will automatically remove ones that connect two
    particles in the same rigid body.  But if there is a constraint between a particle in a rigid body and
    another particle not in that body, it will likely lead to an exception when you try to create a context.

    Parameters:
     - system (System) the System to modify
     - positions (list) the positions of all particles in the system
     - bodies (list) each element of this list defines one rigid body.  Each element should itself be a list
       of the indices of all particles that make up that rigid body.
    """
    # Remove any constraints involving particles in rigid bodies.

    for i in range(system.getNumConstraints() - 1, -1, -1):
        p1, p2, distance = system.getConstraintParameters(i)
        if any(p1 in body and p2 in body for body in bodies):
            # print(
            #     f"Removing constraint between particles {p1} and {p2} due to rigid body."
            # )
            system.removeConstraint(i)

    # Loop over rigid bodies and process them.

    for particles in bodies:
        if len(particles) < 5:
            # All the particles will be "real" particles.

            realParticles = particles
            realParticleMasses = [system.getParticleMass(i) for i in particles]
        else:
            # Select four particles to use as the "real" particles.  All others will be virtual sites.

            pos = [positions[i] for i in particles]
            mass = [system.getParticleMass(i) for i in particles]
            cm = unit.sum([p * m for p, m in zip(pos, mass)]) / unit.sum(mass)
            r = [p - cm for p in pos]
            avgR = unit.sqrt(unit.sum([unit.dot(x, x) for x in r]) / len(particles))
            rank = sorted(
                range(len(particles)), key=lambda i: abs(unit.norm(r[i]) - avgR)
            )
            for p in combinations(rank, 4):
                # Select masses for the "real" particles.  If any is negative, reject this set of particles
                # and keep going.

                matrix = np.zeros((4, 4))
                for i in range(4):
                    particleR = r[p[i]].value_in_unit(nanometer)
                    matrix[0][i] = particleR[0]
                    matrix[1][i] = particleR[1]
                    matrix[2][i] = particleR[2]
                    matrix[3][i] = 1.0
                rhs = np.array([0.0, 0.0, 0.0, unit.sum(mass).value_in_unit(unit.amu)])
                weights = lin.solve(matrix, rhs)
                if all(w > 0.0 for w in weights):
                    # We have a good set of particles.

                    realParticles = [particles[i] for i in p]
                    realParticleMasses = [float(w) for w in weights] * amu
                    break

        # Set particle masses.

        for i, m in zip(realParticles, realParticleMasses):
            system.setParticleMass(i, m)

        # Add constraints between the real particles.

        for p1, p2 in combinations(realParticles, 2):
            distance = unit.norm(positions[p1] - positions[p2])
            key = (min(p1, p2), max(p1, p2))
            system.addConstraint(p1, p2, distance)

        # Select which three particles to use for defining virtual sites.

        bestNorm = 0
        for p1, p2, p3 in combinations(realParticles, 3):
            d12 = (positions[p2] - positions[p1]).value_in_unit(nanometer)
            d13 = (positions[p3] - positions[p1]).value_in_unit(nanometer)
            crossNorm = unit.norm(
                (
                    d12[1] * d13[2] - d12[2] * d13[1],
                    d12[2] * d13[0] - d12[0] * d13[2],
                    d12[0] * d13[1] - d12[1] * d13[0],
                )
            )
            if crossNorm > bestNorm:
                bestNorm = crossNorm
                vsiteParticles = (p1, p2, p3)

        # Create virtual sites.

        d12 = (
            positions[vsiteParticles[1]] - positions[vsiteParticles[0]]
        ).value_in_unit(nanometer)
        d13 = (
            positions[vsiteParticles[2]] - positions[vsiteParticles[0]]
        ).value_in_unit(nanometer)
        cross = Vec3(
            d12[1] * d13[2] - d12[2] * d13[1],
            d12[2] * d13[0] - d12[0] * d13[2],
            d12[0] * d13[1] - d12[1] * d13[0],
        )
        matrix = np.zeros((3, 3))
        for i in range(3):
            matrix[i][0] = d12[i]
            matrix[i][1] = d13[i]
            matrix[i][2] = cross[i]
        for i in particles:
            if i not in realParticles:
                system.setParticleMass(i, 0)
                rhs = np.array(
                    (positions[i] - positions[vsiteParticles[0]]).value_in_unit(
                        nanometer
                    )
                )
                weights = lin.solve(matrix, rhs)
                system.setVirtualSite(
                    i,
                    omm.OutOfPlaneSite(
                        vsiteParticles[0],
                        vsiteParticles[1],
                        vsiteParticles[2],
                        weights[0],
                        weights[1],
                        weights[2],
                    ),
                )
