---
'@bilbomd/ui': minor
---

Improve UI for mobile devices (#967, part 5: public/anonymous results page). The public job status page (`/results/:publicId`) now fits phone screens: the Public Job ID and Results Permalink rows wrap with ellipsized copyable chips, the Progress row wraps instead of crushing the progress bar, and the Analysis tabs scroll when they don't fit. The SAXS feedback chart (Chi²/Residuals vs. Q ranges) is now responsive via ResponsiveContainer instead of a fixed 600px width, movie gallery cards truncate long titles instead of pushing the Download button out of the card, and all three layout footers wrap on narrow screens (fixing the "GitHub" link rendering one letter per line). Desktop rendering is unchanged.
