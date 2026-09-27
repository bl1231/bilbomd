---
'@bilbomd/bilbomd-types': minor
'@bilbomd/backend': minor
'@bilbomd/ui': minor
---

Add χ²free (Rambo & Tainer 2013) and volatility of ratio, Vr (Hura et al. 2013), to the FoXS fit results (beta). The backend computes both for the original model and every ensemble size from the fit curves it already serves, so existing completed jobs get them too. The UI shows a new "Fit quality" table with χ², χ²free and Vr per fit. Dmax is estimated as 3 × the Guinier Rg (there is no P(r) step yet), χ²free is the median over 1000 seeded random one-point-per-Shannon-channel subsets, and Vr uses q ≤ 0.3 Å⁻¹.
