import { useRoutes } from 'react-router'

import { LoginRoutes } from './LoginRoutes'
import { ProtectedMainRoutes } from './MainRoutes'
import { AnonRoutes } from './AnonRoutes'
import { PublicResultsRoutes } from './PublicResultsRoutes'

export default function ThemeRoutes() {
  return useRoutes([
    AnonRoutes,
    PublicResultsRoutes,
    LoginRoutes,
    ProtectedMainRoutes
  ])
}
