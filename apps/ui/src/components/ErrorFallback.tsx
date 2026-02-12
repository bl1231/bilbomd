import { FallbackProps } from 'react-error-boundary'

const ErrorFallback = ({ error }: FallbackProps) => {
  const errorMessage =
    error instanceof Error ? error.message : 'An unknown error occurred'

  return (
    <div role='alert'>
      <p>
        Something went wrong. Please send a screenshot of the error message to
        Scott.
      </p>
      <pre style={{ color: 'red' }}>{errorMessage}</pre>
    </div>
  )
}

export default ErrorFallback
