---
'@bilbomd/mongodb-schema': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
'@bilbomd/worker': minor
'@bilbomd/scoper': minor
---

Let users turn off job emails. Settings → Preferences now has a switch, saved as `User.emailNotifications` (on by default, including for existing users), with new `GET`/`PATCH /users/me/preferences` endpoints. The worker and SCOPER skip job complete/failed emails for users who turned them off. Email footers no longer link to the nonexistent `bilbomd.als.lbl.gov` host or to the account-deletion page: job emails link to `{{url}}/settings/preferences`, account emails (sign-in codes, magic links, sign-up) drop the "Unsubscribe" link since they are always sent, and "contact support" links go to bilbomd@lbl.gov.
