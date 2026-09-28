---
'@bilbomd/backend': patch
'@bilbomd/worker': patch
'@bilbomd/scoper': patch
---

The email template plugin is now registered once when each mailer module loads. Before, every email sent registered another copy on the shared transporter, so the plugin list kept growing and each email was rendered once per earlier registration.
