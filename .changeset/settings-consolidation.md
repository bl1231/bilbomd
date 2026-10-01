---
'@bilbomd/mongodb-schema': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Bring all account settings into one place. Settings now has Profile, Notifications, Email, API Tokens and Delete account sections. Notifications was hidden from the menu before, and the change-email and delete-account forms only lived on `/dashboard/account`, which now redirects to `/settings` (the header menu's "Account" item is now "Settings"). ORCID users see a note instead of the change-email form, because ORCID sign-in finds accounts by the email on the ORCID record.

Deleting an account now deactivates it instead of removing it, so usage stats keep a record of every account. The user record gets a new `deletedAt` field; the username and email are replaced with `deleted-<id>` placeholders; names, sign-in links, refresh tokens and API tokens are cleared; and the copies of the username and email stored on jobs and usage events are replaced too. Deleted accounts are left out of the admin user list. Users can delete their account once no jobs are queued or running. Before, any job history at all blocked deletion. ORCID sign-in and API-token checks now refuse deactivated accounts too, as email sign-in already did.
