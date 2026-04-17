type AllowedOrigin = string

const allowedOrigins: AllowedOrigin[] = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3030',
  'http://localhost:3500',
  'http://localhost:3501',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3030',
  'http://127.0.0.1:3500',
  'http://127.0.0.1:3501',
  'http://192.168.1.1:3001',
  'http://192.168.1.1:3500',
  'http://192.168.1.1:3501',
  'http://192.168.40.7:3001',
  'http://192.168.40.7:3500',
  'http://192.168.1.7:3001',
  'http://192.168.1.7:3500',
  'http://192.168.1.104:80',
  'https://192.168.1.104:443',
  'https://bl1231.als.lbl.gov',
  'https://bilbomd.bl1231.als.lbl.gov',
  'https://bilbomd-dev.bl1231.als.lbl.gov',
  'http://ingress.bilbomd.development.svc.spin.nersc.org',
  'https://bilbomd-nersc-dev.bl1231.als.lbl.gov',
  'http://ingress.bilbomd.production.svc.spin.nersc.org',
  'https://bilbomd-nersc.bl1231.als.lbl.gov'
]

// Auto-derive the UI origin from BILBOMD_URL + BILBOMD_UI_PORT so external
// installs work without hardcoding their host in the image.
const bilbomdUrl = process.env.BILBOMD_URL
const bilbomdUiPort = process.env.BILBOMD_UI_PORT
if (bilbomdUrl) {
  allowedOrigins.push(bilbomdUrl)
  if (bilbomdUiPort) {
    allowedOrigins.push(`${bilbomdUrl}:${bilbomdUiPort}`)
  }
}

// Escape hatch for any additional origins (comma-separated).
const extra = process.env.CORS_ALLOWED_ORIGINS
if (extra) {
  extra
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((o) => allowedOrigins.push(o))
}

export { allowedOrigins }
