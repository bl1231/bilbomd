"""Tests for fixed-body residue selection in fixed_bodies.py (#1101).

A fixed segment's residue range includes both ends, as CHARMM's
`resid start:stop` does and as the rigid bodies (rigid_body.py) do.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

# Skip (rather than error) where the OpenMM stack is unavailable, e.g. the
# lightweight CI job. These tests run for real inside the worker image.
pytest.importorskip("openmm")

from openmm import System, Vec3, unit  # noqa: E402
from openmm.app import Element, Topology  # noqa: E402

from utils.fixed_bodies import (  # noqa: E402
    apply_fixed_body_constraints,
    apply_fixed_body_constraints_zero_mass,
)
from utils.rigid_body import get_rigid_bodies  # noqa: E402

CARBON = Element.getBySymbol("C")


def make_model(chains: dict[str, range]):
    """Two atoms per residue, residues numbered as given, one System particle per atom."""
    topology = Topology()
    system = System()
    positions = []
    for chain_id, residue_ids in chains.items():
        chain = topology.addChain(id=chain_id)
        for res_id in residue_ids:
            residue = topology.addResidue("ALA", chain, id=str(res_id))
            for name in ("N", "CA"):
                topology.addAtom(name, CARBON, residue)
                system.addParticle(12.0)
                positions.append(Vec3(0.1 * len(positions), 0.0, 0.0))
    modeller = SimpleNamespace(topology=topology, positions=positions * unit.nanometer)
    return system, modeller


def residues_of(modeller, atom_indices) -> list[tuple[str, int]]:
    atoms = list(modeller.topology.atoms())
    return sorted({(atoms[i].residue.chain.id, int(atoms[i].residue.id)) for i in atom_indices})


def fixed(chain_id: str, start: int, stop: int):
    return [
        {
            "name": "FixedBody1",
            "segments": [{"chain_id": chain_id, "residues": {"start": start, "stop": stop}}],
        }
    ]


def restrained_residues(system, modeller):
    force = system.getForce(system.getNumForces() - 1)
    indices = [force.getParticleParameters(i)[0] for i in range(force.getNumParticles())]
    return residues_of(modeller, indices)


def massless_residues(system, modeller):
    indices = [
        i for i in range(system.getNumParticles()) if system.getParticleMass(i).value_in_unit(unit.amu) == 0
    ]
    return residues_of(modeller, indices)


def test_restraints_include_both_ends():
    system, modeller = make_model({"A": range(1, 8), "B": range(1, 8)})
    apply_fixed_body_constraints(system, modeller, fixed("A", 2, 4))
    assert restrained_residues(system, modeller) == [("A", 2), ("A", 3), ("A", 4)]


def test_a_single_residue_is_restrained():
    system, modeller = make_model({"A": range(1, 8)})
    apply_fixed_body_constraints(system, modeller, fixed("A", 5, 5))
    assert restrained_residues(system, modeller) == [("A", 5)]


def test_zero_mass_includes_both_ends():
    system, modeller = make_model({"A": range(1, 8), "B": range(1, 8)})
    apply_fixed_body_constraints_zero_mass(system, modeller, fixed("B", 6, 7))
    assert massless_residues(system, modeller) == [("B", 6), ("B", 7)]


def test_fixed_and_rigid_select_the_same_residues():
    system, modeller = make_model({"A": range(10, 30)})
    config = fixed("A", 12, 20)
    apply_fixed_body_constraints(system, modeller, config)
    rigid = get_rigid_bodies(modeller, config)
    assert restrained_residues(system, modeller) == residues_of(modeller, rigid["FixedBody1"])
