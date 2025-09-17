// interface JobResult {
//   status: string
//   jobid: string
//   error: string
// }

interface TaskStatusResponse {
  id: string
  status: string
  result: string
}

interface JobStatusResponse {
  api_status: string
  api_error?: string | null
  sacct_jobid?: string
  sacct_state?: string
  sacct_submit?: string
  sacct_start?: string
  sacct_end?: string
}

interface NerscAccessToken {
  access_token: string
  scope: string
  token_type: string
  expires_in: number
}

// when ?sacct=false
// interface JobStatusOutput {
//   account: 'm4659_g'
//   tres_per_node: 'N/A'
//   min_cpus: '1'
//   min_tmp_disk: '0'
//   end_time: 'N/A'
//   features: 'gpu&a100'
//   group: '62704'
//   over_subscribe: 'NO'
//   jobid: '25145969'
//   name: 'bilbomd.slurm'
//   comment: '(null)'
//   time_limit: '30:00'
//   min_memory: '0'
//   req_nodes: ''
//   command: '/pscratch/sd/s/sclassen/bilbmod/aefbbbd5-2167-4c77-843f-f7a1ab62a7c9/bilbomd.slurm'
//   priority: '69119'
//   qos: 'gpu_debug'
//   reason: 'Priority'
//   st: 'PD'
//   user: 'sclassen'
//   reservation: '(null)'
//   wckey: '(null)'
//   exc_nodes: ''
//   nice: '0'
//   's:c:t': '*:*:*'
//   exec_host: 'n/a'
//   cpus: '1'
//   nodes: '1'
//   dependency: '(null)'
//   array_job_id: '25145969'
//   sockets_per_node: '*'
//   cores_per_socket: '*'
//   threads_per_core: '*'
//   array_task_id: 'N/A'
//   time_left: '30:00'
//   time: '0:00'
//   nodelist: ''
//   contiguous: '0'
//   partition: 'gpu_ss11'
//   'nodelist(reason)': '(Priority)'
//   start_time: 'N/A'
//   state: 'PENDING'
//   uid: '62704'
//   submit_time: '2024-05-03T19:23:34'
//   licenses: 'cfs:1,scratch:1,u2:1'
//   core_spec: 'N/A'
//   schednodes: '(null)'
//   work_dir: '/global/u2/s/sclassen'
// }

// when ?sacct=true
interface JobStatusOutputSacct {
  account: 'm4659_g'
  admincomment: ''
  alloccpus: '0'
  allocnodes: '0'
  alloctres: ''
  associd: '313129'
  avecpu: ''
  avecpufreq: ''
  avediskread: ''
  avediskwrite: ''
  avepages: ''
  averss: ''
  avevmsize: ''
  blockid: ''
  cluster: 'perlmutter'
  comment: ''
  constraints: 'gpu&a100'
  consumedenergy: '0'
  consumedenergyraw: '0'
  cputime: '00:00:00'
  cputimeraw: '0'
  dbindex: '257801328'
  derivedexitcode: '0:0'
  elapsed: '00:00:00'
  elapsedraw: '0'
  eligible: '2024-05-03T20:16:50'
  end: 'Unknown'
  exitcode: '0:0'
  flags: 'StartRecieved'
  gid: '62704'
  group: 'sclassen'
  jobid: '25149103'
  jobidraw: '25149103'
  jobname: 'bilbomd.slurm'
  layout: ''
  maxdiskread: ''
  maxdiskreadnode: ''
  maxdiskreadtask: ''
  maxdiskwrite: ''
  maxdiskwritenode: ''
  maxdiskwritetask: ''
  maxpages: ''
  maxpagesnode: ''
  maxpagestask: ''
  maxrss: ''
  maxrssnode: ''
  maxrsstask: ''
  maxvmsize: ''
  maxvmsizenode: ''
  maxvmsizetask: ''
  mcslabel: ''
  mincpu: ''
  mincpunode: ''
  mincputask: ''
  ncpus: '0'
  nnodes: '1'
  nodelist: 'None assigned'
  ntasks: ''
  priority: '69119'
  partition: 'gpu_ss11'
  qos: 'gpu_debug'
  qosraw: '691'
  reason: 'None'
  reqcpufreq: 'Unknown'
  reqcpufreqmin: 'Unknown'
  reqcpufreqmax: 'Unknown'
  reqcpufreqgov: 'Unknown'
  reqcpus: '1'
  reqmem: '229992M'
  reqnodes: '1'
  reqtres: 'billing=1,cpu=1,mem=229992M,node=1'
  reservation: ''
  reservationid: ''
  start: 'Unknown'
  state: 'PENDING'
  submit: '2024-05-03T20:16:50'
  suspended: '00:00:00'
  systemcpu: '00:00:00'
  systemcomment: ''
  timelimit: '00:30:00'
  timelimitraw: '30'
  totalcpu: '00:00:00'
  tresusageinave: ''
  tresusageinmax: ''
  tresusageinmaxnode: ''
  tresusageinmaxtask: ''
  tresusageinmin: ''
  tresusageinminnode: ''
  tresusageinmintask: ''
  tresusageintot: ''
  tresusageoutave: ''
  tresusageoutmax: ''
  tresusageoutmaxnode: ''
  tresusageoutmaxtask: ''
  tresusageoutmin: ''
  tresusageoutminnode: ''
  tresusageoutmintask: ''
  tresusageouttot: ''
  uid: '62704'
  user: 'sclassen'
  usercpu: '00:00:00'
  wckey: ''
  wckeyid: '0'
  workdir: '/global/u2/s/sclassen'
}

export { TaskStatusResponse, JobStatusResponse, NerscAccessToken, JobStatusOutputSacct }
