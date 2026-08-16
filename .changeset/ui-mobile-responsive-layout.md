---
'@bilbomd/ui': minor
---

Improve UI for mobile devices (#967, part 1: layout shell). The sidebar now collapses into a hamburger-menu drawer below the md breakpoint, shared between MainLayout and AnonLayout via a new NavDrawer component. Headers adapt on small screens (compact logo, icon-only dark-mode toggle, hidden version/username badges) and the main content area gains overflow guards so wide pages no longer break the layout. Desktop layout is unchanged.
