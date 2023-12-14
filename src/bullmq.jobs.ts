import { Job } from 'bullmq'

export interface HelloWorldJob {
  type: 'PrintHelloWorld'
  data: { hello: string }
}
export interface DoSomeHeavyComputingJob {
  type: 'DoSomeHeavyComputing'
  data: { magicNumber: number }
}
export interface MayFailOrNotJob {
  type: 'MayFailOrNot'
  data: { magicNumber: number }
}
export interface BilboMDJob extends Job {
  type: 'BilboMD'
  data: { title: string; uuid: string; jobid: string }
  id: string
}
export interface BilboMDAutoJob extends Job {
  type: 'BilboMDAuto'
  data: { title: string; uuid: string; jobid: string }
  id: string
}

export type WorkerJob =
  | HelloWorldJob
  | DoSomeHeavyComputingJob
  | MayFailOrNotJob
  | BilboMDJob
  | BilboMDAutoJob
