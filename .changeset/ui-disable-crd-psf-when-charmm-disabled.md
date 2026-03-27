---
'@bilbomd/ui': patch
---

Disable CRD/PSF input toggle when CHARMM engine is disabled. When ENABLE_CHARMM_ENGINE=false, the CRD/PSF mode checkbox is now greyed out alongside the CHARMM md_engine option since CRD/PSF inputs are only used with CHARMM.
