import { useMemo } from 'react'
import React from 'react'
import type { JobView } from 'features/jobdetail/jobView'
import type { MongoDBProperty } from '../types'
import { createJobHandler } from '../handlers/jobHandlerFactory'
import { MDConstraintsRenderer } from '../components/MDConstraintsRenderer'

// Input files and MD parameters for the job page's Inputs section. Job type,
// engine and timings are shown in the page header instead.
export const useJobProperties = (
  view: JobView,
  onOpenModal?: () => void
): MongoDBProperty[] =>
  useMemo(() => {
    const constraints = view.md_constraints
    const constraintProperties: MongoDBProperty[] =
      constraints && Object.keys(constraints).length > 0
        ? [
            {
              label: 'MD Constraints',
              render: () =>
                React.createElement(MDConstraintsRenderer, { constraints })
            }
          ]
        : []

    return [
      { label: 'SAXS Data', value: view.inputs.data_file },
      ...createJobHandler(view.jobType).getJobSpecificProperties(
        view,
        onOpenModal
      ),
      ...constraintProperties
    ]
  }, [view, onOpenModal])
