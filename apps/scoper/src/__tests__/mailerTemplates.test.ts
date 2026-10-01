import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi } from 'vitest'
import type { Transporter } from 'nodemailer'

// Render every mailer template through the real nodemailer and handlebars
// plugin, using the plugin config registered by helpers/mailer.ts. Only the SMTP
// transport is swapped for nodemailer's JSON transport, so a version mismatch
// between nodemailer and the plugin fails here instead of in production.
const { holder } = vi.hoisted(() => ({
  holder: {} as { transporter?: Transporter }
}))

vi.mock('nodemailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('nodemailer')>()
  const createTransport = () => {
    holder.transporter = actual.default.createTransport({ jsonTransport: true })
    return holder.transporter
  }
  return {
    ...actual,
    default: { ...actual.default, createTransport },
    createTransport
  }
})
vi.mock('../helpers/loggers.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}))

const viewPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/mailer'
)
const templates = fs
  .readdirSync(viewPath)
  .filter((f) => f.endsWith('.handlebars'))
  .map((f) => path.basename(f, '.handlebars'))

describe('mailer templates', () => {
  it.each(templates)('renders %s with its context', async (template) => {
    await import('../helpers/mailer.js')
    const source = fs.readFileSync(
      path.join(viewPath, `${template}.handlebars`),
      'utf8'
    )
    const vars = [
      ...new Set([...source.matchAll(/{{(\w+)}}/g)].map((m) => m[1]))
    ]
    const context = Object.fromEntries(vars.map((v) => [v, `value-of-${v}`]))

    const info = await holder.transporter!.sendMail({
      from: 'bilbomd@example.org',
      to: 'user@example.org',
      subject: 'Template test',
      template,
      context
    } as Parameters<Transporter['sendMail']>[0])

    const { html } = JSON.parse(info.message as string)
    expect(vars.length).toBeGreaterThan(0)
    for (const v of vars) expect(html).toContain(`value-of-${v}`)
  })
})
