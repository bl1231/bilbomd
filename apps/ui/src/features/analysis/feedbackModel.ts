import type {
  FeedbackFinding,
  FeedbackModel,
  FeedbackRegion,
  FeedbackRegionName,
  FeedbackSeverity,
  FoxsData,
  JobFeedbackDTO
} from '@bilbomd/bilbomd-types'

// What the Feedback & Validation tab draws, whichever version of the report
// the job has stored.

export type MwStatus =
  | 'consistent'
  | 'differs'
  | 'low_confidence'
  | 'not_assessed'
  // Reports from before version 2 computed MW unreliably; it is not shown
  | 'legacy'

export type MwView = {
  status: MwStatus
  modelKda: number | null
  saxsKda: number | null
  // (saxs - model) / model
  diffFraction: number | null
  note: string | null
  guinierRg: number | null
}

export type FeedbackView = {
  // true for reports stored before version 2
  legacy: boolean
  // The overall fit finding
  verdict: FeedbackFinding
  // Every other finding, in the order the report lists them
  findings: FeedbackFinding[]
  regions: FeedbackRegion[]
  models: FeedbackModel[]
  assessed: { states: number | undefined; file: string; chiSquare: number }
  mw: MwView
}

export type ResidualPoint = { q: number; residual: number }

const SEVERITY_RANK: Record<FeedbackSeverity, number> = {
  good: 0,
  info: 1,
  warning: 2,
  problem: 3
}

export const ALERT_SEVERITY: Record<
  FeedbackSeverity,
  'success' | 'info' | 'warning' | 'error'
> = {
  good: 'success',
  info: 'info',
  warning: 'warning',
  problem: 'error'
}

// Said alongside the icon so status is never carried by colour alone
export const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  good: 'Good',
  info: 'Note',
  warning: 'Check',
  problem: 'Problem'
}

export const REGION_LABEL: Record<FeedbackRegionName, string> = {
  low: 'Low q',
  mid: 'Mid q',
  high: 'High q'
}

// The first version of the report replaced its fit messages with a "check
// your sequence or oligomerization state" verdict when MW differed by more
// than this. Its MW values were unreliable, so those messages are dropped.
const LEGACY_MW_GATE = 0.3

const LEGACY_REGION_NAMES: FeedbackRegionName[] = ['low', 'mid', 'high']

export const statesInFile = (file: string): number | undefined => {
  const match = file.match(/multi_state_model_(\d+)_/)
  return match ? Number(match[1]) : undefined
}

export const stateLabel = (states: number | undefined): string => {
  if (states === undefined) return 'model'
  return states === 1 ? 'single-state model' : `${states}-state ensemble`
}

const isVersion2 = (
  feedback: JobFeedbackDTO
): feedback is JobFeedbackDTO & { findings: FeedbackFinding[] } =>
  (feedback.version ?? 1) >= 2 && Array.isArray(feedback.findings)

const mwStatusFromFindings = (findings: FeedbackFinding[]): MwStatus => {
  const codes = new Set(findings.map((finding) => finding.code))
  if (codes.has('mw_differs')) return 'differs'
  if (codes.has('mw_consistent')) return 'consistent'
  if (codes.has('mw_low_confidence')) return 'low_confidence'
  return 'not_assessed'
}

const fromVersion2 = (
  feedback: JobFeedbackDTO & { findings: FeedbackFinding[] }
): FeedbackView => {
  const { findings } = feedback
  const verdict =
    findings.find((finding) => finding.code.startsWith('fit_')) ?? findings[0]
  const models = feedback.models ?? []
  const selected = models.find((model) => model.selected)
  return {
    legacy: false,
    verdict: verdict ?? {
      code: 'fit_unknown',
      severity: 'info',
      title: `χ² ${feedback.overall_chi_square.toFixed(2)}`,
      detail: ''
    },
    findings: findings.filter((finding) => finding !== verdict),
    regions: feedback.regions ?? [],
    models,
    assessed: {
      states: selected?.states ?? statesInFile(feedback.best_model_dat_file),
      file: feedback.best_model_dat_file,
      chiSquare: feedback.overall_chi_square
    },
    mw: {
      status: mwStatusFromFindings(findings),
      modelKda: feedback.mw?.model_kda ?? null,
      saxsKda: feedback.mw?.saxs_kda ?? null,
      diffFraction: feedback.mw?.diff_fraction ?? null,
      note: feedback.mw?.reason ?? null,
      guinierRg: feedback.mw?.guinier?.rg ?? null
    }
  }
}

const legacyFinding = (
  code: string,
  title: string,
  detail: string | null | undefined
): FeedbackFinding[] =>
  detail ? [{ code, severity: 'info', title, detail }] : []

const fromLegacy = (feedback: JobFeedbackDTO): FeedbackView => {
  const file = feedback.best_model_dat_file || feedback.best_model || ''
  const gated = (feedback.mw_err ?? 0) > LEGACY_MW_GATE
  const edges = feedback.q_ranges
  const regions: FeedbackRegion[] = feedback.chi_squares_of_regions.flatMap(
    (chiSquare, index) => {
      const name = LEGACY_REGION_NAMES[index]
      const qMin = edges[index]
      const qMax = edges[index + 1]
      if (!name || qMin === undefined || qMax === undefined) return []
      return [
        {
          name,
          q_min: qMin,
          q_max: qMax,
          // Not recorded by the first version of the report
          n_points: 0,
          chi_square: chiSquare,
          mean_residual: feedback.residuals_of_regions[index] ?? 0
        }
      ]
    }
  )
  const states = statesInFile(file)
  return {
    legacy: true,
    verdict: {
      code: 'fit_legacy',
      severity: 'info',
      title: `χ² ${feedback.overall_chi_square.toFixed(2)}`,
      detail: gated ? '' : feedback.overall_chi_square_feedback
    },
    findings: [
      ...legacyFinding(
        'legacy_highest',
        'Highest χ² region',
        feedback.highest_chi_square_feedback
      ),
      ...legacyFinding(
        'legacy_second',
        'Second highest χ² region',
        feedback.second_highest_chi_square_feedback
      ),
      ...(gated
        ? []
        : legacyFinding(
            'legacy_regional',
            'Interpretation',
            feedback.regional_chi_square_feedback
          ))
    ],
    regions,
    models: [],
    assessed: { states, file, chiSquare: feedback.overall_chi_square },
    mw: {
      status: 'legacy',
      modelKda: null,
      saxsKda: null,
      diffFraction: null,
      note: null,
      guinierRg: null
    }
  }
}

export const toFeedbackView = (feedback: JobFeedbackDTO): FeedbackView =>
  isVersion2(feedback) ? fromVersion2(feedback) : fromLegacy(feedback)

// The worst severity in the report when it is a warning or a problem; used to
// mark the tab so trouble is visible before the tab is opened.
export const feedbackAttention = (
  feedback: JobFeedbackDTO | undefined
): 'warning' | 'problem' | undefined => {
  if (!feedback || !isVersion2(feedback)) return undefined
  const worst = feedback.findings.reduce<FeedbackSeverity>(
    (current, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current]
        ? finding.severity
        : current,
    'good'
  )
  return worst === 'warning' || worst === 'problem' ? worst : undefined
}

export type MwMismatch = {
  modelKda: number
  saxsKda: number
  diffFraction: number
}

// A model/SAXS mass mismatch the report considers worth a warning. Reports
// from before version 2 never qualify: their MW values were unreliable.
export const mwMismatch = (
  feedback: JobFeedbackDTO | undefined
): MwMismatch | undefined => {
  if (!feedback || !isVersion2(feedback)) return undefined
  if (!feedback.findings.some((finding) => finding.code === 'mw_differs')) {
    return undefined
  }
  const { model_kda, saxs_kda, diff_fraction } = feedback.mw ?? {}
  if (
    typeof model_kda !== 'number' ||
    typeof saxs_kda !== 'number' ||
    typeof diff_fraction !== 'number'
  ) {
    return undefined
  }
  return { modelKda: model_kda, saxsKda: saxs_kda, diffFraction: diff_fraction }
}

export const formatPercent = (fraction: number): string =>
  `${Math.round(Math.abs(fraction) * 100)}%`

// "12% lower" / "40% higher", relative to the model
export const describeDiff = (diffFraction: number): string =>
  `${formatPercent(diffFraction)} ${diffFraction >= 0 ? 'higher' : 'lower'}`

export const findFit = (
  foxsData: FoxsData[] | undefined,
  file: string
): FoxsData | undefined => foxsData?.find((fit) => fit.filename === file)

// Error-normalised residuals of a fit, skipping points that cannot be scored
export const residualPoints = (fit: FoxsData | undefined): ResidualPoint[] =>
  (fit?.data ?? []).flatMap((point) => {
    const residual = (point.exp_intensity - point.model_intensity) / point.error
    return point.error > 0 && Number.isFinite(residual)
      ? [{ q: point.q, residual }]
      : []
  })

// Round q values (multiples of 0.05 Å⁻¹) inside the data range, for axis ticks
export const qAxisTicks = (qMin: number, qMax: number): number[] => {
  const ticks: number[] = []
  for (let step = Math.ceil(qMin / 0.05); step * 0.05 <= qMax + 1e-9; step++) {
    if (step > 0) ticks.push(Number((step * 0.05).toFixed(2)))
  }
  return ticks
}

// Residuals are drawn on a symmetric axis. A handful of wild points should
// not flatten everything else, so the axis stops at this many sigma.
export const RESIDUAL_AXIS_MAX = 8

export const residualAxisLimit = (points: ResidualPoint[]): number => {
  const largest = points.reduce(
    (max, point) => Math.max(max, Math.abs(point.residual)),
    0
  )
  return Math.min(RESIDUAL_AXIS_MAX, Math.max(3, Math.ceil(largest)))
}
