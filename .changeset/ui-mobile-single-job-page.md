---
'@bilbomd/ui': minor
---

Improve UI for mobile devices (#967, part 3: single job page). FoXS analysis charts (Classic and Scoper) stack full-width below the md breakpoint instead of being crushed into half-width columns, and the ensemble model table no longer overflows. The Molstar viewer shrinks to 420px tall on small screens and gains a tap-to-enable overlay so its canvas no longer hijacks page scrolling on touch devices (also applies to the public results page). The separate Nav/Back panel is replaced by a back arrow inline with the job title (desktop and mobile). The Steps and Details accordions are decrowded: step chips keep their full labels with messages wrapping beneath, detail rows wrap instead of overflowing, and the UUID chip ellipsizes so its copy button stays reachable.
