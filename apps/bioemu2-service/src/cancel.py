"""Cancellation requests for BioEmu2 runs: stdlib only, so tests need no GPU stack.

A run cannot be interrupted inside a BioEmu2 sampling call, so cancelling is cooperative:
POST /cancel marks the job, and the sampler checks the mark before each Rg target and
again before it writes that target's structures. Only jobs that are queued or running can
be marked, so a late cancel cannot stop a later resubmission of the same job.
"""

from __future__ import annotations

import threading


class SamplingCancelled(RuntimeError):
    """The worker cancelled the job while it was queued or sampling."""


class CancelRegistry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, int] = {}  # uuid -> requests queued or running
        self._cancelled: set[str] = set()

    def begin(self, uuid: str) -> None:
        with self._lock:
            self._active[uuid] = self._active.get(uuid, 0) + 1

    def end(self, uuid: str) -> None:
        with self._lock:
            left = self._active.get(uuid, 0) - 1
            if left > 0:
                self._active[uuid] = left
            else:
                self._active.pop(uuid, None)
                self._cancelled.discard(uuid)

    def request(self, uuid: str) -> bool:
        """Mark a queued or running job as cancelled. False if the job is not active."""
        with self._lock:
            if uuid not in self._active:
                return False
            self._cancelled.add(uuid)
            return True

    def is_cancelled(self, uuid: str) -> bool:
        with self._lock:
            return uuid in self._cancelled
