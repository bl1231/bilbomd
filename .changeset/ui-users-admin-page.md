---
'@bilbomd/ui': minor
---

Redesign the Admin users pages. The users list now has a search box that matches name, username, email, and role, a "show inactive" toggle, flex-width columns with name, role chips, a status chip (Active / Inactive / Pending email), job count, last seen, and created date, and clicking a row opens the user. The edit page shows who is being edited with an identity card (sign-in method with ORCID link, last seen, email notifications, UUID) and a recent-jobs list, uses a checkbox group for roles and a switch for active, keeps Save disabled until something changes, confirms saves and deletes with a snackbar, blocks you from deactivating or demoting yourself, moves Delete into a danger zone that is disabled while the user still has jobs, and shows a clear "user not found" state for a bad id.
