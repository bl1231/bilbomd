"""Tests for the stdlib-only cancellation registry of the BioEmu2 service."""

from cancel import CancelRegistry


def test_only_active_jobs_can_be_cancelled():
    reg = CancelRegistry()
    assert reg.request("a") is False
    assert reg.is_cancelled("a") is False

    reg.begin("a")
    assert reg.request("a") is True
    assert reg.is_cancelled("a") is True
    assert reg.is_cancelled("b") is False


def test_a_finished_run_leaves_no_mark_for_a_resubmission():
    reg = CancelRegistry()
    reg.begin("a")
    reg.request("a")
    reg.end("a")
    assert reg.is_cancelled("a") is False

    reg.begin("a")
    assert reg.is_cancelled("a") is False


def test_mark_survives_until_every_request_for_the_job_has_ended():
    reg = CancelRegistry()
    reg.begin("a")
    reg.begin("a")
    reg.request("a")
    reg.end("a")
    assert reg.is_cancelled("a") is True
    reg.end("a")
    assert reg.is_cancelled("a") is False
    assert reg.request("a") is False
