import { FoxsData, GuinierFit } from '@bilbomd/bilbomd-types'

// Universal reference for compact globular particles on a dimensionless
// Kratky plot: peak at qRg = √3 with height 3/e ≈ 1.104
export const GLOBULAR_QRG = Math.sqrt(3)
export const GLOBULAR_PEAK = 3 / Math.E

// Beyond qRg ≈ 10 the q² weighting mostly amplifies noise, so cap the
// displayed range there.
export const DEFAULT_MAX_QRG = 10

export type KratkyPoint = {
  qRg: number
  exp: number
} & Partial<Record<`kratky_model_${number}`, number>>

/**
 * Transform FoXS I(q) datasets into dimensionless Kratky coordinates:
 * x = qRg, y = (qRg)² · I(q)/I(0), normalizing every curve with the
 * experimental Guinier (Rg, I0) so they share a common frame. Points are
 * filtered with the repo's SNR ≥ 1 convention (see issue #572) since the
 * q² weighting amplifies high-q noise.
 */
export const buildKratkyData = (
  foxsData: FoxsData[],
  guinier: GuinierFit,
  maxQRg: number = DEFAULT_MAX_QRG
): KratkyPoint[] => {
  const base = foxsData[0]
  if (!base?.data?.length || guinier.rg <= 0 || guinier.i0 <= 0) return []

  const points: KratkyPoint[] = []
  base.data.forEach((pt, index) => {
    if (!(pt.exp_intensity > 0) || !(pt.error < pt.exp_intensity)) return
    const qRg = pt.q * guinier.rg
    if (qRg > maxQRg) return

    const scale = (qRg * qRg) / guinier.i0
    const point: KratkyPoint = {
      qRg: parseFloat(qRg.toFixed(4)),
      exp: parseFloat((scale * pt.exp_intensity).toFixed(4))
    }
    // All datasets share the base q-grid (index-aligned), matching the
    // assumption made by the ensemble I(q) charts.
    foxsData.forEach((fd, n) => {
      const modelPoint = fd.data[index]
      if (modelPoint && modelPoint.model_intensity > 0) {
        point[`kratky_model_${n}`] = parseFloat(
          (scale * modelPoint.model_intensity).toFixed(4)
        )
      }
    })
    points.push(point)
  })
  return points
}
