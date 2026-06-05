/* eslint-disable no-console */
// Lightweight logger for the UI.
//
// `log`/`debug`/`info` are no-ops in production builds so stray diagnostics
// don't ship to the browser console. `warn`/`error` always pass through to the
// console (dynamically, so test spies on `console.error`/`console.warn` still
// observe them) and provide a single seam for routing to a reporting service
// later.
const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(...args)
  },
  error: (...args: unknown[]) => {
    console.error(...args)
  }
}
