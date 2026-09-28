---
'@bilbomd/ui': patch
---

Share one job event stream between all of a browser's tabs. Over HTTP/1.1 a browser keeps at most 6 connections open per site across all tabs, and each open event stream holds one, so with a stream per tab a sixth BilboMD tab left no connection for anything else and hung. The tabs now elect one leader with a Web Lock; it holds the stream and rebroadcasts events over a BroadcastChannel, and another tab takes over when it closes. Logged-in tabs share one stream per user, and public job pages one per job. Browsers without Web Locks or BroadcastChannel keep a stream per tab.
