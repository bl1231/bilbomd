import { useMemo } from 'react'
import React from 'react'
import type { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
import type { MongoDBProperty } from '../types'
import { createJobHandler } from '../handlers/jobHandlerFactory'
import { MDConstraintsRenderer } from '../components/MDConstraintsRenderer'

export const useJobProperties = (
  job: BilboMDJobDTO,
  onOpenModal?: () => void
): MongoDBProperty[] => {
  return useMemo(() => {
    const jobTypeDisplayNames: Record<string, string> = {
      pdb: 'BilboMD Classic w/PDB',
      auto: 'BilboMD Auto',
      alphafold: 'BilboMD AlphaFold',
      sans: 'BilboMD SANS',
      crd: 'BilboMD Classic w/CRD/PSF',
      scoper: 'BilboMD Scoper',
      multi: 'BilboMD MultiMD'
    }

    const getJobTypeDisplayName = (type?: string) =>
      type
        ? jobTypeDisplayNames[type] || 'Unknown Job Type'
        : 'Unknown Job Type'

    const calculateDuration = (): string | undefined => {
      if (!job.mongo.time_started) return undefined

      const startTime = new Date(job.mongo.time_started)
      const endTime = job.mongo.time_completed
        ? new Date(job.mongo.time_completed)
        : new Date() // Use current time if still running

      const durationMs = endTime.getTime() - startTime.getTime()
      const durationSeconds = Math.floor(durationMs / 1000)

      const hours = Math.floor(durationSeconds / 3600)
      const minutes = Math.floor((durationSeconds % 3600) / 60)
      const seconds = durationSeconds % 60

      if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`
      } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`
      } else {
        return `${seconds}s`
      }
    }

    const baseProperties: MongoDBProperty[] = [
      { label: 'MongoDB ID', value: job.mongo.id },
      { label: 'Pipeline', value: getJobTypeDisplayName(job.mongo.jobType) },
      { label: 'MD Engine', value: job.mongo.md_engine ?? 'CHARMM' },
      { label: 'Submitted', value: job.mongo.time_submitted },
      { label: 'Started', value: job.mongo.time_started },
      { label: 'Completed', value: job.mongo.time_completed },
      ...(job.mongo.time_started
        ? [{ label: 'Duration', value: calculateDuration() }]
        : []),
      { label: 'Data file', value: job.mongo.data_file }
    ]

    const handler = createJobHandler(job.mongo.jobType)
    const jobSpecificProperties = handler.getJobSpecificProperties(
      job,
      onOpenModal
    )

    // Add MD constraints if present
    const constraintProperties: MongoDBProperty[] =
      job.mongo.md_constraints &&
      Object.keys(job.mongo.md_constraints).length > 0
        ? [
            {
              label: 'MD Constraints',
              render: () =>
                React.createElement(MDConstraintsRenderer, {
                  constraints: job.mongo.md_constraints!
                })
            }
          ]
        : []

    return [
      ...baseProperties,
      ...jobSpecificProperties,
      ...constraintProperties
    ]
  }, [job, onOpenModal])
}
