import { FoxsDataPoint } from '@bilbomd/bilbomd-types'

// Fit-quality metrics that complement FoXS's χ²:
//
// - χ²free (Rambo & Tainer, Nature 2013, 496:477): the q-range is split into
//   Shannon channels of width π/Dmax. Each round draws one point at random
//   from every channel and computes χ² over those points; the median over
//   many rounds is χ²free. Because it only counts ~one point per independent
//   piece of information, it is harder to lower by overfitting than χ².
//
// - Volatility of ratio, Vr (Hura et al., Nat Methods 2013, 10:453): the
//   ratio R = I_exp / I_model is taken in Shannon-channel bins and
//   Vr = Σ |R_i − R_i+1| / ((R_i + R_i+1) / 2). It measures how much the
//   ratio wanders across q, independent of overall scale, and is less
//   sensitive than χ² to systematic errors such as buffer subtraction.
//
// Both need Dmax. BilboMD has no P(r) step, so Dmax is estimated from the
// Guinier Rg (see estimateDmax). This affects how many channels there are,
// not whether the metrics are meaningful, but values should be treated as
// beta until an experimental Dmax is available.

// Dmax / Rg. A sphere has 2.58; typical proteins are ~3; elongated or
// flexible multidomain systems are higher.
export const DMAX_PER_RG = 3.0

// Rounds of random sampling for χ²free
export const CHI2FREE_ROUNDS = 1000

// Vr only uses q ≤ this (Å⁻¹). Above ~0.3 Å⁻¹ SAXS intensities are close to
// background and the binned ratio becomes noise-dominated: on production
// data, including q up to 0.5 inflated Vr 2–10× and could rank a better fit
// as worse. χ²free keeps the full range because it is error-weighted.
export const VR_QMAX = 0.3

// Fixed seed so χ²free is stable across page loads, and so every fit in a
// job is scored on the same random draws (a paired comparison)
const CHI2FREE_SEED = 20130425

export const estimateDmax = (rg: number): number => DMAX_PER_RG * rg

// Points usable for χ² need a finite measurement and a positive error
const isUsable = (p: FoxsDataPoint): boolean =>
  Number.isFinite(p.q) &&
  Number.isFinite(p.exp_intensity) &&
  Number.isFinite(p.model_intensity) &&
  Number.isFinite(p.error) &&
  p.error > 0

// Groups points into consecutive Shannon channels of width π/Dmax, starting
// at the lowest q. Empty channels are dropped.
export const shannonBins = (
  points: FoxsDataPoint[],
  dmax: number
): FoxsDataPoint[][] => {
  if (!(dmax > 0) || points.length === 0) return []
  const width = Math.PI / dmax
  const sorted = [...points].sort((a, b) => a.q - b.q)
  const q0 = sorted[0]!.q
  const bins = new Map<number, FoxsDataPoint[]>()
  for (const p of sorted) {
    const index = Math.floor((p.q - q0) / width)
    const bin = bins.get(index)
    if (bin) bin.push(p)
    else bins.set(index, [p])
  }
  return [...bins.entries()].sort(([a], [b]) => a - b).map(([, bin]) => bin)
}

// mulberry32: small, fast, seedable PRNG returning floats in [0, 1)
const seededRandom = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

interface Chi2FreeOptions {
  rounds?: number
  seed?: number
}

// Median reduced χ² over random one-point-per-channel subsets. With k
// channels each subset has k points; one degree of freedom is taken for the
// fitted scale, so χ² is divided by k − 1. Returns undefined when there are
// fewer than 3 channels.
export const computeChi2Free = (
  points: FoxsDataPoint[],
  dmax: number,
  { rounds = CHI2FREE_ROUNDS, seed = CHI2FREE_SEED }: Chi2FreeOptions = {}
): number | undefined => {
  const bins = shannonBins(points.filter(isUsable), dmax)
  const k = bins.length
  if (k < 3) return undefined

  const random = seededRandom(seed)
  const values: number[] = []
  for (let round = 0; round < rounds; round++) {
    let sum = 0
    for (const bin of bins) {
      const p = bin[Math.floor(random() * bin.length)]!
      const r = (p.exp_intensity - p.model_intensity) / p.error
      sum += r * r
    }
    values.push(sum / (k - 1))
  }
  return median(values)
}

// Volatility of ratio between the experimental and model curves, computed on
// Shannon-channel bins (mean intensities per bin) for q ≤ qmax. Only points
// with positive intensities contribute. Returns undefined with fewer than 2
// bins.
export const computeVr = (
  points: FoxsDataPoint[],
  dmax: number,
  { qmax = VR_QMAX }: { qmax?: number } = {}
): number | undefined => {
  const positive = points.filter(
    (p) =>
      isUsable(p) && p.q <= qmax && p.exp_intensity > 0 && p.model_intensity > 0
  )
  const ratios = shannonBins(positive, dmax).map((bin) => {
    const exp = bin.reduce((s, p) => s + p.exp_intensity, 0) / bin.length
    const model = bin.reduce((s, p) => s + p.model_intensity, 0) / bin.length
    return exp / model
  })
  if (ratios.length < 2) return undefined

  let vr = 0
  for (let i = 0; i < ratios.length - 1; i++) {
    const a = ratios[i]!
    const b = ratios[i + 1]!
    vr += Math.abs(a - b) / ((a + b) / 2)
  }
  return vr
}

export const countShannonChannels = (
  points: FoxsDataPoint[],
  dmax: number
): number => shannonBins(points.filter(isUsable), dmax).length
