// Validation and normalization of experimental SAXS data files.
//
// This is the single source of truth for what BilboMD accepts as SAXS data.
// The UI runs it in the browser when a file is selected and the backend runs
// it again on upload, so interactive and API-submitted jobs are held to the
// same rules:
//
//   - q must end up in Å⁻¹. Files in nm⁻¹ are detected and converted.
//   - Points below SAXS_Q_MIN or above SAXS_Q_MAX are removed (with a warning).
//   - Fewer than SAXS_MIN_POINTS_WARN remaining points is a warning.
//   - A file whose q units cannot be determined is rejected; the user resolves
//     it by stating the units explicitly (q_units).

export const Q_UNITS = ['auto', 'A', 'nm'] as const
export type QUnits = (typeof Q_UNITS)[number]
export type SaxsQUnits = Exclude<QUnits, 'auto'>

export const SAXS_Q_MIN = 0.005
export const SAXS_Q_MAX = 0.45
export const SAXS_MIN_POINTS_WARN = 100
// Below this there is not enough data for a Guinier fit, so the job cannot run.
export const SAXS_MIN_POINTS = 10
export const SAXS_MAX_FILE_SIZE = 2_000_000

// First line of every file BilboMD rewrites. A file carrying it is already in
// Å⁻¹ no matter what q_units says, which keeps resubmissions (which reuse the
// stored file) from being converted twice.
export const SAXS_NORMALIZED_MARKER = '# BilboMD normalized SAXS data'

export const isQUnits = (value: unknown): value is QUnits =>
  typeof value === 'string' && (Q_UNITS as readonly string[]).includes(value)

export interface SaxsPoint {
  q: number
  intensity: number
  error: number
}

// How the units of the uploaded file were established.
export type SaxsUnitsSource = 'user' | 'header' | 'detected' | 'normalized'

export interface SaxsDataStats {
  totalPoints: number
  keptPoints: number
  trimmedLowQ: number
  trimmedHighQ: number
  // q range of the retained points, in Å⁻¹
  qMin?: number
  qMax?: number
  // Guinier Rg estimate in Å, when a fit was found
  guinierRg?: number
}

export interface SaxsDataAnalysis {
  valid: boolean
  // Why the file was rejected (only when !valid)
  message?: string
  warnings: string[]
  // Units of the file as uploaded
  units?: SaxsQUnits
  unitsSource?: SaxsUnitsSource
  // True when the file has to be rewritten (converted and/or trimmed)
  changed: boolean
  // Replacement file contents (only when valid && changed)
  normalizedText?: string
  // Retained points, q in Å⁻¹
  points: SaxsPoint[]
  stats: SaxsDataStats
}

export interface AnalyzeSaxsDataOptions {
  qUnits?: QUnits
}

interface DataRow {
  q: number
  intensity: number
  error: number
  // Original text of the row, kept so rewriting never alters a value it does
  // not have to: `qText` is the q column, `rest` is everything after it
  qText: string
  rest: string
}

const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

const parseRow = (line: string): DataRow | null => {
  const tokens = line.trim().split(/\s+/)
  if (tokens.length < 3) return null
  const [qTok, iTok, eTok] = tokens as [string, string, string]
  if (!NUMERIC.test(qTok) || !NUMERIC.test(iTok) || !NUMERIC.test(eTok)) {
    return null
  }
  const q = Number(qTok)
  const intensity = Number(iTok)
  const error = Number(eTok)
  if (![q, intensity, error].every(Number.isFinite)) return null
  return { q, intensity, error, qText: qTok, rest: tokens.slice(1).join(' ') }
}

// Unit declarations in header/comment lines. Only inverse-length forms are
// matched, so "wavelength 0.1 nm" or a sample called "A-1" do not count.
const NM_HEADER = [
  /1\s*\/\s*nm(?![a-z])/i,
  /(?<![a-z])nm\s*(?:\^\s*\(?\s*-\s*1|\*\*\s*-\s*1|⁻¹|-1(?!\d))/i,
  /inverse\s+nanomet/i
]
const A_HEADER = [
  /1\s*\/\s*(?:Å|A(?![a-z])|Ang)/i,
  /(?:Å|(?<![a-z])A|Angstroms?)\s*(?:\^\s*\(?\s*-\s*1|\*\*\s*-\s*1|⁻¹)/i,
  /Å\s*-1(?!\d)/,
  /[[(]\s*A\s*-1\s*[\])]/,
  /inverse\s+angstrom/i
]
const MAX_HEADER_LINES = 500

const detectHeaderUnits = (textLines: string[]): SaxsQUnits | undefined => {
  let nm = false
  let angstrom = false
  for (const line of textLines.slice(0, MAX_HEADER_LINES)) {
    if (NM_HEADER.some((re) => re.test(line))) nm = true
    if (A_HEADER.some((re) => re.test(line))) angstrom = true
  }
  if (nm === angstrom) return undefined
  return nm ? 'nm' : 'A'
}

// A curve recorded in Å⁻¹ normally starts below ~0.04 and ends below ~1.0;
// the same curve in nm⁻¹ starts above 0.04 and ends above 1.0. Only vote
// when both ends agree.
const NM_QMAX_ABOVE = 1.0
const NM_QMIN_ABOVE = 0.04

const voteFromQRange = (qMin: number, qMax: number): SaxsQUnits | undefined => {
  if (qMax > NM_QMAX_ABOVE && qMin > NM_QMIN_ABOVE) return 'nm'
  if (qMax <= NM_QMAX_ABOVE && qMin <= NM_QMIN_ABOVE) return 'A'
  return undefined
}

// Guinier Rg comes out in the inverse of whatever units q is in, so a file in
// nm⁻¹ yields an Rg ten times too small. BilboMD needs Rg >= 10 Å, so anything
// smaller points to nm⁻¹; an Rg that would exceed 200 Å after a ×10 correction
// points to Å⁻¹. In between the Rg alone cannot tell.
const RG_NM_BELOW = 10
const RG_A_ABOVE = 20

const voteFromRg = (rg: number | undefined): SaxsQUnits | undefined => {
  if (rg === undefined) return undefined
  if (rg < RG_NM_BELOW) return 'nm'
  if (rg > RG_A_ABOVE) return 'A'
  return undefined
}

const GUINIER_MAX_POINTS = 400
const GUINIER_MIN_POINTS = 10
const GUINIER_QRG_MIN = 0.3
const GUINIER_QRG_MAX = 1.3
const GUINIER_R2_FLOOR = 0.9

/**
 * Estimate Rg from the low-q end of a curve with a weighted Guinier window
 * scan (the same search as tools/python/guinier.py, limited to the lowest-q
 * points). Returns undefined when no acceptable Guinier region exists. Rg is
 * in the inverse of the units of q. The window criteria are dimensionless, so
 * the chosen window does not depend on the units.
 */
export const estimateGuinierRg = (points: SaxsPoint[]): number | undefined => {
  const usable = points
    .filter((p) => p.q > 0 && p.intensity > 0 && p.error > 0)
    .sort((a, b) => a.q - b.q)
    .slice(0, GUINIER_MAX_POINTS)
  const n = usable.length
  if (n < GUINIER_MIN_POINTS) return undefined

  // Prefix sums make each window's weighted least-squares fit O(1)
  const W = new Float64Array(n + 1)
  const WX = new Float64Array(n + 1)
  const WY = new Float64Array(n + 1)
  const WXX = new Float64Array(n + 1)
  const WXY = new Float64Array(n + 1)
  const WYY = new Float64Array(n + 1)
  usable.forEach((p, k) => {
    const x = p.q * p.q
    const y = Math.log(p.intensity)
    const w = 1 / (p.error * p.error)
    W[k + 1] = W[k]! + w
    WX[k + 1] = WX[k]! + w * x
    WY[k + 1] = WY[k]! + w * y
    WXX[k + 1] = WXX[k]! + w * x * x
    WXY[k + 1] = WXY[k]! + w * x * y
    WYY[k + 1] = WYY[k]! + w * y * y
  })

  let best: { rg: number; r2: number; length: number } | undefined
  for (let i = 0; i <= n - GUINIER_MIN_POINTS; i++) {
    for (let j = i + GUINIER_MIN_POINTS - 1; j < n; j++) {
      const wsum = W[j + 1]! - W[i]!
      const wx = WX[j + 1]! - WX[i]!
      const wy = WY[j + 1]! - WY[i]!
      const wxx = WXX[j + 1]! - WXX[i]!
      const wxy = WXY[j + 1]! - WXY[i]!
      const wyy = WYY[j + 1]! - WYY[i]!

      const denom = wsum * wxx - wx * wx
      if (denom <= 0) continue
      const slope = (wsum * wxy - wx * wy) / denom
      if (slope >= 0) continue
      const intercept = (wy - slope * wx) / wsum

      const sse =
        wyy -
        2 * slope * wxy -
        2 * intercept * wy +
        slope * slope * wxx +
        2 * slope * intercept * wx +
        intercept * intercept * wsum
      const ybar = wy / wsum
      const sst = wyy - wsum * ybar * ybar
      if (sst <= 0) continue
      const r2 = 1 - sse / sst
      if (r2 < GUINIER_R2_FLOOR) continue

      const rg = Math.sqrt(-3 * slope)
      const qrgLo = usable[i]!.q * rg
      const qrgHi = usable[j]!.q * rg
      if (qrgLo < GUINIER_QRG_MIN || qrgHi > GUINIER_QRG_MAX) continue

      const length = j - i
      if (
        !best ||
        r2 > best.r2 + 1e-9 ||
        (Math.abs(r2 - best.r2) <= 1e-9 && length > best.length)
      ) {
        best = { rg, r2, length }
      }
    }
  }
  return best?.rg
}

const UNIT_LABEL: Record<SaxsQUnits, string> = { A: 'Å⁻¹', nm: 'nm⁻¹' }

const fmt = (value: number) => String(Number(value.toPrecision(4)))

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

interface UnitDecision {
  units?: SaxsQUnits
  source?: SaxsUnitsSource
  // What the evidence in the file says, regardless of q_units
  evidence?: SaxsQUnits
}

const decideFromEvidence = (
  header: SaxsQUnits | undefined,
  qRange: SaxsQUnits | undefined,
  rg: SaxsQUnits | undefined
): { units?: SaxsQUnits; source?: SaxsUnitsSource } => {
  if (header) {
    // A header is trusted unless both independent checks contradict it
    const contradicted =
      qRange !== undefined &&
      rg !== undefined &&
      qRange !== header &&
      rg !== header
    return contradicted ? {} : { units: header, source: 'header' }
  }
  const votes = new Set([qRange, rg].filter((v) => v !== undefined))
  if (votes.size !== 1) return {}
  return { units: [...votes][0], source: 'detected' }
}

const buildNormalizedText = (
  rows: { qText: string; rest: string }[],
  notes: string[]
) =>
  [
    `${SAXS_NORMALIZED_MARKER}: q (1/A), I(q), error`,
    ...notes.map((note) => `# ${note}`),
    ...rows.map((row) => `${row.qText} ${row.rest}`)
  ].join('\n') + '\n'

/**
 * Validate the text of a SAXS data file and work out how it must be
 * normalized. Pure and synchronous so the UI and backend get identical
 * answers for identical input.
 */
export const analyzeSaxsData = (
  text: string,
  options: AnalyzeSaxsDataOptions = {}
): SaxsDataAnalysis => {
  const qUnits = options.qUnits ?? 'auto'
  const warnings: string[] = []
  const stats: SaxsDataStats = {
    totalPoints: 0,
    keptPoints: 0,
    trimmedLowQ: 0,
    trimmedHighQ: 0
  }
  const reject = (message: string): SaxsDataAnalysis => ({
    valid: false,
    message,
    warnings,
    changed: false,
    points: [],
    stats
  })

  const rows: DataRow[] = []
  const textLines: string[] = []
  let alreadyNormalized = false
  for (const line of text.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith(SAXS_NORMALIZED_MARKER)) {
      alreadyNormalized = true
      continue
    }
    const row = trimmed.startsWith('#') ? null : parseRow(trimmed)
    if (row) rows.push(row)
    else textLines.push(trimmed)
  }
  stats.totalPoints = rows.length

  if (rows.length === 0) {
    return reject(
      'No SAXS data found. Expected three numeric columns: q, I(q), and error.'
    )
  }

  const positiveQ = rows.map((r) => r.q).filter((q) => q > 0)
  if (positiveQ.length === 0) {
    return reject('No SAXS data found. All q values are zero or negative.')
  }
  const rawQMin = positiveQ.reduce((a, b) => Math.min(a, b))
  const rawQMax = positiveQ.reduce((a, b) => Math.max(a, b))
  const rawRg = estimateGuinierRg(rows)

  // --- Units ---------------------------------------------------------------
  const decision: UnitDecision = {}
  if (alreadyNormalized) {
    decision.units = 'A'
    decision.source = 'normalized'
  } else {
    const fromEvidence = decideFromEvidence(
      detectHeaderUnits(textLines),
      voteFromQRange(rawQMin, rawQMax),
      voteFromRg(rawRg)
    )
    decision.evidence = fromEvidence.units
    if (qUnits !== 'auto') {
      decision.units = qUnits
      decision.source = 'user'
    } else {
      decision.units = fromEvidence.units
      decision.source = fromEvidence.source
    }
  }

  if (!decision.units) {
    const rgNote =
      rawRg !== undefined ? ` and the Guinier Rg is about ${fmt(rawRg)}` : ''
    return reject(
      `Cannot tell whether q is in Å⁻¹ or nm⁻¹: q runs from ${fmt(rawQMin)} to ${fmt(rawQMax)}${rgNote}, which fits either. ` +
        `Please state the q units explicitly (q_units: "A" for Å⁻¹ or "nm" for nm⁻¹).`
    )
  }
  const units = decision.units
  const notes: string[] = []

  if (
    decision.source === 'user' &&
    decision.evidence &&
    decision.evidence !== units
  ) {
    warnings.push(
      `q units were set to ${UNIT_LABEL[units]}, but the data look like ${UNIT_LABEL[decision.evidence]}. Proceeding with ${UNIT_LABEL[units]} as requested; please double-check.`
    )
  }

  const scale = units === 'nm' ? 0.1 : 1
  if (units === 'nm') {
    const how =
      decision.source === 'user'
        ? 'as specified'
        : decision.source === 'header'
          ? 'according to the file header'
          : `judging by the q range of ${fmt(rawQMin)}–${fmt(rawQMax)}`
    warnings.push(
      `q values are in nm⁻¹ (${how}). BilboMD works in Å⁻¹, so q is divided by 10.`
    )
    notes.push('q converted from 1/nm to 1/A (divided by 10)')
  }

  // --- Convert and trim ----------------------------------------------------
  const kept: (SaxsPoint & { qText: string; rest: string })[] = []
  for (const row of rows) {
    // Round away floating-point noise from the division so the value we test
    // is exactly the value we write
    const q = units === 'nm' ? Number((row.q * scale).toPrecision(10)) : row.q
    if (q < SAXS_Q_MIN) stats.trimmedLowQ++
    else if (q > SAXS_Q_MAX) stats.trimmedHighQ++
    else {
      kept.push({
        q,
        intensity: row.intensity,
        error: row.error,
        qText: units === 'nm' ? String(q) : row.qText,
        rest: row.rest
      })
    }
  }
  stats.keptPoints = kept.length

  if (stats.trimmedLowQ > 0) {
    warnings.push(
      `${plural(stats.trimmedLowQ, 'data point')} below q = ${SAXS_Q_MIN} Å⁻¹ ${stats.trimmedLowQ === 1 ? 'is' : 'are'} removed.`
    )
    notes.push(
      `${plural(stats.trimmedLowQ, 'point')} below q = ${SAXS_Q_MIN} removed`
    )
  }
  if (stats.trimmedHighQ > 0) {
    warnings.push(
      `${plural(stats.trimmedHighQ, 'data point')} above q = ${SAXS_Q_MAX} Å⁻¹ ${stats.trimmedHighQ === 1 ? 'is' : 'are'} removed.`
    )
    notes.push(
      `${plural(stats.trimmedHighQ, 'point')} above q = ${SAXS_Q_MAX} removed`
    )
  }

  if (kept.length < SAXS_MIN_POINTS) {
    return reject(
      `Only ${plural(kept.length, 'data point')} between q = ${SAXS_Q_MIN} and ${SAXS_Q_MAX} Å⁻¹ (q read as ${UNIT_LABEL[units]}). At least ${SAXS_MIN_POINTS} are required.`
    )
  }
  if (kept.length < SAXS_MIN_POINTS_WARN) {
    warnings.push(
      `Only ${kept.length} data points between q = ${SAXS_Q_MIN} and ${SAXS_Q_MAX} Å⁻¹. At least ${SAXS_MIN_POINTS_WARN} are recommended.`
    )
  }

  stats.qMin = kept.reduce((a, p) => Math.min(a, p.q), Infinity)
  stats.qMax = kept.reduce((a, p) => Math.max(a, p.q), -Infinity)
  if (rawRg !== undefined) stats.guinierRg = rawRg / scale

  const changed =
    units === 'nm' || stats.trimmedLowQ > 0 || stats.trimmedHighQ > 0

  return {
    valid: true,
    warnings,
    units,
    unitsSource: decision.source,
    changed,
    normalizedText: changed ? buildNormalizedText(kept, notes) : undefined,
    points: kept.map(({ q, intensity, error }) => ({ q, intensity, error })),
    stats
  }
}
