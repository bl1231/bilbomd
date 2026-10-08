import { Navigate } from 'react-router'
import useAuth from 'hooks/useAuth'

type RedirectIfAuthenticatedProps = {
  to: string
  children: React.ReactNode
}

// Wraps a public page that has a logged-in counterpart. Once SoftPersistLogin
// has restored a session, send the user to the authenticated version so a
// shared or hand-typed anonymous URL does not submit an anonymous job on
// behalf of a logged-in user.
const RedirectIfAuthenticated = ({
  to,
  children
}: RedirectIfAuthenticatedProps) => {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? (
    <Navigate
      to={to}
      replace
    />
  ) : (
    children
  )
}

export default RedirectIfAuthenticated
