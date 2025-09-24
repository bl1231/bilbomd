---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
---

Fix nodemailer `defaultLayout` which should be a string NOT a boolean, but also must be defined otherwise you get `main` as your email template. So it seems we need to define it as an empty string so that we can override it later with our custom template.
