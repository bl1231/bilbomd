import { describe, it, expect } from 'vitest'
import {
  analyzeSaxsData,
  estimateGuinierRg,
  isQUnits,
  SAXS_NORMALIZED_MARKER,
  SAXS_Q_MAX,
  SAXS_Q_MIN
} from '../saxsData.js'

interface CurveOptions {
  rg?: number
  qStart?: number
  qEnd?: number
  qStep?: number
  // Multiplier applied to q when writing, e.g. 10 to write the curve in nm⁻¹
  qScale?: number
}

// A Guinier-like curve with a flat background, q in Å⁻¹ unless qScale is set
const buildCurve = ({
  rg = 30,
  qStart = 0.01,
  qEnd = 0.4,
  qStep = 0.002,
  qScale = 1
}: CurveOptions = {}): string => {
  const lines: string[] = []
  const count = Math.round((qEnd - qStart) / qStep) + 1
  for (let k = 0; k < count; k++) {
    const q = qStart + k * qStep
    const intensity = 1000 * Math.exp(-(q * q * rg * rg) / 3) + 1
    const error = intensity * 0.02
    lines.push(
      `${(q * qScale).toFixed(5)} ${intensity.toExponential(6)} ${error.toExponential(6)}`
    )
  }
  return lines.join('\n') + '\n'
}

describe('analyzeSaxsData: well-formed Å⁻¹ data', () => {
  it('accepts the file unchanged with no warnings', () => {
    const result = analyzeSaxsData(buildCurve())
    expect(result.valid).toBe(true)
    expect(result.units).toBe('A')
    expect(result.unitsSource).toBe('detected')
    expect(result.changed).toBe(false)
    expect(result.normalizedText).toBeUndefined()
    expect(result.warnings).toEqual([])
    expect(result.stats.keptPoints).toBe(result.stats.totalPoints)
  })

  it('ignores comments, blank lines and CRLF line endings', () => {
    const text = `# header\r\n\r\n${buildCurve().replace(/\n/g, '\r\n')}`
    const result = analyzeSaxsData(text)
    expect(result.valid).toBe(true)
    expect(result.stats.totalPoints).toBe(196)
  })

  it('does not treat text lines that contain numbers as data', () => {
    const text = `sample 1 2 3\nrun 7 of 12 at 20 C\n${buildCurve()}`
    const result = analyzeSaxsData(text)
    expect(result.stats.totalPoints).toBe(196)
  })
})

describe('analyzeSaxsData: rejections', () => {
  it('rejects a file with no numeric rows', () => {
    const result = analyzeSaxsData('not saxs data\nat all\n')
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/No SAXS data found/)
  })

  it('rejects two-column data', () => {
    const text = buildCurve()
      .split('\n')
      .map((line) => line.split(' ').slice(0, 2).join(' '))
      .join('\n')
    expect(analyzeSaxsData(text).valid).toBe(false)
  })

  it('rejects when fewer than 10 points fall in the supported q range', () => {
    const result = analyzeSaxsData(buildCurve({ qEnd: 0.022 }), {
      qUnits: 'A'
    })
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/At least 10 are required/)
  })
})

describe('analyzeSaxsData: point count', () => {
  it('warns but accepts when fewer than 100 points remain', () => {
    const result = analyzeSaxsData(buildCurve({ qStep: 0.005 }))
    expect(result.valid).toBe(true)
    expect(result.stats.keptPoints).toBe(79)
    expect(result.changed).toBe(false)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/Only 79 data points/)
  })
})

describe('analyzeSaxsData: trimming', () => {
  it('removes points below the minimum q with a warning', () => {
    const result = analyzeSaxsData(buildCurve({ qStart: 0.001 }))
    expect(result.valid).toBe(true)
    expect(result.stats.trimmedLowQ).toBe(2)
    expect(result.stats.qMin).toBeGreaterThanOrEqual(SAXS_Q_MIN)
    expect(result.changed).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/2 data points below q = 0.005/)
  })

  it('removes points above the maximum q with a warning', () => {
    const result = analyzeSaxsData(buildCurve({ qEnd: 0.6 }))
    expect(result.valid).toBe(true)
    expect(result.stats.trimmedHighQ).toBe(75)
    expect(result.stats.qMax).toBeLessThanOrEqual(SAXS_Q_MAX)
    expect(result.changed).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/75 data points above q = 0.45/)
  })

  it('keeps points exactly on the limits', () => {
    const result = analyzeSaxsData(
      buildCurve({ qStart: 0.005, qEnd: 0.45, qStep: 0.005 })
    )
    expect(result.stats.trimmedLowQ).toBe(0)
    expect(result.stats.trimmedHighQ).toBe(0)
    expect(result.changed).toBe(false)
  })

  it('writes surviving rows verbatim when only trimming', () => {
    const text = buildCurve({ qEnd: 0.6 })
    const result = analyzeSaxsData(text)
    const written = result.normalizedText!.split('\n')
    expect(written[0]).toContain(SAXS_NORMALIZED_MARKER)
    const firstRow = written.find((line) => !line.startsWith('#'))
    expect(firstRow).toBe(text.split('\n')[0])
  })
})

describe('analyzeSaxsData: nm⁻¹ detection and conversion', () => {
  const angstrom = buildCurve()
  const nm = buildCurve({ qScale: 10 })

  it('detects nm⁻¹ and converts to Å⁻¹', () => {
    const result = analyzeSaxsData(nm)
    expect(result.valid).toBe(true)
    expect(result.units).toBe('nm')
    expect(result.unitsSource).toBe('detected')
    expect(result.changed).toBe(true)
    expect(result.warnings[0]).toMatch(/nm⁻¹.*divided by 10/)
    expect(result.points.map((p) => p.q)).toEqual(
      analyzeSaxsData(angstrom).points.map((p) => p.q)
    )
  })

  it('leaves intensity and error columns untouched', () => {
    const result = analyzeSaxsData(nm)
    const dataRows = (text: string) =>
      text
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(' ').slice(1).join(' '))
    expect(dataRows(result.normalizedText!)).toEqual(dataRows(nm))
  })

  it('reports the Guinier Rg in Å after conversion', () => {
    expect(analyzeSaxsData(nm).stats.guinierRg).toBeCloseTo(30, 0)
  })

  it('is idempotent: a normalized file is never converted again', () => {
    const first = analyzeSaxsData(nm, { qUnits: 'nm' })
    const again = analyzeSaxsData(first.normalizedText!, { qUnits: 'nm' })
    expect(again.valid).toBe(true)
    expect(again.units).toBe('A')
    expect(again.unitsSource).toBe('normalized')
    expect(again.changed).toBe(false)
    expect(again.warnings).toEqual([])
    expect(again.points).toEqual(first.points)
  })

  it('converts then trims, in that order', () => {
    // 0.02–6.0 nm⁻¹ is 0.002–0.6 Å⁻¹
    const result = analyzeSaxsData(
      buildCurve({ qStart: 0.002, qEnd: 0.6, qScale: 10 }),
      { qUnits: 'nm' }
    )
    expect(result.stats.trimmedLowQ).toBe(2)
    expect(result.stats.trimmedHighQ).toBe(75)
    expect(result.stats.qMin).toBeGreaterThanOrEqual(SAXS_Q_MIN)
    expect(result.stats.qMax).toBeLessThanOrEqual(SAXS_Q_MAX)
  })
})

describe('analyzeSaxsData: ambiguous units', () => {
  // A small protein measured out to wide angle in Å⁻¹. Read as nm⁻¹ it would
  // be a plausible 150 Å particle, so nothing in the file settles the units.
  const wideAngle = buildCurve({ rg: 15, qEnd: 1.5, qStep: 0.005 })

  it('rejects and asks for q_units', () => {
    const result = analyzeSaxsData(wideAngle)
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/Cannot tell whether q is in Å⁻¹ or nm⁻¹/)
    expect(result.message).toMatch(/q_units/)
  })

  it('accepts once the units are stated as Å⁻¹', () => {
    const result = analyzeSaxsData(wideAngle, { qUnits: 'A' })
    expect(result.valid).toBe(true)
    expect(result.units).toBe('A')
    expect(result.unitsSource).toBe('user')
    expect(result.stats.trimmedHighQ).toBeGreaterThan(0)
  })

  it('accepts once the units are stated as nm⁻¹', () => {
    const result = analyzeSaxsData(wideAngle, { qUnits: 'nm' })
    expect(result.valid).toBe(true)
    expect(result.units).toBe('nm')
    expect(result.stats.qMax).toBeLessThanOrEqual(0.15)
  })

  it('rejects when the q range and the Guinier Rg disagree', () => {
    // q range of an Å⁻¹ file, but an Rg below anything BilboMD can model
    const result = analyzeSaxsData(buildCurve({ rg: 5, qStart: 0.03 }))
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/Cannot tell/)
  })
})

describe('analyzeSaxsData: explicit q_units', () => {
  it('obeys the user but warns when the data look like the other unit', () => {
    const result = analyzeSaxsData(buildCurve({ qScale: 10 }), { qUnits: 'A' })
    expect(result.units).toBe('A')
    expect(result.unitsSource).toBe('user')
    expect(result.warnings[0]).toMatch(
      /set to Å⁻¹, but the data look like nm⁻¹/
    )
  })

  it('does not warn when the user agrees with the evidence', () => {
    const result = analyzeSaxsData(buildCurve(), { qUnits: 'A' })
    expect(result.warnings).toEqual([])
  })
})

describe('analyzeSaxsData: header declarations', () => {
  // 0.03–5.0 nm⁻¹ of a 150 Å particle: ambiguous without a header
  const nmLarge = buildCurve({
    rg: 150,
    qStart: 0.003,
    qEnd: 0.5,
    qStep: 0.0005,
    qScale: 10
  })

  it('is ambiguous without a header', () => {
    expect(analyzeSaxsData(nmLarge).valid).toBe(false)
  })

  it.each(['# q(nm-1) I sigma', '# q [1/nm]', '# q (nm^-1)', '# s, nm⁻¹'])(
    'reads nm⁻¹ from "%s"',
    (header) => {
      const result = analyzeSaxsData(`${header}\n${nmLarge}`)
      expect(result.valid).toBe(true)
      expect(result.units).toBe('nm')
      expect(result.unitsSource).toBe('header')
    }
  )

  it.each(['# Q (1/A)  I (1/cm)  dI (1/cm)', '# q [A^-1]', '# q (Å⁻¹)'])(
    'reads Å⁻¹ from "%s"',
    (header) => {
      const wideAngle = buildCurve({ rg: 15, qEnd: 1.5, qStep: 0.005 })
      const result = analyzeSaxsData(`${header}\n${wideAngle}`)
      expect(result.valid).toBe(true)
      expect(result.units).toBe('A')
      expect(result.unitsSource).toBe('header')
    }
  )

  it.each(['# wavelength: 0.1 nm', '# sample: lysA-1', '# detector 1/2'])(
    'does not read units from "%s"',
    (header) => {
      expect(analyzeSaxsData(`${header}\n${nmLarge}`).valid).toBe(false)
    }
  )

  it('ignores a header that names both units', () => {
    const text = `# q (1/A)\n# converted from 1/nm\n${nmLarge}`
    expect(analyzeSaxsData(text).valid).toBe(false)
  })

  it('rejects when q range and Rg both contradict the header', () => {
    const result = analyzeSaxsData(`# q (1/A)\n${buildCurve({ qScale: 10 })}`)
    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/Cannot tell/)
  })
})

describe('estimateGuinierRg', () => {
  const toPoints = (text: string) =>
    analyzeSaxsData(text, { qUnits: 'A' }).points

  it('recovers Rg from a Guinier-like curve', () => {
    expect(estimateGuinierRg(toPoints(buildCurve({ rg: 30 })))).toBeCloseTo(
      30,
      0
    )
    expect(
      estimateGuinierRg(
        toPoints(buildCurve({ rg: 60, qStart: 0.006, qStep: 0.001 }))
      )
    ).toBeCloseTo(60, 0)
  })

  it('returns undefined with too few points', () => {
    expect(
      estimateGuinierRg(toPoints(buildCurve()).slice(0, 5))
    ).toBeUndefined()
  })

  it('returns undefined for a flat curve', () => {
    const flat = Array.from({ length: 50 }, (_, k) => ({
      q: 0.01 + k * 0.005,
      intensity: 100,
      error: 1
    }))
    expect(estimateGuinierRg(flat)).toBeUndefined()
  })
})

describe('isQUnits', () => {
  it('accepts only the supported values', () => {
    expect(isQUnits('auto')).toBe(true)
    expect(isQUnits('A')).toBe(true)
    expect(isQUnits('nm')).toBe(true)
    expect(isQUnits('angstrom')).toBe(false)
    expect(isQUnits(undefined)).toBe(false)
  })
})
