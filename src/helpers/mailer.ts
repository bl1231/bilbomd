import nodemailer from 'nodemailer'
import hbs from 'nodemailer-express-handlebars'
import path from 'path'
import { logger } from './loggers'

const user = process.env.SEND_EMAIL_USER
const name = process.env.BILBOMD_FQDN
// const viewPath = path.resolve(__dirname, '../templates/mailer/')
const viewPath = path.resolve('./src/templates/mailer/')

const transporter = nodemailer.createTransport({
  name: name,
  host: 'smtp-relay.gmail.com',
  port: 25,
  secure: false
})

const sendJobCompleteEmail = (
  email: string,
  url: string,
  jobid: string,
  title: string,
  isError: boolean
) => {
  logger.info(`Sending job complete email, error state is: ${isError}`)

  let emailLayout

  if (isError === true) {
    emailLayout = 'joberror'
  } else {
    emailLayout = 'jobcomplete'
  }

  transporter.use(
    'compile',
    hbs({
      viewEngine: {
        extname: '.handlebars',
        defaultLayout: false,
        layoutsDir: viewPath
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
