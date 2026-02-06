const calculateRgyrRange = (rg_min: number, rg_max: number): number[] => {
  const rgs = Array.from({ length: 6 }, (_, i) =>
    Math.round(rg_min + (i * (rg_max - rg_min)) / 5)
  )
  return rgs
}

export { calculateRgyrRange }
