/**
 * Local type declaration for `nodemailer-express-handlebars`.
 *
 * The DefinitelyTyped stub (`@types/nodemailer-express-handlebars`) is written
 * against `@types/nodemailer`, which nodemailer >= 10 superseded with bundled
 * declarations. Mixing the two produces incompatible `PluginFunction` types, so
 * we declare the small surface we use here against nodemailer's own types.
 */
declare module 'nodemailer-express-handlebars' {
  import type { PluginFunction, SentMessageInfo } from 'nodemailer'

  /** Options forwarded to `express-handlebars`' `create()`. */
  interface ViewEngineOptions {
    extname?: string
    layoutsDir?: string
    partialsDir?: string | string[]
    defaultLayout?: string | false
    helpers?: Record<string, (...args: unknown[]) => unknown>
    compilerOptions?: Record<string, unknown>
    runtimeOptions?: Record<string, unknown>
  }

  /** A pre-built express-handlebars instance (anything with `renderView`). */
  interface ViewEngineInstance {
    renderView: (
      viewPath: string,
      options?: Record<string, unknown>
    ) => Promise<string>
  }

  interface NodemailerExpressHandlebarsOptions {
    viewEngine: ViewEngineOptions | ViewEngineInstance
    viewPath: string
    extName?: string
  }

  /** Extra fields the plugin reads from `sendMail()` options. */
  interface TemplateOptions {
    template?: string
    text_template?: string
    context?: Record<string, unknown>
  }

  function hbs<T = SentMessageInfo>(
    options: NodemailerExpressHandlebarsOptions
  ): PluginFunction<T>

  export type {
    NodemailerExpressHandlebarsOptions,
    TemplateOptions,
    ViewEngineInstance,
    ViewEngineOptions
  }
  export default hbs
}
