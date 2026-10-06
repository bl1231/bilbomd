---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Validate and normalize experimental SAXS data the same way in the UI and the backend, so interactive and API-submitted jobs are treated equally. A single shared analyzer (`analyzeSaxsData`) now:

- Detects data in nm⁻¹ (from the file header, the q range and the Guinier Rg) and converts q to Å⁻¹; files whose units cannot be determined are rejected with a request to state them.
- Trims points below q = 0.005 Å⁻¹ and above q = 0.45 Å⁻¹ with a warning.
- Warns, but no longer rejects, when fewer than 100 points remain.

Job forms gain a "q units" selector (auto / Å⁻¹ / nm⁻¹) and show what will change in the file before submission. The API accepts the same `q_units` field and returns `saxs_warnings` with the job. Converted or trimmed files are rewritten in the job directory with the original kept as `<name>.orig`. SANS jobs are unchanged.
