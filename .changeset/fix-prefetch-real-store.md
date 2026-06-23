---
'@bilbomd/ui': patch
'@bilbomd/backend': patch
---

Fix the `Prefetch` component so it dispatches into the real app store via `useAppDispatch` instead of creating a throw-away store with `setupStore()`. Previously every prefetch request went out without an Authorization header (the throw-away store had no auth state) and silently 401'd, so the component did no useful caching. Also skip prefetching the user list for non-Manager/Admin users since they can't view it.

Close backend authorization gaps on the `/users` routes. Administrative endpoints (`GET /users`, `PATCH /users`, `GET /users/:id`, `DELETE /users/:id`) now require the Manager/Admin role via `verifyRoles` — previously any authenticated user could list all users, edit arbitrary users (including escalating their own roles to Admin), or delete users. Self-service endpoints (`DELETE /users/delete-user-by-username/:username`, `POST /users/change-email`, `/verify-otp`, `/resend-otp`) now enforce account ownership via a new `verifyAccountOwnership` middleware, so callers can only act on their own account.
