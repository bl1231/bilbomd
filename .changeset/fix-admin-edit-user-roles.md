---
'@bilbomd/backend': patch
'@bilbomd/ui': patch
---

Fix Admin "Edit User" failing with "Invalid username format" when changing a user's roles. The backend no longer requires (or changes) the username on update — admins edit roles, active status, and email only. The username is now shown read-only in the form. Added real client-side validation (valid email, at least one role) and a friendly duplicate-email check on the backend.
