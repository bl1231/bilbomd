import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import {
  Alert,
  Box,
  Grid,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useGetJobAlignmentQuery } from 'slices/jobsApiSlice'
import { useGetPublicJobAlignmentQuery } from 'slices/publicJobsApiSlice'
import type { JobSource } from './jobSource'
import {
  chainBoundaries,
  decodeMatrix,
  describeCell,
  domainColor,
  formatRange,
  hexToRgb,
  matrixPixels,
  moveCell,
  rigidColor,
  type AlignmentReport,
  type MatrixCell
} from './rigidDomains'

const useAlignment = (source: JobSource) => {
  const owner = useGetJobAlignmentQuery(
    source.kind === 'owner' ? source.id : skipToken
  )
  const anon = useGetPublicJobAlignmentQuery(
    source.kind === 'public' ? source.token : skipToken
  )
  return source.kind === 'owner' ? owner : anon
}

const HOVER_HINT =
  'Hover over the matrix, or focus it and use the arrow keys, to read a residue pair.'

// The distance-spread matrix with the domain of each residue along the top.
// Drawn on canvases so it follows the theme and can be read cell by cell, with
// the pointer or with the arrow keys.
const SpreadMatrix = ({ report }: { report: AlignmentReport }) => {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const matrixRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLCanvasElement>(null)
  const [readout, setReadout] = useState(HOVER_HINT)
  // The cell selected with the keyboard
  const [cell, setCell] = useState<MatrixCell | null>(null)
  const readoutId = useId()
  const matrix = report.matrix
  const bytes = useMemo(
    () => (matrix ? decodeMatrix(matrix.data) : new Uint8Array()),
    [matrix]
  )
  const surface = theme.palette.background.paper
  const ink = theme.palette.text.primary

  useEffect(() => {
    if (!matrix) return
    const { size } = matrix
    const canvas = matrixRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      canvas.width = size
      canvas.height = size
      const image = ctx.createImageData(size, size)
      image.data.set(
        matrixPixels(bytes, hexToRgb(rigidColor(dark)), hexToRgb(surface))
      )
      ctx.putImageData(image, 0, 0)
      ctx.fillStyle = ink
      for (const cell of chainBoundaries(report)) {
        ctx.fillRect(Math.round(cell), 0, 1, size)
        ctx.fillRect(0, Math.round(cell), size, 1)
      }
    }
    const track = trackRef.current
    const trackCtx = track?.getContext('2d')
    if (track && trackCtx) {
      const n = report.residue_domains.length
      track.width = n
      track.height = 8
      report.residue_domains.forEach((domain, i) => {
        trackCtx.fillStyle = domainColor(domain, dark)
        // flexible residues get a thin line, domains a full bar
        trackCtx.fillRect(i, domain ? 0 : 3, 1, domain ? 8 : 2)
      })
    }
  }, [matrix, bytes, report, dark, surface, ink])

  if (!matrix) return null

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const row = Math.floor(
      ((event.clientY - rect.top) / rect.height) * matrix.size
    )
    const col = Math.floor(
      ((event.clientX - rect.left) / rect.width) * matrix.size
    )
    if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return
    setReadout(describeCell(report, bytes, row, col))
  }

  const select = (next: MatrixCell) => {
    setCell(next)
    setReadout(describeCell(report, bytes, next.row, next.col))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const next = moveCell(
      cell ?? { row: 0, col: 0 },
      event.key,
      event.shiftKey,
      matrix.size
    )
    if (!next) return
    event.preventDefault()
    select(next)
  }

  const cellPercent = 100 / matrix.size

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Box
        component="canvas"
        ref={trackRef}
        aria-hidden
        sx={{ display: 'block', width: '100%', height: 8, mb: '4px' }}
      />
      <Box
        role="application"
        tabIndex={0}
        aria-label="Distance-spread matrix. Use the arrow keys to read a residue pair; hold Shift to move ten cells."
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onFocus={() => select(cell ?? { row: 0, col: 0 })}
        sx={{
          position: 'relative',
          border: 1,
          borderColor: 'divider',
          '&:focus-visible': {
            outline: 2,
            outlineColor: 'primary.main',
            outlineOffset: 2
          },
          '& .cell-marker': { display: 'none' },
          '&:focus-visible .cell-marker': { display: 'block' }
        }}
      >
        <Box
          component="canvas"
          ref={matrixRef}
          role="img"
          aria-label="Spread of every residue-pair distance across the sampled structures"
          onPointerMove={onMove}
          onPointerLeave={() => setReadout(HOVER_HINT)}
          sx={{
            display: 'block',
            width: '100%',
            aspectRatio: '1',
            imageRendering: 'pixelated',
            cursor: 'crosshair'
          }}
        />
        {cell && (
          <Box
            className="cell-marker"
            aria-hidden
            sx={{
              position: 'absolute',
              left: `${cell.col * cellPercent}%`,
              top: `${cell.row * cellPercent}%`,
              width: `max(${cellPercent}%, 8px)`,
              height: `max(${cellPercent}%, 8px)`,
              transform: 'translate(-2px, -2px)',
              border: 2,
              borderColor: 'warning.main',
              boxSizing: 'content-box',
              pointerEvents: 'none'
            }}
          />
        )}
      </Box>
      <Typography
        id={readoutId}
        role="status"
        aria-live="polite"
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1, minHeight: '1.5em', fontVariantNumeric: 'tabular-nums' }}
      >
        {readout}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
        >
          0 Å (rigid)
        </Typography>
        <Box
          sx={{
            width: 140,
            height: 8,
            border: 1,
            borderColor: 'divider',
            background: `linear-gradient(90deg, ${rigidColor(dark)}, ${surface})`
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
        >
          ≥ {matrix.max_sd} Å
        </Typography>
      </Box>
    </Box>
  )
}

const Swatch = ({ color }: { color: string }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-block',
      width: 14,
      height: 6,
      borderRadius: '2px',
      mr: 1,
      backgroundColor: color
    }}
  />
)

const DomainTable = ({ report }: { report: AlignmentReport }) => {
  const dark = useTheme().palette.mode === 'dark'
  const flexibleCount = report.residue_domains.filter((d) => d === 0).length
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Body</TableCell>
            <TableCell align="right">Residues</TableCell>
            <TableCell>Ranges</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {report.domains.map((domain) => (
            <TableRow key={domain.id}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Swatch color={domainColor(domain.id, dark)} />
                Domain {domain.id}
                {domain.id === 1 && ' (anchor)'}
              </TableCell>
              <TableCell align="right">{domain.size}</TableCell>
              <TableCell>
                {domain.residues.map(formatRange).join(', ')}
              </TableCell>
            </TableRow>
          ))}
          {flexibleCount > 0 && (
            <TableRow>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Swatch color={domainColor(0, dark)} />
                Flexible
              </TableCell>
              <TableCell align="right">{flexibleCount}</TableCell>
              <TableCell>
                {report.flexible.map(formatRange).join(', ')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  )
}

// How the members of a BioEmu2 ensemble were superposed: the rigid domains
// found in the sampled structures and the matrix they were found from.
const RigidDomainsTab = ({ source }: { source: JobSource }) => {
  const { data: report, isLoading, isError } = useAlignment(source)

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton
          variant="rectangular"
          sx={{
            width: '100%',
            maxWidth: 560,
            aspectRatio: '1',
            height: 'auto'
          }}
        />
      </Box>
    )
  }
  if (isError || !report) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          The rigid-domain analysis isn't available for this job.
        </Alert>
      </Box>
    )
  }

  const rigid = report.method === 'rigid-domain'
  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ mb: 2, maxWidth: '75ch' }}>
        BioEmu2 writes each structure in an arbitrary orientation, so the
        ensemble members were superposed before being shown.{' '}
        {rigid
          ? `They are superposed on domain 1, the largest rigid domain: ${report.anchor_size} of ${report.residues} residues.`
          : 'No rigid domain was found in the sampled structures, so they are superposed on all residues.'}{' '}
        This does not change the fit to the SAXS data.
      </Typography>
      <Grid
        container
        spacing={3}
      >
        {report.matrix && (
          <Grid size={{ xs: 12, md: 6 }}>
            <SpreadMatrix report={report} />
          </Grid>
        )}
        <Grid size={{ xs: 12, md: 6 }}>
          {rigid && <DomainTable report={report} />}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 2, maxWidth: '65ch' }}
          >
            The matrix shows, for every pair of residues, how much the distance
            between them varies across the {report.samples} sampled structures.
            Residues whose distances to each other vary by less than{' '}
            {report.sd_cutoff} Å move as one rigid body; clustering the matrix
            gives the domains marked along its top edge. Lines separate the
            chains.
          </Typography>
        </Grid>
      </Grid>
    </Box>
  )
}

export default RigidDomainsTab
