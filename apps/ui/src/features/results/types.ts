import type { JobView } from 'features/jobdetail/jobView'
export type MongoDBProperty = {
  label: string
  value?: string | number | Date
  suffix?: string
  render?: () => React.ReactNode
}

export interface JobHandler {
  getJobSpecificProperties: (
    view: JobView,
    // Present for owners, who can open the constraint file
    onOpenModal?: () => void
  ) => MongoDBProperty[]
  getJobTypeDisplayName: () => string
}

export interface HasConstraintFile {
  const_inp_file?: string
}
