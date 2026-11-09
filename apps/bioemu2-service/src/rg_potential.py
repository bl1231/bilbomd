"""Cα radius-of-gyration steering potential for BioEmu2 (bilbomd#1200).

Ported unchanged from the Phase 0 benchmark (bioemu-tests/benchmark/rg_potential.py),
where it was validated on nine BilboMD test systems.

BilboMD's OpenMM MD restrains the Rg of the protein Cα atoms (nucleic acids and glycans
are left free). Steering only the Cα atoms would move just those atoms, so the energy
acts on the Rg of all protein heavy atoms, with the target shifted by each structure's
own (heavy − Cα) offset, detached from the gradient. No input model is needed, and the
achieved Cα Rg lands on the BilboMD target directly.
"""

import torch
from bioemu2 import Potential


def _rg(x: torch.Tensor) -> torch.Tensor:
    centred = x - x.mean(dim=1, keepdim=True)
    return centred.pow(2).sum(-1).mean(-1).clamp_min(1e-6).sqrt()


class CaRgPotential(Potential):
    """E = 0.5 * N * max(|Rg_heavy - (target + offset)| - tolerance, 0)², in Å.

    offset = Rg_heavy - Rg_CA of the current structure, detached. Scaling by the
    heavy-atom count N makes one guidance step of weight w move Rg by about
    w * (Rg - target), independent of system size.
    """

    def __init__(self, target_ca_angstrom: float, weight: float = 0.02, tolerance: float = 0.0):
        self.target = target_ca_angstrom
        self.weight = weight
        self.tolerance = tolerance
        self.heavy: torch.Tensor | None = None
        self.ca: torch.Tensor | None = None

    def prepare(self, system) -> None:
        atoms = [a for a in system.topology.atoms if a.residue.is_protein]
        self.heavy = torch.tensor([a.index for a in atoms if a.element.symbol != "H"])
        self.ca = torch.tensor([a.index for a in atoms if a.name == "CA"])
        if len(self.ca) == 0:
            raise ValueError("CaRgPotential needs at least one protein chain")

    def __call__(self, coords_angstrom: torch.Tensor, *, t: float) -> torch.Tensor:
        dev = coords_angstrom.device
        heavy = coords_angstrom[:, self.heavy.to(dev)]
        rg_heavy = _rg(heavy)
        offset = (rg_heavy - _rg(coords_angstrom[:, self.ca.to(dev)])).detach()
        excess = torch.relu((rg_heavy - (self.target + offset)).abs() - self.tolerance)
        return 0.5 * heavy.shape[1] * excess.pow(2)

    def compute_parameters(self, t: float) -> dict:
        return {"guidance_weight": self.weight, "guidance_interval": 1, "resampling_weight": 1.0}
