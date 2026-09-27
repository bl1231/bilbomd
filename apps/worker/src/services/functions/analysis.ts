import { logger } from '../../helpers/loggers.js'
import { config } from '../../config/config.js'
import { runProcess } from '../../helpers/runProcess.js'
import path from 'path'
import { IJob } from '@bilbomd/mongodb-schema'

const spawnRgyrDmaxScript = async (DBjob: IJob): Promise<void> => {
  const jobDir = path.join(config.uploadDir, DBjob.uuid)

  await runProcess({
    label: 'Rgyr Dmax script',
    cmd: '/opt/envs/base/bin/python',
    args: ['/app/scripts/rgyr_v_dmax_analysis.py', jobDir],
    cwd: jobDir,
    stdoutFile: path.join(jobDir, 'rgyr_v_dmax.log'),
    stderrFile: path.join(jobDir, 'rgyr_v_dmax_error.log'),
    timeoutMs: config.processTimeouts.helperScriptMs,
    onStdoutLine: (line) => logger.info(`Rgyr Dmax script stdout: ${line}`),
    onStderrLine: (line) => logger.error(`Rgyr Dmax script stderr: ${line}`)
  })
  logger.info('Rgyr Dmax script completed successfully')
}

export { spawnRgyrDmaxScript }
