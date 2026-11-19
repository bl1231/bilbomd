"""Pick the atoms the MD radius-of-gyration restraint and Rg/Dmax tracking use.

One atom per polymer residue: CA for amino acids and P for nucleotides. A
DNA- or RNA-only model has no CA atoms, so selecting CA alone left the Rg
restraint with nothing to act on and crashed MD at the first report. Glycan
chains and most ligands have neither atom, so they stay out of the Rg, as
they did when the selection was CA only.

Kept free of OpenMM imports so it can be unit-tested without the conda stack;
it only reads ``name``, ``element.symbol`` and ``residue.atoms()``, which
``openmm.app.Topology`` atoms provide.
"""

from typing import Iterable, Protocol

# Sugar carbon that marks a nucleotide; older PDB files write the prime as "*".
_NUCLEOTIDE_SUGAR_ATOMS = {"C1'", "C1*"}


class _Element(Protocol):
    symbol: str


class _Residue(Protocol):
    def atoms(self) -> Iterable["_Atom"]: ...


class _Atom(Protocol):
    index: int
    name: str
    element: _Element | None
    residue: _Residue


def _element_is(atom: _Atom, symbol: str) -> bool:
    # Trust the name alone when the element is unknown.
    return atom.element is None or atom.element.symbol == symbol


def _is_nucleotide(residue: _Residue) -> bool:
    return any(a.name in _NUCLEOTIDE_SUGAR_ATOMS for a in residue.atoms())


def is_rg_atom(atom: _Atom) -> bool:
    """True for a protein CA or a nucleotide backbone P."""
    if atom.name == "CA":
        # A calcium ion is also named CA; its element is Ca, not C.
        return _element_is(atom, "C")
    if atom.name == "P":
        # Phosphorylated amino acids (SEP, TPO, PTR) also carry a P; they have
        # no sugar ring, so requiring C1' keeps them out.
        return _element_is(atom, "P") and _is_nucleotide(atom.residue)
    return False


def select_rg_atom_indices(atoms: Iterable[_Atom]) -> list[int]:
    """Indices of the protein CA and nucleotide P atoms, in topology order.

    Raises ValueError when there are none, so MD stops with a clear message
    instead of crashing on an empty selection partway through the run.
    """
    indices = [atom.index for atom in atoms if is_rg_atom(atom)]
    if not indices:
        raise ValueError(
            "No protein CA or nucleic acid P atoms found, so the radius of "
            "gyration restraint has no atoms to act on. BilboMD needs a "
            "protein, DNA or RNA chain in the model."
        )
    return indices
