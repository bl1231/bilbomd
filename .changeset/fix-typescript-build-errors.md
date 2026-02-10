---
'@bilbomd/mongodb-schema': patch
'@bilbomd/worker': patch
'@bilbomd/backend': patch
---

Fix TypeScript build errors related to schema type inference and ObjectId type handling. Added explicit type annotations to assetsSchema and resultsSchema to resolve BSON dependency issues. Updated worker and backend to properly handle user field as either ObjectId or populated IUser object.
