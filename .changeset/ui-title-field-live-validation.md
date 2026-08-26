---
'@bilbomd/ui': patch
---

Improve job title input UX across all job forms. The Title box now caps typing at 30 characters and shows a live character counter (e.g. `12/30`) that switches to the validation message once the field is touched, so users get immediate feedback instead of only discovering the limit on submit. The title input and its Yup validation were factored into a shared `TitleField` component and `titleSchema` helper, and the Classic job's inconsistent 24-character cap was normalized to 30 to match every other job type. Fixes #1010.
