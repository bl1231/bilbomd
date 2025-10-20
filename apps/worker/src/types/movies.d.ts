type MovieJobData = {
  jobId: string
  label: string // e.g., 'rg_27'
  pdb: string // absolute path to md.pdb
  dcd: string // absolute path to md.dcd
  outDir: string // absolute directory to write outputs into
  stride: number // e.g., 10
  width: number // e.g., 1280
  height: number // e.g., 720
  crf: number // e.g., 22
  rayEnabled: boolean // whether to ray-trace frames (for outlines)
}
