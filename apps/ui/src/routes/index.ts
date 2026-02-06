import { useRoutes } from 'react-router'

import { LoginRoutes } from './LoginRoutes'
import { ProtectedMainRoutes } from './MainRoutes'
import { AnonRoutes } from './AnonRoutes'

export default function ThemeRoutes() {
  return useRoutes([AnonRoutes, LoginRoutes, ProtectedMainRoutes])
}
