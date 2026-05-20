---
'@bilbomd/backend': minor
'@bilbomd/mongodb-schema': minor
'@bilbomd/ui': minor
---

ORCID data hygiene & UX (PR 3 of issue #817). Separates the internal `username` (an opaque, URL-safe identifier) from the human-readable `displayName`, removes dead OAuth-token storage, and aligns the sign-in UI with ORCID's official branding guidelines.

**Option A: separate internal ID from display label**
- ORCID accounts now get an opaque `username = orcid-${orcidId}` (e.g., `orcid-0000-0002-1234-5678`). Deterministic, unique by construction, URL-safe, and decoupled from any human name.
- New backend helper `userDisplayName()` derives a display label from `firstName + lastName`, falling back to `username` for legacy users with no name fields populated.
- Access-token JWT payload now includes a `displayName` claim, computed at sign time. The UI `useAuth` hook exposes it; legacy tokens without the claim fall back to `username`.
- UI display sites (`Breadcrumbs`, `Settings` → `UserAvatar`) now show `displayName` instead of `username`. URL routes, job-ownership filters, and admin-edit forms still use `username`.
- Admin-edit username regex relaxed from `[a-zA-Z0-9_]+` to `[a-zA-Z0-9_-]+` so ORCID-derived usernames pass validation.

**H3: stop persisting ORCID access/refresh tokens**
- Dropped `accessToken`, `refreshToken`, `tokenType`, `scope`, and `expiresIn` from the User schema `oauth[]` subdocument and from the OAuth session profile. We never call ORCID APIs on the user's behalf after sign-in, so persisting the bearer token only enlarged the blast radius if the database were leaked. Existing data on old user docs is harmless and will fall off on next login.

**H4: confirmation page becomes read-only**
- `OrcidConfirmation` is no longer a misleading editable form — Formik + Yup + `TextField` are gone. Replaced with read-only display rows that surface First Name, Last Name, Email, ORCID iD, the derived BilboMD display name, and the opaque BilboMD account ID. Clicking "Confirm and Continue" calls finalize with an empty body (the backend has always trusted the session profile, not the request body).

**L4: branding text**
- `Login.tsx` heading and button updated from "Sign in with ORCID" to "Sign in with ORCID iD" per ORCID's official sign-in guidelines.

**L5: ORCID brand asset**
- The existing `apps/ui/src/assets/orcid.png` is the ORCID wordmark. ORCID's sign-in guidelines call for the circular green iD icon on sign-in buttons; the wordmark is for "about" contexts. Flagged for replacement before the production-credential review demo.
