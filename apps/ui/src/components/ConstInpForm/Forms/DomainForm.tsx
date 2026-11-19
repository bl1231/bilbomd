import { useEffect, useState, Fragment } from 'react'
import { useFormikContext, FieldArray, FormikValues, getIn } from 'formik'
import { Typography, Button, Chip, Box, Alert } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useTheme } from '@mui/material/styles'
import Paper from '@mui/material/Paper'
import AddIcon from '@mui/icons-material/Add'
import useTitle from 'hooks/useTitle'
import HeaderBox from 'components/HeaderBox'
import InstructionsAccordion from 'components/InstructionsAccordion'
import RigidBody from '../Helpers/RigidBody'
import ImportNotes from '../Helpers/ImportNotes'
import { nextRigidBodyId } from '../Helpers/importConstInp'
import GapWarning from '../Helpers/GapWarning'
import { MIN_FLEX_GAP } from '@bilbomd/bilbomd-types'
import type { Chain, RigidBody as IRigidBody } from 'types/interfaces'

interface DomainFormProps {
  setStepIsValid(...args: unknown[]): unknown
}

const DomainForm = ({ setStepIsValid }: DomainFormProps) => {
  useTitle('BilboMD: Define fixed and rigid bodies')
  const theme = useTheme()
  const { values, errors, isValid, validateForm, setTouched } =
    useFormikContext<FormikValues>()
  // False until the bodies have been checked against this step's rules
  const [checked, setChecked] = useState(false)

  // Define background colors for different chain types
  const customColors: Record<string, string> = {
    PRO: theme.palette.mode === 'light' ? '#E6A8A8' : '#b76e79',
    DNA: theme.palette.mode === 'light' ? '#E9D8A6' : '#b3a272',
    RNA: theme.palette.mode === 'light' ? '#B5E3D8' : '#6daba4',
    CAR: theme.palette.mode === 'light' ? '#A8CCE6' : '#6b95b8',
    Other: theme.palette.mode === 'light' ? '#D1A8E6' : '#9773b9'
  }

  // Formik doesn't revalidate when the stepper switches schemas, so isValid
  // still describes step 1. Check the bodies on entering this step, and mark
  // every segment touched so errors in imported ones show without editing.
  useEffect(() => {
    let active = true
    setStepIsValid(false)
    const rigidBodies = values.pdb_file.rigid_bodies as IRigidBody[]
    void setTouched(
      {
        pdb_file: {
          rigid_bodies: rigidBodies.map((rb) => ({
            domains: rb.domains.map(() => ({
              chainid: true,
              start: true,
              end: true
            }))
          }))
        }
      },
      false
    )
    void validateForm().then(() => {
      if (active) setChecked(true)
    })
    return () => {
      active = false
    }
    // Once, on entering the step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (checked) setStepIsValid(isValid)
  }, [checked, isValid, setStepIsValid])

  const macroMolecules = ['PRO', 'DNA', 'RNA', 'CAR', 'Other']

  return (
    <>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 12 }}>
          <InstructionsAccordion>
            <Box>
              <Typography
                variant="h4"
                sx={{ m: 1 }}
              >
                Define Fixed and Rigid Bodies
              </Typography>
              <Typography sx={{ m: 1 }}>
                Choose which residues are held fixed and which move as rigid
                bodies during the molecular dynamics steps of a <b>BilboMD</b>{' '}
                run. Every residue in neither stays <b>flexible</b>. Please be
                aware of the following.
              </Typography>
              <ul>
                <li>
                  <Typography>
                    <b>PRIMARY</b> is the <b>fixed body</b>: its segments are
                    held in place, as the reference frame. It needs at least one
                    segment.
                  </Typography>
                </li>
                <li>
                  <Typography>
                    Each body you add (<b>RIGID 1</b>, <b>RIGID 2</b>, …) is a{' '}
                    <b>rigid body</b>: its segments move together as one piece,
                    relative to the fixed body.
                  </Typography>
                </li>
                <li>
                  <Typography>
                    No residue can be in two bodies, or twice in one body.
                  </Typography>
                </li>
                <li>
                  <Typography>
                    Leave at least <b>{MIN_FLEX_GAP} flexible residues</b>{' '}
                    between segments of different bodies to allow for efficient
                    conformational sampling. Closer segments give a warning, not
                    an error.
                  </Typography>
                </li>
              </ul>
            </Box>
            {values.const_inp_file?.notes && (
              <ImportNotes
                name={values.const_inp_file.name}
                notes={values.const_inp_file.notes}
              />
            )}
          </InstructionsAccordion>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <HeaderBox>
            <Typography>Define Fixed and Rigid Bodies</Typography>
          </HeaderBox>
          <Paper sx={{ p: 1 }}>
            <Grid container>
              <Grid sx={{ width: '100%' }}>
                <Typography
                  variant="h5"
                  sx={{ py: 1, ml: 1 }}
                >
                  Macromolecule types:
                </Typography>
                {macroMolecules.map((chain: string, index: number) => (
                  <Chip
                    key={index}
                    label={`${chain}`}
                    sx={{
                      mr: 1,
                      mb: 1,
                      backgroundColor: customColors[chain] || '#9773b9',
                      color: theme.palette.getContrastText(
                        customColors[chain] ?? '#9773b9'
                      )
                    }}
                  />
                ))}
              </Grid>
              <Grid sx={{ width: '100%' }}>
                <Typography
                  variant="h5"
                  sx={{ py: 1, ml: 1 }}
                >
                  Available Chains (and residue range):
                </Typography>
                {values.pdb_file.chains.map((chain: Chain, index: number) => (
                  <Chip
                    key={index}
                    label={`${chain.id} : ${chain.first_res}-${chain.last_res}`}
                    sx={{
                      mr: 1,
                      mb: 1,
                      backgroundColor: customColors[chain.type] || '#9773b9',
                      color: theme.palette.getContrastText(
                        customColors[chain.type] ?? '#9773b9'
                      )
                    }}
                  />
                ))}
              </Grid>
              <GapWarning rigidBodies={values.pdb_file.rigid_bodies} />
              <Grid sx={{ my: 3 }}>
                <FieldArray name="pdb_file.rigid_bodies">
                  {(arrayHelpers) => (
                    <>
                      {values.pdb_file.rigid_bodies.length > 0 &&
                        values.pdb_file.rigid_bodies.map(
                          (rigid_body: IRigidBody, index: number) => (
                            <Fragment key={index}>
                              <Grid sx={{ mb: 4, py: 1 }}>
                                <Grid
                                  sx={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    ml: 1,
                                    mb: 1,
                                    alignContent: 'baseline'
                                  }}
                                >
                                  <Typography variant="h4">
                                    {rigid_body.id === 'PRIMARY'
                                      ? 'Fixed Body'
                                      : 'Rigid Body'}
                                    : <Chip label={rigid_body.id} />
                                  </Typography>
                                  {values.pdb_file.rigid_bodies[index]?.id ===
                                  'PRIMARY' ? (
                                    <Alert
                                      severity="warning"
                                      sx={{ ml: 2 }}
                                    >
                                      Segments in <b>PRIMARY</b> are the fixed
                                      body: held in place during MD.
                                    </Alert>
                                  ) : (
                                    <Alert
                                      severity="warning"
                                      sx={{ ml: 2 }}
                                    >
                                      Segments in <b>{rigid_body.id}</b> move
                                      together as one rigid body, relative to
                                      the fixed body (<b>PRIMARY</b>).
                                    </Alert>
                                  )}
                                </Grid>
                                {typeof getIn(
                                  errors,
                                  `pdb_file.rigid_bodies[${index}].domains`
                                ) === 'string' && (
                                  <Alert
                                    severity="error"
                                    sx={{ m: 1 }}
                                  >
                                    {getIn(
                                      errors,
                                      `pdb_file.rigid_bodies[${index}].domains`
                                    )}
                                  </Alert>
                                )}
                                <RigidBody
                                  rigidBodyIndex={index}
                                  // rigidBodiesArrayHelpers={arrayHelpers}
                                />
                                {/* DO NOT SHOW DELETE BUTTON FOR PRIMARY */}
                                {values.pdb_file.rigid_bodies[index]?.id !==
                                'PRIMARY' ? (
                                  <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => {
                                      arrayHelpers.remove(index)
                                    }}
                                    size="small"
                                  >
                                    {/* Delete {values.pdb_file.rigid_bodies[index]?.id} */}
                                    Delete Rigid Body
                                  </Button>
                                ) : (
                                  ''
                                )}
                              </Grid>
                            </Fragment>
                          )
                        )}
                      <Grid
                        container
                        sx={{ justifyContent: 'flex-end' }}
                      >
                        <Grid
                          size={{ xs: 12 }}
                          sx={{
                            display: 'flex',
                            justifyContent: 'flex-start',
                            alignItems: 'center'
                          }}
                        >
                          <Button
                            variant="contained"
                            onClick={() => {
                              const new_rigid_body = {
                                id: nextRigidBodyId(
                                  values.pdb_file.rigid_bodies
                                ),
                                domains: [
                                  {
                                    chainid: values.pdb_file.chains[0].id,
                                    start: values.pdb_file.chains[0].first_res,
                                    end: values.pdb_file.chains[0].last_res
                                  }
                                ]
                              }
                              arrayHelpers.push(new_rigid_body)
                            }}
                            startIcon={<AddIcon />}
                            size="large"
                            sx={{}}
                          >
                            Add Rigid Body
                          </Button>
                          <Typography sx={{ ml: 2 }}>
                            This is likely what you are wanting
                          </Typography>
                        </Grid>
                      </Grid>
                    </>
                  )}
                </FieldArray>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </>
  )
}

export default DomainForm
