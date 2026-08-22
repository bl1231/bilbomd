// Shared palette for coloring individual ensemble member structures.
// Used both by the Molstar "Color by Conformation" preset and by the
// EnsembleWeightsPanel swatches, so the viewer and the legend always match.
//
// Values are the d3 category10 palette (distinguishable, colorblind-reasonable),
// stored as 0xRRGGBB numbers so Molstar's Color() can consume them directly and
// the panel can derive CSS hex strings.
export const ENSEMBLE_MEMBER_COLOR_VALUES = [
  0x1f77b4, // blue
  0xff7f0e, // orange
  0x2ca02c, // green
  0xd62728, // red
  0x9467bd, // purple
  0x8c564b, // brown
  0xe377c2, // pink
  0x7f7f7f, // gray
  0xbcbd22, // olive
  0x17becf // cyan
]

// The 0xRRGGBB color value for a given member index (wraps if there are more
// members than palette entries).
export const ensembleMemberColorValue = (index: number): number =>
  ENSEMBLE_MEMBER_COLOR_VALUES[index % ENSEMBLE_MEMBER_COLOR_VALUES.length]!

// The CSS hex string ('#rrggbb') for a given member index, for MUI swatches.
export const ensembleMemberCssColor = (index: number): string =>
  `#${ensembleMemberColorValue(index).toString(16).padStart(6, '0')}`

// Light green used for the original starting model, so it reads as a reference
// structure distinct from the colored ensemble members. rgb(188, 230, 192).
export const STARTING_MODEL_COLOR_VALUE = 0xbce6c0
export const STARTING_MODEL_CSS_COLOR = '#bce6c0'

// Opacity for the semi-transparent starting-model overlay.
export const STARTING_MODEL_ALPHA = 0.5
