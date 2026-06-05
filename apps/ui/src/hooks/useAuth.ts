import { selectCurrentToken } from 'slices/authSlice'
import { jwtDecode } from 'jwt-decode'
import { useAppSelector } from 'app/hooks'

interface JwtPayload {
  UserInfo: BilboMDJwtPayload
}

interface BilboMDJwtPayload {
  username: string
  // Added in PR 3 of issue #817. Older access tokens issued before the
  // displayName claim was added won't have this; fall back to username
  // so the UI keeps working until the next refresh.
  displayName?: string
  roles: string[]
  email: string
}

const useAuth = () => {
  const token = useAppSelector(selectCurrentToken)
  let isManager = false
  let isAdmin = false
  let status = 'User'

  if (token) {
    const decoded = jwtDecode<JwtPayload>(token)
    const { username, displayName, roles, email } = decoded.UserInfo

    isManager = roles.includes('Manager')
    isAdmin = roles.includes('Admin')

    if (isManager) status = 'Manager'
    if (isAdmin) status = 'Admin'

    return {
      username,
      displayName: displayName || username,
      roles,
      status,
      isManager,
      isAdmin,
      email,
      isAuthenticated: true
    }
  }
  // Returned if we do not have a token
  return {
    username: '',
    displayName: '',
    roles: [],
    status,
    email: '',
    isManager,
    isAdmin,
    isAuthenticated: false
  }
}

export default useAuth
