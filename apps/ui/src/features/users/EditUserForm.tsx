import { useMemo, useState, type ReactNode } from 'react'
import { useSelector } from 'react-redux'
import { Link as RouterLink, useNavigate } from 'react-router'
import { Form, Formik, type FormikHelpers } from 'formik'
import { useSnackbar } from 'notistack'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import Grid from '@mui/material/Grid'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import type { UserDTO, UserRole } from '@bilbomd/bilbomd-types'
import {
  useUpdateUserMutation,
  useDeleteUserMutation
} from 'slices/usersApiSlice'
import { useGetJobsQuery, selectAllJobs } from 'slices/jobsApiSlice'
import useAuth from 'hooks/useAuth'
import { ROLES } from 'config/roles'
import { editUserSchema } from 'schemas/ValidationSchemas'
import {
  formatDateSafe,
  formatRelativeDateSafe,
  parseDateSafe
} from 'utils/dates'
import { userDisplayName } from 'utils/userDisplayName'
import { getErrorMessage } from 'utils/apiError'
import { getOrcidId } from './orcid'
import { userStatusColor, userStatusLabel } from './usersListHelpers'

interface EditUserFormProps {
  user: UserDTO
}

interface EditUserFormValues {
  email: string
  active: boolean
  roles: UserRole[]
}

const RECENT_JOBS_LIMIT = 10

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

const Section = ({
  title,
  children,
  danger = false
}: {
  title: string
  children: ReactNode
  danger?: boolean
}) => (
  <Paper
    variant="outlined"
    sx={{ p: 2, ...(danger && { borderColor: 'error.main' }) }}
  >
    <Typography
      variant="h6"
      component="h2"
      color={danger ? 'error' : 'text.primary'}
      gutterBottom
    >
      {title}
    </Typography>
    {children}
  </Paper>
)

const EditUserForm = ({ user }: EditUserFormProps) => {
  const navigate = useNavigate()
  const { enqueueSnackbar } = useSnackbar()
  const { username: currentUsername } = useAuth()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [updateUser] = useUpdateUserMutation()
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation()

  // TODO: this pulls the whole jobs list (every job, for an Admin) and
  // filters client-side. Replace with a per-user jobs endpoint.
  useGetJobsQuery('jobsList')
  const allJobs = useSelector(selectAllJobs)
  const userJobs = useMemo(
    () =>
      allJobs
        .filter((job) => job.mongo?.user?.id === user.id)
        .sort(
          (a, b) =>
            (parseDateSafe(b.mongo.time_submitted)?.getTime() ?? 0) -
            (parseDateSafe(a.mongo.time_submitted)?.getTime() ?? 0)
        ),
    [allJobs, user.id]
  )

  const displayName = userDisplayName(user)
  const orcidId = getOrcidId(user.username)
  const statusLabel = userStatusLabel(user)
  const isSelf = user.username === currentUsername
  const jobCount = user.jobCount ?? userJobs.length
  const lastAccess = parseDateSafe(user.lastAccess)

  let deleteBlockedReason: string | null = null
  if (isSelf) deleteBlockedReason = 'You cannot delete your own account.'
  else if (jobCount > 0)
    deleteBlockedReason =
      'Users with jobs cannot be deleted. Delete their jobs first.'

  const initialValues: EditUserFormValues = {
    email: user.email,
    active: user.active,
    roles: user.roles
  }

  const handleSubmit = async (
    values: EditUserFormValues,
    helpers: FormikHelpers<EditUserFormValues>
  ) => {
    try {
      await updateUser({
        id: user.id,
        roles: values.roles,
        active: values.active,
        email: values.email
      }).unwrap()
      enqueueSnackbar(`${displayName} updated`, { variant: 'success' })
      helpers.resetForm({ values })
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to update user'), {
        variant: 'error'
      })
    }
  }

  const handleDelete = async () => {
    setConfirmOpen(false)
    try {
      await deleteUser({ id: user.id }).unwrap()
      enqueueSnackbar(`${displayName} deleted`, { variant: 'success' })
      void navigate('/dashboard/users')
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, 'Failed to delete user'), {
        variant: 'error'
      })
    }
  }

  const roleOptions = Object.values(ROLES) as UserRole[]

  return (
    <Box>
      <Button
        component={RouterLink}
        to="/dashboard/users"
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 1 }}
      >
        Users
      </Button>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}
      >
        <Typography
          variant="h5"
          component="h1"
        >
          {displayName}
        </Typography>
        <Chip
          label={statusLabel}
          size="small"
          color={userStatusColor(statusLabel)}
        />
        {isSelf && (
          <Chip
            label="This is you"
            size="small"
            variant="outlined"
          />
        )}
      </Stack>

      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2}>
            <Section title="Identity">
              <Stack spacing={1.5}>
                <Field label="Username">
                  <Typography sx={{ fontFamily: 'monospace' }}>
                    {user.username}
                  </Typography>
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
                    <Typography>
                      {user.oauthProviders?.length
                        ? user.oauthProviders.join(', ')
                        : 'Emailed sign-in code'}
                    </Typography>
                  )}
                </Field>
                <Field label="Last seen">
                  <Typography>
                    {lastAccess
                      ? `${formatRelativeDateSafe(lastAccess)} (${formatDateSafe(lastAccess)})`
                      : 'Never'}
                  </Typography>
                </Field>
                <Field label="Created">
                  <Typography>{formatDateSafe(user.createdAt)}</Typography>
                </Field>
                <Field label="Last modified">
                  <Typography>{formatDateSafe(user.updatedAt)}</Typography>
                </Field>
                <Field label="Email notifications">
                  <Typography>
                    {user.emailNotifications === false ? 'Off' : 'On'}
                  </Typography>
                </Field>
                {user.UUID && (
                  <Field label="UUID">
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                    >
                      {user.UUID}
                    </Typography>
                  </Field>
                )}
              </Stack>
            </Section>

            <Section title={`Jobs (${jobCount})`}>
              {userJobs.length === 0 ? (
                <Typography color="text.secondary">
                  No jobs for this user.
                </Typography>
              ) : (
                <List
                  dense
                  disablePadding
                >
                  {userJobs.slice(0, RECENT_JOBS_LIMIT).map((job) => (
                    <ListItemButton
                      key={job.mongo.id}
                      component={RouterLink}
                      to={`/dashboard/jobs/${job.mongo.id}`}
                      sx={{ px: 1 }}
                    >
                      <ListItemText
                        primary={job.mongo.title}
                        secondary={`${job.mongo.status} · ${formatDateSafe(job.mongo.time_submitted, 'yyyy-MM-dd HH:mm')}`}
                        slotProps={{ primary: { noWrap: true } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
              {userJobs.length > 0 && (
                <Link
                  component={RouterLink}
                  to={`/dashboard/jobs?user=${encodeURIComponent(user.username)}`}
                  sx={{ display: 'inline-block', mt: 1 }}
                >
                  View all jobs by this user
                </Link>
              )}
            </Section>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <Section title="Account">
              <Formik
                initialValues={initialValues}
                validationSchema={editUserSchema}
                onSubmit={handleSubmit}
                enableReinitialize
              >
                {({
                  values,
                  errors,
                  touched,
                  dirty,
                  isSubmitting,
                  handleChange,
                  handleBlur,
                  setFieldValue
                }) => (
                  <Form noValidate>
                    <Stack spacing={3}>
                      <TextField
                        name="email"
                        id="email"
                        label="Email"
                        type="email"
                        autoComplete="off"
                        fullWidth
                        disabled={isSubmitting}
                        value={values.email}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={touched.email && Boolean(errors.email)}
                        helperText={touched.email && errors.email}
                      />

                      <FormControl>
                        <FormControlLabel
                          control={
                            <Switch
                              name="active"
                              checked={values.active}
                              onChange={handleChange}
                              disabled={isSubmitting || isSelf}
                            />
                          }
                          label={values.active ? 'Active' : 'Inactive'}
                        />
                        <FormHelperText>
                          {isSelf
                            ? 'You cannot deactivate your own account.'
                            : 'Inactive users cannot sign in or submit jobs.'}
                        </FormHelperText>
                      </FormControl>

                      <FormControl
                        component="fieldset"
                        error={touched.roles && Boolean(errors.roles)}
                      >
                        <FormLabel component="legend">Roles</FormLabel>
                        <FormGroup row>
                          {roleOptions.map((role) => {
                            const lockedForSelf = isSelf && role !== ROLES.User
                            return (
                              <FormControlLabel
                                key={role}
                                label={role}
                                control={
                                  <Checkbox
                                    name="roles"
                                    value={role}
                                    checked={values.roles.includes(role)}
                                    disabled={isSubmitting || lockedForSelf}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...values.roles, role]
                                        : values.roles.filter((r) => r !== role)
                                      void setFieldValue('roles', next)
                                    }}
                                  />
                                }
                              />
                            )
                          })}
                        </FormGroup>
                        <FormHelperText>
                          {touched.roles && errors.roles
                            ? String(errors.roles)
                            : isSelf
                              ? 'You cannot change your own Admin or Manager role.'
                              : 'Admins and Managers can see every job and manage users.'}
                        </FormHelperText>
                      </FormControl>

                      <Divider />

                      <Stack
                        direction="row"
                        spacing={2}
                      >
                        <Button
                          variant="contained"
                          startIcon={<SaveIcon />}
                          type="submit"
                          disabled={!dirty || isSubmitting}
                        >
                          Save changes
                        </Button>
                        <Button
                          component={RouterLink}
                          to="/dashboard/users"
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  </Form>
                )}
              </Formik>
            </Section>

            <Section
              title="Danger zone"
              danger
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 2 }}
              >
                Permanently removes this account. Jobs are not deleted with it,
                so an account with jobs cannot be removed.
              </Typography>
              {deleteBlockedReason && (
                <Alert
                  severity="info"
                  sx={{ mb: 2 }}
                >
                  {deleteBlockedReason}
                </Alert>
              )}
              <Tooltip title={deleteBlockedReason ?? ''}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    disabled={Boolean(deleteBlockedReason) || isDeleting}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Delete user
                  </Button>
                </span>
              </Tooltip>
            </Section>
          </Stack>
        </Grid>
      </Grid>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle>Delete {displayName}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes the account{' '}
            <strong>{user.username}</strong> ({user.email}). This cannot be
            undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default EditUserForm
