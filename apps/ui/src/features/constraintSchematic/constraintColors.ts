import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'

// One palette for every view of a job's constraints: the chain track, the
// bead-and-spring schematic, its linear view and the 3D viewer's "Color by
// Domain". Fixed segments share one blue; each rigid body gets its own color,
// numbered in file order. Colors come in light and dark pairs.

export type ColorPair = [light: string, dark: string]

export const FIXED_PALETTE: ColorPair = ['#2f54eb', '#7896ff']

// None of these is close to the fixed blue. Past the ninth rigid body the
// colors repeat.
export const RIGID_PALETTE: ColorPair[] = [
  ['#e8710a', '#ff9a3d'],
  ['#12946b', '#3cc79a'],
  ['#c93a72', '#f06ba0'],
  ['#7c4dcc', '#a98af0'],
  ['#9c7600', '#d9ae2a'],
  ['#0a8fa8', '#3cc0d8'],
  ['#b83227', '#ef6d61'],
  ['#5f8a1f', '#93c050'],
  ['#c2780a', '#f2b23a']
]

// Flexible residues: a neutral, so the bodies stand out
export const FLEXIBLE_PALETTE: ColorPair = ['#8a93a1', '#6f7886']

const pick = ([light, dark]: ColorPair, isDark: boolean) =>
  isDark ? dark : light

export const fixedColor = (dark: boolean): string => pick(FIXED_PALETTE, dark)

export const rigidColor = (index: number, dark: boolean): string =>
  pick(RIGID_PALETTE[index % RIGID_PALETTE.length] as ColorPair, dark)

export const flexibleColor = (dark: boolean): string =>
  pick(FLEXIBLE_PALETTE, dark)

/**
 * Each rigid body's palette index, by its position in `rigid_bodies`, or null
 * for a body with no segments. Bodies with no segments aren't drawn, so they
 * don't use up a color.
 */
export const rigidColorIndices = (
  constraints: MDConstraintsDTO
): (number | null)[] => {
  let next = 0
  return (constraints.rigid_bodies ?? []).map((body) =>
    (body.segments ?? []).length > 0 ? next++ : null
  )
}

/** "#rrggbb" as a 0xRRGGBB number, for the 3D viewer. */
export const hexToNumber = (hex: string): number =>
  parseInt(hex.replace('#', ''), 16)
