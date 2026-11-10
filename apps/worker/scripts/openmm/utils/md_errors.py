"""Classify MD failures so the worker can show users a meaningful error.

Kept free of OpenMM imports so it can be unit-tested without the conda stack.
"""

import re

# Marker the Node worker (openmm-functions.ts) greps for on stderr. Keep the two
# in sync, the same way BILBOMD_CPU_FALLBACK is shared.
UNSTABLE_MARKER = "BILBOMD_MD_UNSTABLE:"

_NAN_RE = re.compile(r"\bnan\b", re.IGNORECASE)


def is_nan_error(exc: BaseException) -> bool:
    """True when an exception reports NaN coordinates/energies.

    OpenMM raises these as OpenMMException ("Particle coordinate is NaN") from
    the integrator, or as ValueError ("Particle position is NaN") from a
    reporter, so match on the message rather than the exception type.
    """
    return bool(_NAN_RE.search(str(exc)))


def unstable_message(rg: float, exc: BaseException) -> str:
    """One-line, marker-prefixed description of an unstable MD run."""
    return (
        f"{UNSTABLE_MARKER} rg={rg:g} simulation became numerically unstable "
        f"(NaN coordinates): {exc}"
    )
