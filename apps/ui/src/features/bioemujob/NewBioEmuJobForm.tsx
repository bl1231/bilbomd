import { useMemo, useState } from 'react'
import { Box, Typography, Alert, Paper, Button, Link } from '@mui/material'
import Grid from '@mui/material/Grid'
import { Form, Formik, Field, FormikErrors } from 'formik'
import SendIcon from '@mui/icons-material/Send'
import LinearProgress from '@mui/material/LinearProgress'
import FileSelect from 'features/jobs/FileSelect'
import SaxsDataOptions from 'features/jobs/SaxsDataOptions'
import JobSuccessAlert from 'features/jobs/JobSuccessAlert'
import EntitiesFieldArray from 'features/shared/entities/EntitiesFieldArray'
import { useAddNewBioEmuJobMutation } from 'slices/jobsApiSlice'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import {
  makeBilboMDBioEmuJobSchema,
  BIOEMU_DEFAULT_MAX_TOKENS
} from 'schemas/BilboMDBioEmuJobSchema'
import { Debug } from 'components/Debug'
import HeaderBox from 'components/HeaderBox'
import TitleField from 'components/TitleField'
import SubmitErrorAlert from 'components/SubmitErrorAlert'
import useTitle from 'hooks/useTitle'
import useAuth from 'hooks/useAuth'
import { OpenFoldEntity, NewOpenFoldJobFormValues } from 'types/openfoldForm'
import { logger } from 'utils/logger'
import { getSubmitError, type SubmitError } from 'utils/submitError'
import NewBioEmuJobFormInstructions from './NewBioEmuJobFormInstructions'
import BioEmuPipelineSchematic from './BioEmuPipelineSchematic'
import { bioemuFormData } from './bioemuFormData'

// BilboMD BioEmu2 (bilbomd#1200): sequence entities + SAXS data. Same entity
// editor as the OpenFold3 form, limited to Protein and DNA. Admins only while
// the pipeline is being validated, and no anonymous mode.

const newEntity = (): OpenFoldEntity => ({
  id: '1',
  name: 'pro-1',
  sequence: '',
  type: 'Protein',
  copies: 1,
  seq_length: 0
})

const parseMaxTokens = (raw?: string): number => {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : BIOEMU_DEFAULT_MAX_TOKENS
}

const NotAvailable = ({ reason }: { reason: 'disabled' | 'admin' }) => (
  <Alert severity="warning">
    {reason === 'disabled' ? (
      <>
        <b>BilboMD BioEmu2</b> is not enabled on this deployment.
      </>
    ) : (
      <>
        <b>BilboMD BioEmu2</b> is being tested and is open to administrators
        only.
      </>
    )}{' '}
    Please contact the{' '}
    <Link
      href="mailto:support@bl1231.als.lbl.gov"
      target="_blank"
      rel="noopener noreferrer"
    >
      BilboMD team
    </Link>{' '}
    if you would like to try it.
  </Alert>
)

const EntityErrors = ({
  errors
}: {
  errors: FormikErrors<NewOpenFoldJobFormValues>['entities']
}) => {
  // A string is an error about the list as a whole (size, no protein)
  if (typeof errors === 'string') {
    return (
      <Alert
        severity="error"
        sx={{ my: 2 }}
      >
        {errors}
      </Alert>
    )
  }
  if (!Array.isArray(errors)) return null
  return (
    <>
      {(errors as (FormikErrors<OpenFoldEntity> | undefined)[]).map(
        (error, idx) =>
          error && (
            <Box
              key={idx}
              sx={{ my: 2 }}
            >
              {error.sequence && (
                <Alert severity="error">{`Entity ${idx + 1} sequence: ${error.sequence}`}</Alert>
              )}
              {error.type && (
                <Alert severity="error">{`Entity ${idx + 1} type: ${error.type}`}</Alert>
              )}
              {error.copies && (
                <Alert severity="error">{`Entity ${idx + 1} copies: ${error.copies}`}</Alert>
              )}
            </Box>
          )
      )}
    </>
  )
}

const NewBioEmuJob = () => {
  useTitle('BilboMD: New BioEmu2 Job')
  const { isAdmin } = useAuth()
  const [addNewBioEmuJob, { isSuccess, data: jobResponse }] =
    useAddNewBioEmuJobMutation()
  const [submitError, setSubmitError] = useState<SubmitError | null>(null)
  const {
    data: config,
    error: configError,
    isLoading: configIsLoading
  } = useGetConfigsQuery('configData')

  const maxTokens = parseMaxTokens(config?.bioemuMaxTokens)
  const schema = useMemo(
    () => makeBilboMDBioEmuJobSchema(maxTokens),
    [maxTokens]
  )

  if (configIsLoading) return <LinearProgress />
  if (configError)
    return <Alert severity="error">Error loading configuration</Alert>
  if (!config)
    return <Alert severity="error">Configuration not available</Alert>

  const enabled = config.enableBilboMdBioEmu?.toLowerCase() === 'true'

  const onSubmit = async (values: NewOpenFoldJobFormValues) => {
    setSubmitError(null)
    try {
      await addNewBioEmuJob(bioemuFormData(values)).unwrap()
    } catch (error) {
      logger.error('rejected', error)
      setSubmitError(getSubmitError(error))
    }
  }

  return (
    <Grid
      container
      spacing={2}
    >
      <Grid size={{ xs: 12 }}>
        <NewBioEmuJobFormInstructions />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Typography>BilboMD BioEmu2 Schematic</Typography>
        </HeaderBox>
        <Paper sx={{ p: 2 }}>
          <BioEmuPipelineSchematic />
        </Paper>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <HeaderBox>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography>BilboMD BioEmu2 Job Form</Typography>
            <Typography
              component="span"
              sx={{ color: 'yellow', ml: 1 }}
            >
              *Testing - administrators only
            </Typography>
          </Box>
        </HeaderBox>
        <Paper sx={{ p: 2 }}>
          {!enabled ? (
            <NotAvailable reason="disabled" />
          ) : !isAdmin ? (
            <NotAvailable reason="admin" />
          ) : isSuccess && jobResponse ? (
            <JobSuccessAlert
              jobResponse={{
                message: jobResponse.message || 'Job submitted successfully',
                jobid: jobResponse.jobid,
                uuid: jobResponse.uuid
                // no md_engine: this pipeline has no Molecular Dynamics step
                // for the alert to name (OpenMM only polishes the ensembles)
              }}
              jobType="BioEmu2"
            />
          ) : (
            <Formik<NewOpenFoldJobFormValues>
              initialValues={{
                title: '',
                dat_file: '',
                q_units: 'auto',
                entities: [newEntity()]
              }}
              validationSchema={schema}
              onSubmit={onSubmit}
            >
              {({
                values,
                errors,
                touched,
                isValid,
                isSubmitting,
                handleChange,
                handleBlur,
                setFieldValue,
                setFieldTouched
              }) => (
                <Form>
                  <Grid
                    container
                    sx={{ flexDirection: 'column' }}
                  >
                    <Box
                      sx={{
                        my: 1,
                        width: '100%',
                        maxWidth: '520px'
                      }}
                    >
                      <TitleField />
                    </Box>

                    <SubmitErrorAlert
                      error={submitError}
                      sx={{ my: 1 }}
                    />

                    <Grid sx={{ my: 2 }}>
                      <EntitiesFieldArray
                        values={values}
                        errors={errors}
                        touched={touched}
                        handleChange={handleChange}
                        handleBlur={handleBlur}
                        setFieldValue={setFieldValue}
                        useExampleData={false}
                        moleculeTypes={['Protein', 'DNA']}
                        tokenLimits={{
                          warn: Math.round(maxTokens * 0.8),
                          max: maxTokens
                        }}
                      />
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1 }}
                      >
                        Limit for BioEmu2 jobs: {maxTokens} residues and
                        nucleotides, counting copies.
                      </Typography>
                      <EntityErrors errors={errors.entities} />
                    </Grid>

                    <Grid>
                      <Field
                        name="dat_file"
                        id="dat-file-upload"
                        as={FileSelect}
                        title="Select File"
                        disabled={isSubmitting}
                        setFieldValue={setFieldValue}
                        setFieldTouched={setFieldTouched}
                        error={errors.dat_file && touched.dat_file}
                        errorMessage={errors.dat_file ? errors.dat_file : ''}
                        fileType="experimental SAXS data *.dat"
                        fileExt=".dat"
                      />
                    </Grid>
                    <Grid>
                      <SaxsDataOptions disabled={isSubmitting} />
                    </Grid>

                    {isSubmitting && (
                      <Box sx={{ my: 1, width: '100%', maxWidth: '520px' }}>
                        <LinearProgress />
                      </Box>
                    )}

                    <Grid sx={{ mt: 2 }}>
                      <Button
                        type="submit"
                        disabled={
                          !isValid ||
                          isSubmitting ||
                          values.title === '' ||
                          values.dat_file === ''
                        }
                        loading={isSubmitting}
                        endIcon={<SendIcon />}
                        loadingPosition="end"
                        variant="contained"
                        sx={{ width: '110px', mb: 2 }}
                      >
                        <span>Submit</span>
                      </Button>
                    </Grid>
                  </Grid>
                  {import.meta.env.MODE === 'development' ? <Debug /> : ''}
                </Form>
              )}
            </Formik>
          )}
        </Paper>
      </Grid>
    </Grid>
  )
}

export default NewBioEmuJob
