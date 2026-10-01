// Local types for nodemailer-express-handlebars. The DefinitelyTyped package
// (@types/nodemailer-express-handlebars) is written against @types/nodemailer
// and its PluginFunction no longer matches the types bundled with nodemailer 10.
declare module 'nodemailer-express-handlebars' {
  import type { PluginFunction, SentMessageInfo } from 'nodemailer'

  interface ViewEngineOptions {
    extname?: string
    layoutsDir?: string
    partialsDir?: string | string[]
    defaultLayout?: string | false
  }

  interface NodemailerExpressHandlebarsOptions {
    viewEngine: ViewEngineOptions
    viewPath: string
    extName?: string
  }

  // Generic so the plugin matches whichever transporter it is registered on.
  function hbs<T = SentMessageInfo>(
    options: NodemailerExpressHandlebarsOptions
  ): PluginFunction<T>

  export = hbs
}
