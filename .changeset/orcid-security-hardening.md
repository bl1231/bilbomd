---
'@bilbomd/backend': minor
'@bilbomd/ui': patch
---

Security hardening for the ORCID OAuth login flow (PR 2 of issue #817).

- **Account-takeover guard.** The callback and the finalize endpoints now both refuse to issue JWTs when the verified ORCID email matches an existing BilboMD account that is not already linked to this ORCID iD. Users are redirected to `/auth/orcid-error?reason=email_already_registered` and pointed at a BilboMD administrator to link their account. Previously the flow would silently sign the user in as the pre-existing (e.g., legacy magic-link) account.
- **Require a primary, verified ORCID email.** The email-selection fallback that accepted any verified email — and then any email at all — has been removed. If an ORCID profile has no `primary && verified` email, the user is redirected to `/auth/orcid-error?reason=no_primary_verified` with instructions to update their ORCID profile. Closes the related "Pending status" dead code in the finalize handler.
- **Verify the ID token and check the nonce.** The hand-rolled axios `POST /oauth/token` is replaced with `openid-client.authorizationCodeGrant`, which validates the ID-token signature against the discovered JWKS, the `iss`/`aud` claims, the `nonce` (matched to the cookie set in `handleOrcidLogin`), and the `state`. Identity claims (`sub`, `given_name`, `family_name`, `name`) now come from the verified ID token rather than from a separate unauthenticated API call. The Public-API call is kept only for the email (not returned by the `openid` scope).
- **Tighten state/nonce cookies.** `handleOrcidLogin` cookies switched from `SameSite=None` to `SameSite=Lax` (ORCID redirects back to the same origin) and gained a 5-minute `maxAge` so abandoned sign-in flows cannot leave state behind.
- **Friendlier error page.** `OrcidError.tsx` now renders human-readable explanations for `no_primary_verified`, `email_already_registered`, `token_exchange`, `missing_id_token`, `userinfo_fetch`, `finalize`, and `session` reasons.
