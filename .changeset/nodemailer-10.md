---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

Upgrade nodemailer to 10.0.12. Replace @types/nodemailer-express-handlebars with local types that match nodemailer 10's bundled types, and add tests that render every mailer template through the real nodemailer and handlebars plugin.
