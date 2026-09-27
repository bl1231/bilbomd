---
'@bilbomd/worker': patch
---

Fix multi jobs reporting success when MultiFoXS or results gathering fails. Those steps used to swallow their errors: the step was marked Error, but the job carried on, was marked Completed, and the user got a success email. A failing step now fails the job. The job's status is set to Error, no completion email is sent, and BullMQ records the run as failed. A failure in any other multi step (e.g. building the `.dat` file list) also marks the job as Error, where before it stayed at Running.
