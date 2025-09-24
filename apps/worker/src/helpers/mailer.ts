import nodemailer from 'nodemailer'
import hbs from 'nodemailer-express-handlebars'
import { logger } from './loggers.js'

const user = process.env.SEND_EMAIL_USER
const name = process.env.BILBOMD_FQDN
const viewPath = process.env.BILBOMD_MAILER_TEMPLATES || '/app/dist/templates/mailer/'

const sendJobCompleteEmail = (
  email: string,
  url: string,
  jobid: string,
  title: string,
  isError: boolean
) => {
  logger.info(`Sending job complete email, isError: ${isError}`)

  let emailLayout
  if (isError === true) {
    emailLayout = 'joberror'
  } else {
    emailLayout = 'jobcomplete'
  }

  const transporter = nodemailer.createTransport({
    name: name,
    host: 'smtp-relay.gmail.com',
    port: 25,
    secure: false
  })

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

  const mail = {
    from: user,
    to: email,
    subject: `BilboMD Job Complete: ${title}`,
    template: emailLayout,
    context: {
      jobid,
      url,
      title
    }
  }

  logger.info(`Using email template: ${emailLayout}`)
  transporter.sendMail(mail)
}

export { sendJobCompleteEmail }
