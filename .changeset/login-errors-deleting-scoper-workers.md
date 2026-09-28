---
'@bilbomd/ui': patch
---

Three fixes from dev testing:
- The MagickLink sign-in page now says why sign-in failed. It had checked for the error shape of the wrong HTTP library, so every failure showed "No Server Response2". "Too many attempts" (with the server's own message), an invalid or expired link, and an unreachable server each get their own message.
- A job whose deletion is pending now shows its "Deleting" status in red, in the jobs table and on mobile cards.
- A queue with no workers stands out: its Workers count turns red and a warning explains that its jobs will wait. SCOPER is warned about only when it's enabled. The SCOPER job form warns before you submit when no SCOPER worker is running (for signed-in users).
