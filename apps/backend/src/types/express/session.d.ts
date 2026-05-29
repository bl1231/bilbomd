// src/types/express/session.d.ts

import 'express-session'

declare module 'express-session' {
  interface SessionData {
    orcidProfile?: {
      email: string
      emailReason?: string
      givenName?: string
      familyName?: string
      orcidId: string
      name?: string
    }
  }
}
