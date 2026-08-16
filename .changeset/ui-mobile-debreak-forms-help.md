---
'@bilbomd/ui': minor
---

Improve UI for mobile devices (#967, part 4: de-breaking pass). All job forms (Classic, Auto, AF, OF3, SANS, Scoper, Multi, resubmit variants, PAE Jiffy) replace hardcoded 520px/400px widths with fluid max-widths, title rows and AF/OF3 entity rows wrap on small screens, and the Help page stacks its pipelines section, scroll-contains its tabs, and wraps the BibTeX block. The inp Jiffy and PAE Jiffy nav items are hidden from the mobile drawer (still available on desktop and by URL). Every page now renders with zero horizontal overflow at phone widths; desktop rendering is unchanged.
