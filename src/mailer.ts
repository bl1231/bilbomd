import nodemailer from 'nodemailer'
import hbs from 'nodemailer-express-handlebars'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const user = process.env.SENDMAIL_USER
const viewPath = path.resolve(__dirname, './templates/mailer/')

const transporter = nodemailer.createTransport({
  name: 'bl1231-local.als.lbl.gov',
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
  console.log('Sending job complete email, error state is: ', isError)

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

  console.log('Using email template:', emailLayout)
  transporter.sendMail(mail)
}

export { sendJobCompleteEmail }
