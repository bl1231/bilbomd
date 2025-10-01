import React, { useRef, useEffect } from 'react'

type ClusterType = 'rigid' | 'fixed'
type VizCluster = {
  id: number
  type: ClusterType
  ranges: [number, number][]
  bbox?: [number, number, number, number]
}
type VizJSON = {
  length: number
  downsample?: number
  clusters: VizCluster[]
  mask?: { plddt_cutoff?: number; low_confidence_residues?: number[] }
  chains?: { id: string; start: number; end: number }[]
}
// Draw dashed lines for chain boundaries
function drawChainBoundaryLines(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viz: VizJSON,
  matrixSize: number[][]
) {
  if (!viz.chains || viz.chains.length < 2) return
  const L = viz.length
  // infer downsample if not provided by comparing matrix size (rows) vs length
  const s = viz.downsample ?? Math.max(1, Math.round(L / matrixSize.length))
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.setLineDash([4, 3])
  for (let i = 0; i < viz.chains.length - 1; ++i) {
    const chain = viz.chains[i]
    // Draw boundary after chain.end (inclusive), so boundary is after this residue
    const boundaryIdx = chain.end
    // The pixel position is after residue boundaryIdx
    const x = residueToPx(boundaryIdx + 1, L, canvas.width, s)
    const y = residueToPx(boundaryIdx + 1, L, canvas.height, s)
    // Horizontal line
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
    // Vertical line
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.restore()
}

type PAEMatrixPlotProps = {
  matrix: number[][]
  size?: number
  viz?: VizJSON
  showRigid?: boolean
  showFixed?: boolean
}

// Viridis colormap approximation using a small lookup table
function colormap(val: number): string {
  // Clamp value between 0 and 31
  const v = Math.max(0, Math.min(31, val))
  // Normalize to [0, 1]
  const t = v / 31

  // Define viridis stops as [position, [r, g, b]]
  const stops: [number, [number, number, number]][] = [
    [0.0, [68, 1, 84]], // purple
    [0.25, [59, 82, 139]], // blue
    [0.5, [33, 144, 141]], // greenish
    [0.75, [94, 201, 98]], // yellow-green
    [1.0, [253, 231, 37]] // yellow
  ]

  // Find stops between which t falls
  let i = 0
  while (i < stops.length - 1 && t > stops[i + 1][0]) {
    i++
  }
  const [t0, c0] = stops[i]
  const [t1, c1] = stops[i + 1]

  // Linear interpolation factor
  const f = (t - t0) / (t1 - t0)

  // Interpolate RGB
  const r = Math.round(c0[0] + f * (c1[0] - c0[0]))
  const g = Math.round(c0[1] + f * (c1[1] - c0[1]))
  const b = Math.round(c0[2] + f * (c1[2] - c0[2]))

  return `rgb(${r},${g},${b})`
}

// Compute bounding box in px from inclusive ranges
function computeBBoxFromRanges(
  ranges: [number, number][]
): [number, number, number, number] {
  let minStart = Infinity
  let maxEnd = -Infinity
  for (const [a, b] of ranges) {
    if (a < minStart) minStart = a
    if (b > maxEnd) maxEnd = b
  }
  return [minStart, minStart, maxEnd, maxEnd]
}
function residueToPx(i1: number, L: number, canvasSize: number, s: number) {
  // Convert 1-based residue index to pixel start in canvas space.
  // If downsample s>1, we map indices to the downsampled grid.
  const dsL = Math.max(1, Math.floor(L / s))
  const cell = canvasSize / dsL
  const idx0 = Math.floor((i1 - 1) / s) // 0-based cell
  return idx0 * cell
}

const PAEMatrixPlot: React.FC<PAEMatrixPlotProps> = ({
  matrix,
  viz,
  showRigid = true,
  showFixed = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nRows = matrix.length
  const nCols = matrix[0]?.length || 0
  const size = 400 // px

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (nRows === 0 || nCols === 0) return
    const cellW = canvas.width / nCols
    const cellH = canvas.height / nRows
    // Paint heatmap
    for (let i = 0; i < nRows; i++) {
      for (let j = 0; j < nCols; j++) {
        ctx.fillStyle = colormap(matrix[i][j])
        ctx.fillRect(j * cellW, i * cellH, cellW, cellH)
      }
    }
    // overlays
    if (viz && viz.clusters?.length) {
      const L = viz.length
      // infer downsample if not provided by comparing matrix size (rows) vs length
      const s = viz.downsample ?? Math.max(1, Math.round(L / matrix.length))

      for (const c of viz.clusters) {
        if (
          (c.type === 'rigid' && showRigid === false) ||
          (c.type === 'fixed' && showFixed === false)
        ) {
          continue
        }
        // Draw one rectangle per individual range on the diagonal
        for (const [a, b] of c.ranges) {
          // Diagonal box for this range: [a,a,b,b]
          const x = residueToPx(a, L, canvas.width, s)
          const y = residueToPx(a, L, canvas.height, s)
          const x2 = residueToPx(b + 1, L, canvas.width, s)
          const y2 = residueToPx(b + 1, L, canvas.height, s)
          const w = x2 - x
          const h = y2 - y

          ctx.save()
          ctx.globalAlpha = 0.15
          ctx.fillStyle =
            c.type === 'rigid' ? 'rgba(255,0,0,1)' : 'rgba(30,144,255,1)'
          ctx.fillRect(x, y, w, h)
          ctx.restore()

          ctx.lineWidth = 2
          ctx.strokeStyle = '#000'
          ctx.strokeRect(
            Math.floor(x) + 0.5,
            Math.floor(y) + 0.5,
            Math.ceil(w) - 1,
            Math.ceil(h) - 1
          )
        }
      }
    }
    // Draw chain boundary lines on top of overlays
    if (viz) {
      drawChainBoundaryLines(ctx, canvas, viz, matrix)
    }
  }, [matrix, nRows, nCols, viz, showRigid, showFixed])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ border: '1px solid #ccc', imageRendering: 'pixelated' }}
    />
  )
}

export default PAEMatrixPlot
