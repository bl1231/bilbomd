import { Suspense, ComponentType } from 'react'
import Loader from './Loader'

const Loadable = <P extends object>(Component: ComponentType<P>) => {
  const LoadableComponent = (props: P) => (
    <Suspense fallback={<Loader />}>
      <Component {...props} />
    </Suspense>
  )

  // Generate a displayName based on the component's name
  const componentName = Component.displayName || Component.name || 'Component'
  LoadableComponent.displayName = `Loadable(${componentName})`

  return LoadableComponent
}

export default Loadable
