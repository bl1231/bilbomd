import nodemailer from 'nodemailer'
import hbs from 'nodemailer-express-handlebars'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from './loggers.js'

const user = process.env.SEND_EMAIL_USER
const name = process.env.BILBOMD_FQDN
const mailHost = process.env.BILBOMD_MAILER_HOST || 'smtp-relay.gmail.com'
const mailPort = process.env.BILBOMD_MAILER_PORT
  ? parseInt(process.env.BILBOMD_MAILER_PORT)
  : 25
const mailSecure = process.env.BILBOMD_MAILER_SECURE === 'true'
const mailUser = process.env.BILBOMD_MAILER_USER
const mailPass = process.env.BILBOMD_MAILER_PASS
// Get the directory of the current module file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const viewPath = path.resolve(__dirname, '../templates/mailer/')

const transporter = nodemailer.createTransport({
  name: name,
  host: mailHost,
  port: mailPort,
  secure: mailSecure,
  ...(mailUser && mailPass ? { auth: { user: mailUser, pass: mailPass } } : {})
})

// Register the handlebars templates once; calling use() on every send would
// add another copy of the plugin each time.
transporter.use(
  'compile',
  hbs({
    viewEngine: {
      extname: '.handlebars',
      layoutsDir: viewPath,
      defaultLayout: ''
    },
    viewPath,
    extName: '.handlebars'
  })
)

const sendJobCompleteEmail = (
  email: string,
  url: string,
  jobid: string,
  title: string,
  isError: boolean,
  resultsToken?: string
) => {
  logger.info(`Sending job complete email, error state is: ${isError}`)

  let emailLayout

  if (isError === true) {
    emailLayout = 'joberror'
  } else {
    emailLayout = 'jobcomplete'
  }

  // The tokened results link works without logging in (issue #978); jobs
  // created before results_token existed fall back to the dashboard link.
  const resultsUrl = resultsToken
    ? `${url}/results/${resultsToken}`
    : `${url}/dashboard/jobs/${jobid}`

  const mail = {
    from: user,
    to: email,
    subject: `BilboMD Job Complete: ${title}`,
    template: emailLayout,
    context: {
      jobid,
      url,
      title,
      resultsUrl
    }
  }

  logger.info(`Using email template: ${emailLayout}`)
  transporter.sendMail(mail)
}

export { sendJobCompleteEmail }
