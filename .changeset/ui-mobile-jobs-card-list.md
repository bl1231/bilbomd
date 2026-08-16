---
'@bilbomd/ui': minor
---

Improve UI for mobile devices (#967, part 2: jobs list). Below the md breakpoint the jobs DataGrid is replaced by a tappable status card list: each card shows a color-coded status chip, title, pipeline/engine/relative-time metadata, and a progress bar for running jobs. Active jobs sort first and tapping a card opens the job detail page. Also fixes the mobile hamburger button to toggle (not just open) the nav drawer. The BullMQ status panel wraps its queue stats instead of overflowing on narrow screens, with compact count chips below the sm breakpoint so all three stats fit on one line on real phones (e.g. iPhone 15 Pro at 393px). Desktop keeps the full DataGrid.
