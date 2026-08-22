import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import type { IEnsemble, IEnsembleMember } from '@bilbomd/bilbomd-types'
import { ensembleMemberCssColor } from './ensembleColors'

interface EnsembleWeightsPanelProps {
  ensembles: IEnsemble[]
  visibility: Record<number, boolean>
  // When true, each conformation row shows the color swatch matching the
  // viewer's "Color by Conformation" coloring, acting as a legend.
  showColors?: boolean
}

// Strip the leading path and the .pdb extension so a conformation like
// "../foxs/rg25_run3/dcd2pdb_rg25_run3_271500.pdb" reads as
// "dcd2pdb_rg25_run3_271500".
const conformationLabel = (pdb: string): string => {
  const base = pdb.split('/').pop() ?? pdb
  return base.replace(/\.pdb$/i, '')
}

const formatWeight = (weight?: number): string =>
  typeof weight === 'number' ? weight.toFixed(3) : '—'

const EnsembleWeightsPanel = ({
  ensembles,
  visibility,
  showColors = false
}: EnsembleWeightsPanelProps) => {
  // Only show weights for multi-state ensembles (2+ conformations) that are
  // currently toggled visible in the viewer, so the numbers always match what
  // is on screen.
  const visibleEnsembles = ensembles
    .filter((e) => e.size >= 2 && visibility[e.size] && e.models.length > 0)
    .sort((a, b) => a.size - b.size)

  if (visibleEnsembles.length === 0) return null

  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Typography variant='subtitle2' sx={{ mb: 0.5 }}>
        Conformation weights
      </Typography>
      {visibleEnsembles.map((ensemble) => {
        // The viewer loads the rank-1 (best scoring) model, so weights come
        // from models[0]; its state order matches the model order on screen.
        const bestModel = ensemble.models[0]
        if (!bestModel) return null
        return (
          <Box key={ensemble.size} sx={{ mb: 1 }}>
            <Typography
              variant='caption'
              color='text.secondary'
              sx={{ display: 'block', mb: 0.5 }}
            >
              {ensemble.size}-state ensemble
            </Typography>
            {bestModel.states.map((state: IEnsembleMember, index: number) => {
              const label = conformationLabel(state.pdb)
              const fraction =
                typeof state.weight === 'number'
                  ? Math.max(0, Math.min(1, state.weight))
                  : 0
              const memberColor = ensembleMemberCssColor(index)
              return (
                <Box
                  key={`${ensemble.size}-${index}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.25
                  }}
                >
                  {showColors && (
                    <Box
                      data-testid='conformation-swatch'
                      sx={{
                        flex: '0 0 auto',
                        width: 12,
                        height: 12,
                        borderRadius: 0.5,
                        backgroundColor: memberColor
                      }}
                    />
                  )}
                  <Typography
                    variant='body2'
                    sx={{ minWidth: 20, color: 'text.secondary' }}
                  >
                    {index + 1}
                  </Typography>
                  <Tooltip title={label}>
                    <Typography
                      variant='body2'
                      sx={{
                        flex: '1 1 auto',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace'
                      }}
                    >
                      {label}
                    </Typography>
                  </Tooltip>
                  <Box
                    sx={{
                      flex: '0 0 120px',
                      height: 8,
                      borderRadius: 1,
                      backgroundColor: 'grey.200',
                      overflow: 'hidden'
                    }}
                  >
                    <Box
                      sx={{
                        width: `${fraction * 100}%`,
                        height: '100%',
                        backgroundColor: showColors ? memberColor : 'primary.main'
                      }}
                    />
                  </Box>
                  <Typography
                    variant='body2'
                    sx={{
                      flex: '0 0 48px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {formatWeight(state.weight)}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

export default EnsembleWeightsPanel
