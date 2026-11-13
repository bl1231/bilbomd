import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, Chip, Typography, useMediaQuery } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'
import {
  bodyColor,
  buildSchematicModel,
  describeBody,
  describeLinker,
  FIXED_PALETTE,
  fitViewBox,
  isTaut,
  linkerPath,
  TAIL_RADIUS,
  visibleLabels,
  type Linker,
  type SchematicBody
} from './schematicModel'
import {
  createSchematicSimulation,
  seededRandom,
  standardNormal
} from './schematicSimulation'

const HINT =
  'Hover a bead, a spring or a body below to read it. Drag a rigid body to see how far its linkers let it go.'
const FIXED_MESSAGE = 'Fixed segments stay where they are during MD.'

const labelY = (body: SchematicBody) =>
  body.y + body.R + (body.beads.length > 1 ? 19 : 14)

type Drag = { body: SchematicBody; dx: number; dy: number }

interface ConstraintSchematicProps {
  constraints: MDConstraintsDTO
}

/**
 * The fixed, rigid and flexible regions of a constraint file as beads and
 * springs: fixed segments are pinned, each rigid body moves as one piece, and
 * flexible linkers coil when slack and straighten when pulled tight.
 */
export const ConstraintSchematic = ({
  constraints
}: ConstraintSchematicProps) => {
  const theme = useTheme()
  const dark = theme.palette.mode === 'dark'
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', {
    noSsr: true
  })
  const [playing, setPlaying] = useState(() => !reducedMotion)
  const playingRef = useRef(playing)
  const [seed, setSeed] = useState(1)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [readout, setReadout] = useState(HINT)
  const patternId = `hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  const svgRef = useRef<SVGSVGElement>(null)
  const bodyEls = useRef(new Map<SchematicBody, SVGGElement>())
  const linkerEls = useRef(new Map<Linker, SVGPathElement>())
  const hitEls = useRef(new Map<Linker, SVGPathElement>())
  const labelEls = useRef(new Map<SchematicBody, SVGTextElement>())
  const drag = useRef<Drag | null>(null)

  // A new layout for new constraints or a re-shuffle. It settles here, so the
  // first frame already shows the finished layout.
  const { model, sim, viewBox } = useMemo(() => {
    const model = buildSchematicModel(constraints)
    const sim = createSchematicSimulation(model, {
      motion: () => (playingRef.current ? 1 : 0),
      normal: standardNormal,
      random: seededRandom(seed)
    })
    sim.settle()
    return { model, sim, viewBox: fitViewBox(model) }
  }, [constraints, seed])

  const rigidBodies = useMemo(
    () => model.bodies.filter((b) => b.kind === 'rigid'),
    [model]
  )

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    const draw = () => {
      for (const [body, el] of bodyEls.current) {
        el.setAttribute(
          'transform',
          `translate(${body.x.toFixed(1)},${body.y.toFixed(1)})`
        )
      }
      for (const [linker, el] of linkerEls.current) {
        const d = linkerPath(linker)
        el.setAttribute('d', d)
        el.classList.toggle('taut', isTaut(linker))
        hitEls.current.get(linker)?.setAttribute('d', d)
      }
      const shown = visibleLabels(rigidBodies, labelY)
      for (const [body, el] of labelEls.current) {
        el.setAttribute('x', body.x.toFixed(1))
        el.setAttribute('y', labelY(body).toFixed(1))
        el.style.visibility = shown.has(body) ? 'visible' : 'hidden'
      }
    }
    draw()
    sim.simulation.on('tick', () => {
      sim.constrain()
      draw()
    })
    return () => {
      sim.simulation.on('tick', null)
      sim.simulation.stop()
    }
  }, [sim, rigidBodies])

  useEffect(() => {
    if (playing) sim.simulation.alphaTarget(0.3).restart()
    else sim.simulation.alphaTarget(0)
  }, [sim, playing])

  const toSvg = (event: ReactPointerEvent) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      ctm.inverse()
    )
  }

  const startDrag = (body: SchematicBody, event: ReactPointerEvent) => {
    if (body.pinned) {
      setReadout(FIXED_MESSAGE)
      return
    }
    const p = toSvg(event)
    if (!p) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { body, dx: body.x - p.x, dy: body.y - p.y }
    body.target = { x: body.x, y: body.y }
    sim.simulation.alphaTarget(0.3).restart()
  }

  const moveDrag = (body: SchematicBody, event: ReactPointerEvent) => {
    const current = drag.current
    if (current?.body !== body) return
    const p = toSvg(event)
    if (p) body.target = { x: p.x + current.dx, y: p.y + current.dy }
  }

  const endDrag = (body: SchematicBody) => {
    if (drag.current?.body !== body) return
    drag.current = null
    body.target = null
    if (!playingRef.current) sim.simulation.alphaTarget(0)
  }

  const enter = (key: string, text: string) => {
    setHighlight(key)
    setReadout(text)
  }
  const leave = () => {
    setHighlight(null)
    setReadout(HINT)
  }
  const dimmed = (...keys: string[]) =>
    highlight !== null && !keys.includes(highlight)

  const fixedColor = dark ? FIXED_PALETTE[1] : FIXED_PALETTE[0]
  const surface = theme.palette.background.paper
  const fixedBeads = model.beads.filter((b) => b.body.kind === 'fixed')
  const chainsOf = (beads: { chainId: string }[]) =>
    [...new Set(beads.map((b) => b.chainId))].sort().join('+')
  const segmentCount = (n: number) => `${n} seg${n === 1 ? '' : 's'}`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause motion' : 'Animate motion'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={() => setSeed((s) => s + 1)}
        >
          Re-shuffle layout
        </Button>
      </Box>

      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          backgroundColor: 'background.paper',
          '& svg': {
            display: 'block',
            width: '100%',
            height: 'auto',
            maxHeight: 560,
            touchAction: 'none'
          },
          '& .linker': {
            fill: 'none',
            stroke: theme.palette.text.secondary,
            strokeWidth: 1.6,
            strokeLinejoin: 'round',
            strokeLinecap: 'round'
          },
          '& .linker.taut': {
            stroke: theme.palette.warning.main,
            strokeWidth: 2.2
          },
          '& .hit': { fill: 'none', stroke: 'transparent', strokeWidth: 12 },
          '& .body-name': {
            fill: theme.palette.text.primary,
            fontFamily: theme.typography.fontFamily,
            fontSize: 11,
            fontWeight: 500,
            textAnchor: 'middle',
            pointerEvents: 'none',
            paintOrder: 'stroke',
            stroke: surface,
            strokeWidth: 3
          },
          '& .bead-label': {
            fontFamily: theme.typography.fontFamily,
            fontSize: 10,
            fontWeight: 600,
            textAnchor: 'middle',
            dominantBaseline: 'central',
            pointerEvents: 'none'
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          role="img"
          aria-label="Bead-and-spring schematic of the fixed, rigid and flexible regions"
        >
          <defs>
            <pattern
              id={patternId}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect
                width={6}
                height={6}
                fill={alpha(fixedColor, 0.12)}
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={6}
                stroke={fixedColor}
                strokeWidth={1.2}
                opacity={0.4}
              />
            </pattern>
          </defs>

          <g>
            {model.linkers.map((linker) => (
              <g
                key={`${linker.chainId}-${linker.start}`}
                opacity={
                  dimmed(linker.a.body.key, linker.b.body.key) ? 0.18 : 1
                }
              >
                <path
                  className="linker"
                  data-testid="schematic-linker"
                  ref={(el) => {
                    if (!el) return
                    linkerEls.current.set(linker, el)
                    return () => {
                      linkerEls.current.delete(linker)
                    }
                  }}
                />
                <path
                  className="hit"
                  ref={(el) => {
                    if (!el) return
                    hitEls.current.set(linker, el)
                    return () => {
                      hitEls.current.delete(linker)
                    }
                  }}
                  onPointerEnter={() => setReadout(describeLinker(linker))}
                  onPointerLeave={() => setReadout(HINT)}
                />
              </g>
            ))}
          </g>

          <g>
            {model.bodies.map((body, i) => {
              const color = bodyColor(body, dark)
              return (
                <g
                  key={`${body.key}-${i}`}
                  data-testid="schematic-body"
                  data-kind={body.kind}
                  opacity={dimmed(body.key) ? 0.18 : 1}
                  style={{ cursor: body.pinned ? 'not-allowed' : 'grab' }}
                  ref={(el) => {
                    if (!el) return
                    bodyEls.current.set(body, el)
                    return () => {
                      bodyEls.current.delete(body)
                    }
                  }}
                  onPointerEnter={() =>
                    enter(body.key, describeBody(model, body))
                  }
                  onPointerLeave={leave}
                  onPointerDown={(e) => startDrag(body, e)}
                  onPointerMove={(e) => moveDrag(body, e)}
                  onPointerUp={() => endDrag(body)}
                  onPointerCancel={() => endDrag(body)}
                >
                  {body.kind === 'tail' ? (
                    <>
                      <circle
                        r={TAIL_RADIUS}
                        fill={color}
                      />
                      <circle
                        r={9}
                        fill="transparent"
                      />
                    </>
                  ) : (
                    <>
                      {body.kind === 'rigid' && body.beads.length > 1 && (
                        <circle
                          r={body.R + 5}
                          fill={color}
                          fillOpacity={0.13}
                          stroke={color}
                          strokeWidth={1.6}
                        />
                      )}
                      {body.beads.map((bead) => (
                        <circle
                          key={`${bead.chainId}-${bead.start}`}
                          data-testid="schematic-bead"
                          cx={bead.ox}
                          cy={bead.oy}
                          r={bead.r}
                          fill={
                            body.kind === 'fixed' ? `url(#${patternId})` : color
                          }
                          stroke={body.kind === 'fixed' ? color : surface}
                          strokeWidth={body.kind === 'fixed' ? 1.8 : 1.2}
                        />
                      ))}
                      {body.beads
                        .filter((bead) => bead.r >= 11)
                        .map((bead) => (
                          <text
                            key={`${bead.chainId}-${bead.start}`}
                            className="bead-label"
                            x={bead.ox}
                            y={bead.oy}
                            fill={
                              body.kind === 'fixed'
                                ? color
                                : theme.palette.getContrastText(color)
                            }
                          >
                            {bead.chainId}
                          </text>
                        ))}
                    </>
                  )}
                </g>
              )
            })}
          </g>

          <g>
            {rigidBodies.map((body) => (
              <text
                key={body.key}
                className="body-name"
                opacity={dimmed(body.key) ? 0.18 : 1}
                ref={(el) => {
                  if (!el) return
                  labelEls.current.set(body, el)
                  return () => {
                    labelEls.current.delete(body)
                  }
                }}
              >
                {body.name}
              </text>
            ))}
          </g>
        </svg>
        <Typography
          role="status"
          aria-live="polite"
          variant="body2"
          color="text.secondary"
          sx={{
            px: 1.5,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            minHeight: '1.5em',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {readout}
        </Typography>
      </Box>

      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
        aria-label="Bodies"
      >
        {fixedBeads.length > 0 && (
          <Chip
            size="small"
            variant="outlined"
            tabIndex={0}
            data-testid="schematic-legend-fixed"
            icon={
              <Box
                component="span"
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `1.5px solid ${fixedColor}`,
                  background: `repeating-linear-gradient(45deg, ${alpha(fixedColor, 0.5)} 0 2px, transparent 2px 5px)`
                }}
              />
            }
            label={`Fixed (pinned) · ${segmentCount(fixedBeads.length)} · ${chainsOf(fixedBeads)}`}
            onMouseEnter={() => setHighlight('fixed')}
            onMouseLeave={() => setHighlight(null)}
            onFocus={() => setHighlight('fixed')}
            onBlur={() => setHighlight(null)}
          />
        )}
        {rigidBodies.map((body) => (
          <Chip
            key={body.key}
            size="small"
            variant="outlined"
            tabIndex={0}
            data-testid="schematic-legend-rigid"
            icon={
              <Box
                component="span"
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: bodyColor(body, dark)
                }}
              />
            }
            label={`${body.name} · ${segmentCount(body.beads.length)} · ${chainsOf(body.beads)}`}
            onMouseEnter={() => setHighlight(body.key)}
            onMouseLeave={() => setHighlight(null)}
            onFocus={() => setHighlight(body.key)}
            onBlur={() => setHighlight(null)}
          />
        ))}
        <Chip
          size="small"
          variant="outlined"
          label="Flexible"
          icon={
            <svg
              viewBox="0 0 26 12"
              width={26}
              height={12}
              aria-hidden
            >
              <path
                d="M1 6 Q4 1 7 6 T13 6 T19 6 T25 6"
                fill="none"
                stroke={theme.palette.text.secondary}
                strokeWidth={1.6}
              />
            </svg>
          }
        />
        <Chip
          size="small"
          variant="outlined"
          label="Fully stretched"
          icon={
            <svg
              viewBox="0 0 26 12"
              width={26}
              height={12}
              aria-hidden
            >
              <path
                d="M1 6 H25"
                fill="none"
                stroke={theme.palette.warning.main}
                strokeWidth={2.2}
              />
            </svg>
          }
        />
      </Box>

      <Typography
        variant="caption"
        color="text.secondary"
      >
        Schematic only: positions show what can move relative to what, not the
        3D structure. Bead size grows with residue count, spring length with
        linker length. Residues after the last constrained one aren&apos;t in
        the constraint file, so chains stop there.
      </Typography>
    </Box>
  )
}

export default ConstraintSchematic
