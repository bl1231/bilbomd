---
'@bilbomd/ui': minor
---

Redesign the header's account menu and color theme control, and fix dark mode across the app.

The account button now shows initials, name and role. Its menu holds a Light / System / Dark theme switch, the signed-in email, the account links and a red Log out. The theme choice is saved between visits, and "System" follows the OS. Signed-out headers get a compact sun/moon icon toggle.

Dark mode no longer shows light panels with unreadable text. This covers the Privacy, Funding, Terms and Copyright pages, the Admin and API Tokens pages, the Welcome and BibTeX boxes, the Classic and Inp Jiffy example accordions, the rigid-body editor, the pale status chips, and the job page's analysis tabs. Section headers and wrapper panels now take their colors from the theme. Figures drawn for white pages sit on a white card. Light mode is unchanged.
