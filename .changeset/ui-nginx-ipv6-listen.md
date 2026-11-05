---
'@bilbomd/ui': patch
---

The UI's nginx now also listens on IPv6 (`[::]:80`) when the container has an IPv6 stack, so the UI is reachable on IPv6-only Kubernetes clusters such as Berkelium. Deployments without IPv6 keep the IPv4-only listener.
