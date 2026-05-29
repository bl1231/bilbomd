export interface RgMaxWarning {
  rg: number
  rgMax: number
  ratio: string
  recommended: number
}

// Threshold above which an Rg Max target is considered unreasonably large
// relative to the measured Rg. AutoRg typically suggests ~1.5×, so anything
// beyond 2× indicates a manual override that risks MD numerical instability.
const RG_MAX_WARNING_MULTIPLIER = 2

// Returns warning details when rgMax exceeds RG_MAX_WARNING_MULTIPLIER × rg,
// otherwise null. Accepts strings (form values) or numbers.
export const getRgMaxWarning = (
  rg: string | number,
  rgMax: string | number
): RgMaxWarning | null => {
  const rgVal = typeof rg === 'number' ? rg : parseFloat(rg)
  const rgMaxVal = typeof rgMax === 'number' ? rgMax : parseFloat(rgMax)

  if (
    !isFinite(rgVal) ||
    rgVal <= 0 ||
    !isFinite(rgMaxVal) ||
    rgMaxVal <= RG_MAX_WARNING_MULTIPLIER * rgVal
  ) {
    return null
  }

  return {
    rg: rgVal,
    rgMax: rgMaxVal,
    ratio: (rgMaxVal / rgVal).toFixed(1),
    recommended: Math.round(RG_MAX_WARNING_MULTIPLIER * rgVal)
  }
}
