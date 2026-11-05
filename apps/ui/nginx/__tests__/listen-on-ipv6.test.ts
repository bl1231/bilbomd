// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const nginxDir = join(import.meta.dirname, '..')
const script = join(nginxDir, '15-listen-on-ipv6.sh')
const realConf = readFileSync(join(nginxDir, 'nginx.default.conf'), 'utf8')

describe('15-listen-on-ipv6.sh', () => {
  let dir: string
  let conf: string
  let ifInet6: string

  const run = (opts: { ipv6: boolean }) => {
    if (opts.ipv6) writeFileSync(ifInet6, '')
    return execFileSync('sh', [script], {
      env: {
        ...process.env,
        BILBOMD_NGINX_CONF: conf,
        BILBOMD_IF_INET6: ifInet6
      },
      encoding: 'utf8'
    })
  }

  const listenLines = () =>
    readFileSync(conf, 'utf8')
      .split('\n')
      .filter((line) => /^\s*listen\s/.test(line))

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nginx-ipv6-'))
    conf = join(dir, 'default.conf')
    ifInet6 = join(dir, 'if_inet6')
    writeFileSync(conf, realConf)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('adds a [::]:80 listener after `listen 80;` when IPv6 is available', () => {
    const out = run({ ipv6: true })
    expect(out).toContain('added IPv6 listener')
    expect(listenLines()).toEqual([
      '    listen       80;',
      '    listen       [::]:80;'
    ])
  })

  it('leaves the rest of the config unchanged', () => {
    run({ ipv6: true })
    const after = readFileSync(conf, 'utf8').replace(
      '    listen       [::]:80;\n',
      ''
    )
    expect(after).toBe(realConf)
  })

  it('does nothing when the container has no IPv6 stack', () => {
    const out = run({ ipv6: false })
    expect(out).toContain('no IPv6 stack')
    expect(readFileSync(conf, 'utf8')).toBe(realConf)
  })

  it('is idempotent across container restarts', () => {
    run({ ipv6: true })
    const out = run({ ipv6: true })
    expect(out).toContain('already present')
    expect(listenLines()).toHaveLength(2)
  })
})
