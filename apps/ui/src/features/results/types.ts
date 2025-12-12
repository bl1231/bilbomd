import { BilboMDJobDTO } from '@bilbomd/bilbomd-types'
export type MongoDBProperty = {
  label: string
  value?: string | number | Date
  suffix?: string
  render?: () => React.ReactNode
}

export interface JobHandler {
  getJobSpecificProperties: (
    job: BilboMDJobDTO,
    onOpenModal?: () => void
  ) => MongoDBProperty[]
  getJobTypeDisplayName: () => string
}

export interface HasConstraintFile {
  const_inp_file?: string
}
