---
'@bilbomd/mongodb-schema': minor
'@bilbomd/backend': minor
'@bilbomd/worker': minor
'@bilbomd/scoper': minor
---

Job-complete emails now link directly to a results page that works without logging in (#978). Every new job gets an unguessable `results_token`, the unauthenticated `/results/:publicId` endpoints accept it alongside anonymous `public_id`s, and the worker/scoper emails link to `/results/<token>` (falling back to the dashboard link for jobs created before the token existed).
