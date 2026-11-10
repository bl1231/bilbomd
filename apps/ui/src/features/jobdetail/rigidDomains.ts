// The report scripts/align_ensemble.py writes for a BioEmu2 job (served as
// results/alignment.json): the rigid domains found in the sampled structures,
// and the matrix they were found from.

export interface AlignmentReport {
  method: 'rigid-domain' | 'all-residues'
  sd_cutoff: number
  samples: number
  residues: number
  reference: string
  anchor_size: number
  domains: { id: number; size: number; residues: string[] }[]
  flexible: string[]
  members: {
    in: string
    out: string
    anchor_rmsd: number
    overall_rmsd: number
  }[]
  // One entry per residue, in matrix order; domain 0 = flexible
  residue_chains: string[]
  residue_numbers: number[]
  residue_domains: number[]
  // Spread (SD, Å) of every residue-pair distance over the samples: size x
  // size cells of `bin` residues, one byte each (255 = max_sd or more), base64
  matrix: { size: number; bin: number; max_sd: number; data: string } | null
}

export type Rgb = [number, number, number]

// Categorical colors for the domains, in fixed order (light, dark). Domains
// past the eighth share the flexible gray.
const DOMAIN_COLORS: [string, string][] = [
  ['#2a78d6', '#3987e5'],
  ['#eb6834', '#d95926'],
  ['#1baf7a', '#199e70'],
  ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'],
  ['#008300', '#008300'],
  ['#6250d6', '#9085e9'],
  ['#e34948', '#e66767']
]
const FLEXIBLE_COLOR: [string, string] = ['#a3a199', '#6f6e68']
// Rigid pairs are drawn in this color, fading to the surface as they vary
const RIGID_COLOR: [string, string] = ['#0d366b', '#86b6ef']

export const domainColor = (domain: number, dark: boolean): string =>
  (DOMAIN_COLORS[domain - 1] ?? FLEXIBLE_COLOR)[dark ? 1 : 0]

export const rigidColor = (dark: boolean): string => RIGID_COLOR[dark ? 1 : 0]

export const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
}

export const decodeMatrix = (data: string): Uint8Array =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0))

// RGBA pixels for the matrix: `rigid` where the distance doesn't vary, fading
// to `surface`. The square root spreads out the rigid end of the scale, where
// the domain boundaries are.
export const matrixPixels = (
  bytes: Uint8Array,
  rigid: Rgb,
  surface: Rgb
): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(bytes.length * 4)
  for (let i = 0; i < bytes.length; i++) {
    const t = Math.sqrt((bytes[i] ?? 0) / 255)
    out[4 * i] = rigid[0] + (surface[0] - rigid[0]) * t
    out[4 * i + 1] = rigid[1] + (surface[1] - rigid[1]) * t
    out[4 * i + 2] = rigid[2] + (surface[2] - rigid[2]) * t
    out[4 * i + 3] = 255
  }
  return out
}

// The residues one matrix cell covers, e.g. "A45" or "A45–47"
export const cellResidues = (report: AlignmentReport, cell: number): string => {
  const bin = report.matrix?.bin ?? 1
  const first = cell * bin
  const last = Math.min(first + bin, report.residue_numbers.length) - 1
  const name = (i: number) =>
    `${report.residue_chains[i]}${report.residue_numbers[i]}`
  if (last <= first) return name(first)
  return report.residue_chains[first] === report.residue_chains[last]
    ? `${name(first)}–${report.residue_numbers[last]}`
    : `${name(first)}–${name(last)}`
}

// What the hover readout says about one matrix cell
export const describeCell = (
  report: AlignmentReport,
  bytes: Uint8Array,
  row: number,
  col: number
): string => {
  const { size, max_sd } = report.matrix ?? { size: 0, max_sd: 0 }
  const byte = bytes[row * size + col] ?? 0
  const spread =
    byte >= 255 ? `≥ ${max_sd} Å` : `${((byte / 255) * max_sd).toFixed(1)} Å`
  return `${cellResidues(report, row)} and ${cellResidues(report, col)}: distance varies by ${spread}`
}

export type MatrixCell = { row: number; col: number }

// Where a key press moves the selected matrix cell, or null if the key isn't
// a navigation key. Arrows move one cell (ten with Shift); Home and End go to
// the ends of the row.
export const moveCell = (
  cell: MatrixCell,
  key: string,
  shift: boolean,
  size: number
): MatrixCell | null => {
  const step = shift ? 10 : 1
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v))
  switch (key) {
    case 'ArrowLeft':
      return { row: cell.row, col: clamp(cell.col - step) }
    case 'ArrowRight':
      return { row: cell.row, col: clamp(cell.col + step) }
    case 'ArrowUp':
      return { row: clamp(cell.row - step), col: cell.col }
    case 'ArrowDown':
      return { row: clamp(cell.row + step), col: cell.col }
    case 'Home':
      return { row: cell.row, col: 0 }
    case 'End':
      return { row: cell.row, col: size - 1 }
    default:
      return null
  }
}

// Matrix cells where a new chain starts (for the divider lines)
export const chainBoundaries = (report: AlignmentReport): number[] => {
  const bin = report.matrix?.bin ?? 1
  const cells: number[] = []
  for (let i = 1; i < report.residue_chains.length; i++) {
    if (report.residue_chains[i] !== report.residue_chains[i - 1]) {
      cells.push(i / bin)
    }
  }
  return cells
}

// "A:2-13" -> "A:2–13", and single residues without the range
export const formatRange = (range: string): string => {
  const [chain, span = ''] = range.split(':')
  const [start, end] = span.split('-')
  return start === end ? `${chain}:${start}` : `${chain}:${start}–${end}`
}
