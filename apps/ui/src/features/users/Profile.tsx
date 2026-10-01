import type { ReactNode } from 'react'
import { Box, Chip, Link, Stack, Typography } from '@mui/material'
import useAuth from 'hooks/useAuth'
import SettingsSection from './SettingsSection'
import { getOrcidId } from './orcid'

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box>
    <Typography
      variant="caption"
      color="text.secondary"
    >
      {label}
    </Typography>
    <Box>{children}</Box>
  </Box>
)

const Profile = () => {
  const { username, displayName, email, roles } = useAuth()
  const orcidId = getOrcidId(username)

  return (
    <SettingsSection title="Profile">
      <Stack spacing={2}>
        <Field label="Name">
          <Typography>{displayName}</Typography>
        </Field>
        <Field label="Email">
          <Typography>{email}</Typography>
        </Field>
        <Field label="Sign-in method">
          {orcidId ? (
            <Typography>
              ORCID iD{' '}
              <Link
                href={`https://orcid.org/${orcidId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {orcidId}
              </Link>
            </Typography>
          ) : (
            <Typography>Emailed sign-in code</Typography>
          )}
        </Field>
        <Field label="Roles">
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 0.5 }}
          >
            {roles.map((role) => (
              <Chip
                key={role}
                label={role}
                size="small"
              />
            ))}
          </Stack>
        </Field>
      </Stack>
    </SettingsSection>
  )
}

export default Profile
