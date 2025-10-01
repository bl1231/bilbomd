import React, { useRef, useEffect, useState } from 'react'

type ClusterType = 'rigid' | 'fixed' | 'cluster'
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

type ScreenRect = {
  id: number
  type: ClusterType
  range: [number, number]
  x: number
  y: number
  w: number
  h: number
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

function formatRangeByChains(range: [number, number], viz?: VizJSON): string[] {
  if (!viz?.chains) {
    return [`${range[0]}-${range[1]}`]
  }
  const result: string[] = []
  const [start, end] = range
  for (const chain of viz.chains) {
    const chainStart = chain.start
    const chainEnd = chain.end
    if (end < chainStart) {
      // range ends before this chain
      break
    }
    if (start > chainEnd) {
      // range starts after this chain
      continue
    }
    // Overlapping segment
    const segStart = Math.max(start, chainStart)
    const segEnd = Math.min(end, chainEnd)
    const localStart = segStart - chainStart + 1
    const localEnd = segEnd - chainStart + 1
    result.push(`${chain.id}:${localStart}-${localEnd}`)
  }
  return result.length > 0 ? result : [`${start}-${end}`]
}

type PAEMatrixPlotProps = {
  matrix: number[][]
  size?: number
  viz?: VizJSON
  showRigid?: boolean
  showFixed?: boolean
  showClusters?: boolean
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
  showFixed = true,
  showClusters = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nRows = matrix.length
  const nCols = matrix[0]?.length || 0
  const size = 400 // px

  const rectsRef = useRef<ScreenRect[]>([])
  const [hovered, setHovered] = useState<ScreenRect | null>(null)
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    rectsRef.current = []
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
          (c.type === 'fixed' && showFixed === false) ||
          (c.type === 'cluster' && showClusters === false)
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

          rectsRef.current.push({
            id: c.id,
            type: c.type,
            range: [a, b],
            x,
            y,
            w,
            h
          })

          ctx.save()
          ctx.globalAlpha = 0.15
          ctx.fillStyle =
            c.type === 'rigid'
              ? 'rgba(255,0,0,1)'
              : c.type === 'fixed'
                ? 'rgba(30,144,255,1)'
                : 'rgba(0,255,0,1)' // cluster
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

      // Draw bbox rectangles if showClusters is true
      if (showClusters) {
        for (const c of viz.clusters) {
          if (!c.bbox) continue
          const [x1, y1, x2, y2] = c.bbox
          const x = residueToPx(x1, L, canvas.width, s)
          const y = residueToPx(y1, L, canvas.height, s)
          const x2Px = residueToPx(x2 + 1, L, canvas.width, s)
          const y2Px = residueToPx(y2 + 1, L, canvas.height, s)
          const w = x2Px - x
          const h = y2Px - y

          rectsRef.current.push({
            id: c.id,
            type: 'cluster',
            range: [x1, x2],
            x,
            y,
            w,
            h
          })

          ctx.save()
          ctx.globalAlpha = 0.15
          ctx.fillStyle = 'rgba(0,255,0,1)' // cluster color
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
    if (hovered) {
      ctx.save()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'yellow'
      ctx.setLineDash([6, 3])
      ctx.strokeRect(
        Math.floor(hovered.x) + 0.5,
        Math.floor(hovered.y) + 0.5,
        Math.ceil(hovered.w) - 1,
        Math.ceil(hovered.h) - 1
      )
      ctx.restore()
    }
    // Draw chain boundary lines on top of overlays
    if (viz) {
      drawChainBoundaryLines(ctx, canvas, viz, matrix)
    }
  }, [matrix, nRows, nCols, viz, showRigid, showFixed, showClusters, hovered])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    const hit =
      [...rectsRef.current]
        .reverse()
        .find(
          (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
        ) || null
    setHovered(hit)
    if (hit) {
      setTipPos({ x: e.clientX + 10, y: e.clientY + 10 }) // viewport coords with offset
      if (canvas.style.cursor !== 'pointer') canvas.style.cursor = 'pointer'
    } else {
      setTipPos(null)
      if (canvas.style.cursor !== 'default') canvas.style.cursor = 'default'
    }
  }

  function handleMouseLeave() {
    const canvas = canvasRef.current
    if (canvas) canvas.style.cursor = 'default'
    setHovered(null)
    setTipPos(null)
  }

  const MAX_TIP_WIDTH = 260
  const MARGIN = 8
  const clampedTip = tipPos
    ? {
        left: Math.min(
          tipPos.x,
          (typeof window !== 'undefined' ? window.innerWidth : size) -
            MAX_TIP_WIDTH -
            MARGIN
        ),
        top: Math.min(
          tipPos.y,
          (typeof window !== 'undefined' ? window.innerHeight : size) -
            80 -
            MARGIN
        ) // approx height
      }
    : null

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          border: '1px solid #ccc',
          imageRendering: 'pixelated',
          display: 'block'
        }}
      />
      {hovered && clampedTip && (
        <div
          style={{
            position: 'fixed',
            left: clampedTip.left,
            top: clampedTip.top,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.8)',
            color: '#fff',
            padding: '4px 6px',
            borderRadius: 4,
            fontSize: 12,
            pointerEvents: 'none',
            maxWidth: 260,
            whiteSpace: 'pre-wrap'
          }}
        >
          {`Cluster #${hovered.id} \u2022 ${hovered.type}\n`}
          {formatRangeByChains(hovered.range, viz).map((label, idx) => (
            <div key={idx}>{label}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PAEMatrixPlot
