import React, { useState } from 'react'
import Box from '@mui/material/Box'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Button from '@mui/material/Button'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import UploadForm from './Forms/UploadForm'
import DomainForm from './Forms/DomainForm'
import { Preview } from './Forms/Preview'
import formModel from './FormModel/formModel'
import initialValues from './FormModel/formInitialValues'
import validationSchemas from './FormModel/validationSchemas'
import { Form, Formik } from 'formik'
import { Debug } from 'components/Debug'

const steps = [
  'Upload Files',
  'Define Fixed and Rigid Bodies',
  'Preview & Download'
]
const LAST_STEP = steps.length - 1

// interesting idea see Niiima Bastani on codesandbox
const { formId } = formModel

/**
 * The Inp Jiffy's three steps. The last one is where it ends: its own
 * buttons download the constraints or take them into a new Classic job, so
 * there is no Finish, only Back and Start Over.
 */
const ConstInpStepper = () => {
  const [activeStep, setActiveStep] = useState(0)
  const currentValidationSchema = validationSchemas[activeStep]
  const [stepIsValid, setStepIsValid] = useState(false)
  // Set once a constraints file has been downloaded from the last step,
  // which then shows as completed
  const [done, setDone] = useState(false)
  // Changed by Start Over, so the form remounts with nothing in it
  const [formKey, setFormKey] = useState(0)

  const renderStepContent = (step: number): React.JSX.Element => {
    switch (step) {
      case 0:
        return <UploadForm setStepIsValid={setStepIsValid} />
      case 1:
        return <DomainForm setStepIsValid={setStepIsValid} />
      case 2:
        return <Preview onDone={() => setDone(true)} />
      default:
        return <div>Not Found</div>
    }
  }

  const handleNext = () => setActiveStep((step) => step + 1)
  // Going back to change the bodies makes any earlier download stale
  const handleBack = () => {
    setDone(false)
    setActiveStep((step) => step - 1)
  }
  const handleStartOver = () => {
    setDone(false)
    setStepIsValid(false)
    setActiveStep(0)
    setFormKey((key) => key + 1)
  }

  // The same buttons above and below the step
  const navigation = (
    <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
      <Button
        disabled={activeStep === 0}
        onClick={handleBack}
        variant="contained"
        sx={{ mr: 1 }}
      >
        Back
      </Button>
      <Box sx={{ flex: '1 1 auto' }} />
      {activeStep === LAST_STEP ? (
        <Button
          onClick={handleStartOver}
          variant="outlined"
          startIcon={<RestartAltIcon />}
        >
          Start Over
        </Button>
      ) : (
        <Button
          onClick={handleNext}
          disabled={!stepIsValid}
          variant="contained"
        >
          Next
        </Button>
      )}
    </Box>
  )

  return (
    <Box sx={{ width: '100%' }}>
      <Stepper activeStep={activeStep}>
        {steps.map((label, index) => (
          <Step
            key={label}
            // Earlier steps show as completed on their own
            {...(index === LAST_STEP && done ? { completed: true } : {})}
          >
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {navigation}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          pt: 2,
          flex: '0 1 100%'
        }}
      >
        <Formik
          key={formKey}
          initialValues={initialValues}
          validationSchema={currentValidationSchema}
          validateOnMount={false}
          enableReinitialize={true}
          // Nothing is submitted: the last step's own buttons finish
          onSubmit={() => {}}
        >
          {() => (
            <Form id={formId}>
              {renderStepContent(activeStep)}
              {process.env.NODE_ENV === 'development' ? <Debug /> : ''}
            </Form>
          )}
        </Formik>
      </Box>
      {navigation}
    </Box>
  )
}

export default ConstInpStepper
