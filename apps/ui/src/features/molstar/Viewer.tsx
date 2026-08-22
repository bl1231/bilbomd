import { useEffect, useMemo, useRef, useState, createRef } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import MobileControlsShield from './MobileControlsShield'
import { axiosInstance } from 'app/api/axios'
import { useSelector } from 'react-redux'
import { selectCurrentToken } from '../../slices/authSlice'
import type {
  JobType,
  JobResultsDTO,
  IEnsembleModel,
  IEnsembleMember,
  IEnsemble,
  MDConstraintsDTO
} from '@bilbomd/bilbomd-types'
import { createPluginUI } from 'molstar/lib/mol-plugin-ui'
import {
  DefaultPluginUISpec,
  PluginUISpec
} from 'molstar/lib/mol-plugin-ui/spec'
import { PluginLayoutControlsDisplay } from 'molstar/lib/mol-plugin/layout'
import { ObjectKeys } from 'molstar/lib/mol-util/type-helpers'
import { PluginConfig } from 'molstar/lib/mol-plugin/config'
import { PluginSpec } from 'molstar/lib/mol-plugin/spec'
import { PluginBehaviors } from 'molstar/lib/mol-plugin/behavior'
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18'
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context'

import { logger } from 'utils/logger'
import { ViewportComponent } from './Viewport'
import EnsembleTogglePanel from './EnsembleTogglePanel'
import EnsembleWeightsPanel from './EnsembleWeightsPanel'
import {
  ShowButtons,
  StructurePreset,
  createDomainColorPreset,
  createUniformColorPreset
} from './presets'
import {
  ensembleMemberColorValue,
  STARTING_MODEL_COLOR_VALUE,
  STARTING_MODEL_ALPHA
} from './ensembleColors'
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory'
import 'molstar/lib/mol-plugin-ui/skin/light.scss'
import Item from 'themes/components/Item'

declare global {
  interface Window {
    molstar?: PluginUIContext
  }
}

type LoadParams = {
  url: string
  format: BuiltInTrajectoryFormat
  fileName: string
  isBinary?: boolean
  assemblyId: number
  ensembleSize?: number
}

type PDBsToLoad = LoadParams[]

interface HasEnsembles {
  ensembles: IEnsemble[]
}

// How structures are colored in the viewer:
// - 'default': per-structure palette coloring (Molstar structure-index)
// - 'domain': fixed/rigid/flexible domains from the MD constraints
// - 'conformation': each ensemble member a distinct color (see ensembleColors)
type ColorMode = 'default' | 'domain' | 'conformation'

// Job types whose results carry MultiFoXS ensembles, mapped to the key under
// which those ensembles live in JobResultsDTO.
const ensembleResultsKeys: Partial<Record<JobType, keyof JobResultsDTO>> = {
  pdb: 'classic',
  crd: 'classic',
  auto: 'auto',
  alphafold: 'alphafold',
  openfold: 'openfold',
  sans: 'sans'
}

// Extract the ensembles array for a job so the weights panel can render the
// per-conformation weights that the viewer already loads.
const getEnsemblesForJob = (
  jobType: JobType,
  results: JobResultsDTO
): IEnsemble[] => {
  const key = ensembleResultsKeys[jobType]
  if (!key) return []
  const jobResults = results?.[key] as HasEnsembles | null | undefined
  return Array.isArray(jobResults?.ensembles) ? jobResults.ensembles : []
}

const DefaultViewerOptions = {
  extensions: ObjectKeys({}),
  layoutIsExpanded: true,
  layoutShowControls: false,
  layoutShowRemoteState: false,
  layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
  layoutShowSequence: false,
  layoutShowLog: false,
  layoutShowLeftPanel: false,

  viewportShowExpand: PluginConfig.Viewport.ShowExpand.defaultValue,
  viewportShowControls: PluginConfig.Viewport.ShowControls.defaultValue,
  viewportShowSettings: PluginConfig.Viewport.ShowSettings.defaultValue,
  viewportShowSelectionMode:
    PluginConfig.Viewport.ShowSelectionMode.defaultValue,
  viewportShowAnimation: PluginConfig.Viewport.ShowAnimation.defaultValue,
  pluginStateServer: PluginConfig.State.DefaultServer.defaultValue,
  volumeStreamingServer:
    PluginConfig.VolumeStreaming.DefaultServer.defaultValue,
  pdbProvider: PluginConfig.Download.DefaultPdbProvider.defaultValue,
  emdbProvider: PluginConfig.Download.DefaultEmdbProvider.defaultValue
}

interface MolstarViewerProps {
  id: string
  jobType: JobType
  results: JobResultsDTO
  isPublic?: boolean
  publicId?: string
  constraints?: MDConstraintsDTO
}

const MolstarViewer = ({
  id,
  jobType,
  results,
  isPublic,
  publicId,
  constraints
}: MolstarViewerProps) => {
  const token = useSelector(selectCurrentToken)
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'))
  // On touch devices the Molstar canvas captures pan/zoom gestures, which
  // hijacks page scrolling — keep an overlay in place until the user opts in.
  const [mobileControlsEnabled, setMobileControlsEnabled] = useState(false)
  const [ensembleVisibility, setEnsembleVisibility] = useState<
    Record<number, boolean>
  >({})
  // Default to coloring each ensemble member a distinct color (with the
  // weights-panel legend) whenever there is a multi-member ensemble to show.
  const [colorMode, setColorMode] = useState<ColorMode>(() =>
    getEnsemblesForJob(jobType, results).some((e) => e.size >= 2)
      ? 'conformation'
      : 'default'
  )
  const ensembleStructureRefs = useRef<Map<number, string[]>>(new Map())
  const ensembleVisibilityRef = useRef<Record<number, boolean>>({})
  const colorModeRef = useRef<ColorMode>('default')
  const allStructureRefs = useRef<string[]>([])

  // The original starting (minimized input) model, toggled independently of the
  // ensembles for comparison. Kept out of allStructureRefs / ensembleStructureRefs
  // so color-mode and ensemble-visibility changes never touch it.
  const startingModelRef = useRef<string | null>(null)
  const [hasStartingModel, setHasStartingModel] = useState(false)
  const [showStartingModel, setShowStartingModel] = useState(false)

  const hasConstraints =
    (constraints?.fixed_bodies?.length ?? 0) > 0 ||
    (constraints?.rigid_bodies?.length ?? 0) > 0

  const ensembles = useMemo(
    () => getEnsemblesForJob(jobType, results),
    [jobType, results]
  )

  // Color-by-conformation is only meaningful when at least one visible ensemble
  // has multiple members to distinguish.
  const showConformationColor = ensembles.some((e) => e.size >= 2)

  const createLoadParamsArray = async (
    id: string,
    jobType: JobType,
    results: JobResultsDTO
  ): Promise<PDBsToLoad[]> => {
    const loadParamsMap = new Map<string, LoadParams[]>()

    const addFilesToLoadParams = (
      fileName: string,
      numModels: number,
      ensembleSize?: number
    ) => {
      let paramsArray = loadParamsMap.get(fileName)

      if (!paramsArray) {
        paramsArray = []
        loadParamsMap.set(fileName, paramsArray)
      }

      for (let assemblyId = 1; assemblyId <= numModels; assemblyId++) {
        const url = isPublic
          ? `/public/jobs/${publicId}/results/${fileName}`
          : `/jobs/${id}/results/${fileName}`
        paramsArray.push({
          url: url,
          format: 'pdb',
          fileName: fileName,
          assemblyId: assemblyId,
          ensembleSize: ensembleSize
        })
      }
    }

    const getResultsKey = (jobType: JobType): string => {
      switch (jobType) {
        case 'pdb':
        case 'crd':
          return 'classic'
        case 'auto':
          return 'auto'
        case 'alphafold':
          return 'alphafold'
        case 'openfold':
          return 'openfold'
        case 'sans':
          return 'sans'
        case 'scoper':
          return 'scoper'
        case 'multi':
          return ''
        default:
          logger.warn(`Unknown job type '${jobType}', defaulting to 'classic'`)
          return 'classic'
      }
    }

    const processEnsembleResults = (results: JobResultsDTO) => {
      if (
        !('ensembles' in results) ||
        !Array.isArray((results as HasEnsembles).ensembles)
      )
        return

      for (const ensemble of (results as HasEnsembles).ensembles) {
        const fileName = `ensemble_size_${ensemble.size}_model.pdb`

        const uniquePdbs = new Set<string>()
        ensemble.models.forEach((model: IEnsembleModel) => {
          model.states.forEach((state: IEnsembleMember) => {
            if (state.pdb) {
              uniquePdbs.add(state.pdb)
            }
          })
        })

        addFilesToLoadParams(fileName, ensemble.size, ensemble.size)
      }
    }

    const ensembleJobTypes: JobType[] = ['pdb', 'crd', 'auto', 'alphafold', 'openfold', 'sans']

    if (ensembleJobTypes.includes(jobType)) {
      const resultsKey = getResultsKey(jobType)
      const jobResults = results?.[
        resultsKey as keyof typeof results
      ] as JobResultsDTO

      if (jobResults) {
        processEnsembleResults(jobResults)
      }
    } else if (jobType === 'scoper') {
      if (results && results.scoper && results.scoper.foxs_top_file) {
        const pdbFilename = `scoper_combined_${results.scoper.foxs_top_file}`
        addFilesToLoadParams(pdbFilename, 1)
      }
    }

    return Array.from(loadParamsMap.values())
  }

  const fetchPdbData = async (url: string) => {
    try {
      const headers = isPublic ? {} : { Authorization: `Bearer ${token}` }
      const response = await axiosInstance.get(url, {
        responseType: 'text',
        headers
      })
      return response.data
    } catch (error) {
      logger.error('Error fetching PDB data:', error)
      return null
    }
  }

  const parent = createRef<HTMLDivElement>()

  useEffect(() => {
    ensembleVisibilityRef.current = ensembleVisibility
  }, [ensembleVisibility])

  useEffect(() => {
    colorModeRef.current = colorMode
  }, [colorMode])

  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) {
      return
    }
    hasRun.current = true
    const showButtons = true

    const refsMap = ensembleStructureRefs.current
    const structRefs = allStructureRefs.current

    async function init() {
      if (window.molstar) {
        window.molstar.dispose()
        window.molstar = undefined
      }
      const o = {
        ...DefaultViewerOptions,
        ...{
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowRemoteState: false,
          layoutShowSequence: false,
          layoutShowLog: false,
          layoutShowLeftPanel: true,

          viewportShowExpand: false,
          viewportShowControls: true,
          viewportShowSettings: false,
          viewportShowSelectionMode: false,
          viewportShowAnimation: false
        }
      }
      const defaultSpec = DefaultPluginUISpec()
      const spec: PluginUISpec = {
        actions: defaultSpec.actions,
        behaviors: [
          PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci, {
            mark: false
          }),
          PluginSpec.Behavior(
            PluginBehaviors.Representation.DefaultLociLabelProvider
          ),
          PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),

          PluginSpec.Behavior(PluginBehaviors.CustomProps.StructureInfo),
          PluginSpec.Behavior(PluginBehaviors.CustomProps.Interactions),
          PluginSpec.Behavior(PluginBehaviors.CustomProps.SecondaryStructure)
        ],
        animations: defaultSpec.animations,
        customParamEditors: defaultSpec.customParamEditors,
        layout: {
          initial: {
            isExpanded: o.layoutIsExpanded,
            showControls: o.layoutShowControls,
            controlsDisplay: o.layoutControlsDisplay
          }
        },
        components: {
          ...defaultSpec.components,
          controls: {
            ...defaultSpec.components?.controls,
            top: o.layoutShowSequence ? undefined : 'none',
            bottom: o.layoutShowLog ? undefined : 'none',
            left: o.layoutShowLeftPanel ? undefined : 'none'
          },
          remoteState: o.layoutShowRemoteState ? 'default' : 'none',
          viewport: {
            view: ViewportComponent
          }
        },
        config: [
          [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
          [PluginConfig.Viewport.ShowControls, o.viewportShowControls],
          [PluginConfig.Viewport.ShowSettings, o.viewportShowSettings],
          [
            PluginConfig.Viewport.ShowSelectionMode,
            o.viewportShowSelectionMode
          ],
          [PluginConfig.Viewport.ShowAnimation, o.viewportShowAnimation],
          [PluginConfig.State.DefaultServer, o.pluginStateServer],
          [PluginConfig.State.CurrentServer, o.pluginStateServer],
          [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
          [PluginConfig.Download.DefaultPdbProvider, o.pdbProvider],
          [PluginConfig.Download.DefaultEmdbProvider, o.emdbProvider],
          [ShowButtons, showButtons]
        ]
      }

      window.molstar = await createPluginUI({
        target: parent.current as HTMLDivElement,
        spec,
        render: renderReact18
      })

      const loadParamsArray = await createLoadParamsArray(id, jobType, results)
      for (const loadParamsGroup of loadParamsArray) {
        const { url, format, fileName, ensembleSize } = loadParamsGroup[0]!
        const pdbData = await fetchPdbData(url)

        for (const { assemblyId } of loadParamsGroup) {
          const data = await window.molstar.builders.data.rawData({
            data: pdbData,
            label: fileName
          })
          const trajectory =
            await window.molstar.builders.structure.parseTrajectory(
              data,
              format
            )
          const model = await window.molstar.builders.structure.createModel(
            trajectory,
            {
              modelIndex: assemblyId
            }
          )
          const struct =
            await window.molstar.builders.structure.createStructure(model)

          // Track all loaded structure refs for domain coloring
          structRefs.push(struct.ref)

          // A member's index within its ensemble is its position in the refs
          // array — this matches the weights-panel row order and legend colors.
          let memberIndex = 0
          if (ensembleSize !== undefined) {
            const refs = ensembleStructureRefs.current.get(ensembleSize) ?? []
            memberIndex = refs.length
            refs.push(struct.ref)
            ensembleStructureRefs.current.set(ensembleSize, refs)
          }
          const plugin = window.molstar
          const allStructs =
            plugin.managers.structure.hierarchy.current.structures
          const structureRef = allStructs.find(
            (s) => s.cell.transform.ref === struct.ref
          )
          if (structureRef) {
            // Color each ensemble member distinctly when conformation coloring
            // is the active default; otherwise use the standard preset.
            const preset =
              colorMode === 'conformation' && ensembleSize !== undefined
                ? createUniformColorPreset(ensembleMemberColorValue(memberIndex))
                : StructurePreset
            await plugin.managers.structure.component.applyPreset(
              [structureRef],
              preset
            )
          }
        }
      }

      const sizes = Array.from(ensembleStructureRefs.current.keys()).sort(
        (a, b) => a - b
      )
      if (sizes.length > 0) {
        const firstSize = sizes[0]
        setEnsembleVisibility(
          Object.fromEntries(sizes.map((s) => [s, s === firstSize]))
        )
        if (window.molstar) {
          const allStructures =
            window.molstar.managers.structure.hierarchy.current.structures
          for (const size of sizes) {
            if (size !== firstSize) {
              const refs = ensembleStructureRefs.current.get(size) ?? []
              const targets = allStructures.filter((s) =>
                refs.includes(s.cell.transform.ref)
              )
              if (targets.length > 0) {
                window.molstar.managers.structure.hierarchy.toggleVisibility(
                  targets,
                  'hide'
                )
              }
            }
          }

          ;(window.molstar.customState as Record<string, unknown>).reapplyVisibility =
            () => {
              const plugin = window.molstar
              if (!plugin) return
              const allStructs =
                plugin.managers.structure.hierarchy.current.structures
              for (const [sizeStr, visible] of Object.entries(
                ensembleVisibilityRef.current
              )) {
                const sz = Number(sizeStr)
                const refs = refsMap.get(sz) ?? []
                const targets = allStructs.filter((s) =>
                  refs.includes(s.cell.transform.ref)
                )
                if (targets.length > 0) {
                  plugin.managers.structure.hierarchy.toggleVisibility(
                    targets,
                    visible ? 'show' : 'hide'
                  )
                }
              }
            }
        }
      }

      // Load the original starting (minimized input) model so it can be toggled
      // on for comparison with the ensemble models. Hidden by default, colored a
      // neutral gray, and deliberately kept out of the ref maps that drive
      // coloring/visibility so it stays independent of them.
      if (ensembleResultsKeys[jobType] && window.molstar) {
        const startingUrl = isPublic
          ? `/public/jobs/${publicId}/results/minimization_output.pdb`
          : `/jobs/${id}/results/minimization_output.pdb`
        try {
          const startingData = await fetchPdbData(startingUrl)
          if (startingData) {
            const plugin = window.molstar
            const data = await plugin.builders.data.rawData({
              data: startingData,
              label: 'minimization_output.pdb'
            })
            const trajectory =
              await plugin.builders.structure.parseTrajectory(data, 'pdb')
            const model = await plugin.builders.structure.createModel(trajectory)
            const struct =
              await plugin.builders.structure.createStructure(model)
            startingModelRef.current = struct.ref
            const structureRef =
              plugin.managers.structure.hierarchy.current.structures.find(
                (s) => s.cell.transform.ref === struct.ref
              )
            if (structureRef) {
              await plugin.managers.structure.component.applyPreset(
                [structureRef],
                createUniformColorPreset(
                  STARTING_MODEL_COLOR_VALUE,
                  STARTING_MODEL_ALPHA
                )
              )
              plugin.managers.structure.hierarchy.toggleVisibility(
                [structureRef],
                'hide'
              )
            }
            setHasStartingModel(true)
          }
        } catch {
          // No starting model available for this job; leave the toggle hidden.
        }
      }
    }

    void init()

    return () => {
      window.molstar?.dispose()
      window.molstar = undefined
      hasRun.current = false
      refsMap.clear()
      structRefs.length = 0
      startingModelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyColorMode = async (nextMode: ColorMode) => {
    const plugin = window.molstar
    if (!plugin) return
    if (nextMode === 'domain' && !constraints) return

    const allStructures = plugin.managers.structure.hierarchy.current.structures

    try {
      if (nextMode === 'conformation') {
        // Color each ensemble member its own palette color, indexed by its
        // position within the ensemble so it matches the weights-panel legend.
        for (const refs of ensembleStructureRefs.current.values()) {
          for (let i = 0; i < refs.length; i++) {
            const target = allStructures.find(
              (s) => s.cell.transform.ref === refs[i]
            )
            if (!target) continue
            await plugin.managers.structure.component.applyPreset(
              [target],
              createUniformColorPreset(ensembleMemberColorValue(i))
            )
          }
        }
      } else {
        const targets = allStructures.filter((s) =>
          allStructureRefs.current.includes(s.cell.transform.ref)
        )
        if (targets.length === 0) return
        const preset =
          nextMode === 'domain' && constraints
            ? createDomainColorPreset(constraints)
            : StructurePreset
        await plugin.managers.structure.component.applyPreset(targets, preset)
      }

      // Re-apply ensemble visibility after rebuilding representations
      const reapply = (
        plugin.customState as Record<string, unknown>
      ).reapplyVisibility
      if (typeof reapply === 'function') reapply()

      setColorMode(nextMode)
    } catch (error) {
      logger.error('Failed to apply color preset:', error)
    }
  }

  const toggleDomainColor = () =>
    applyColorMode(colorModeRef.current === 'domain' ? 'default' : 'domain')

  const toggleConformationColor = () =>
    applyColorMode(
      colorModeRef.current === 'conformation' ? 'default' : 'conformation'
    )

  const toggleStartingModel = () => {
    const plugin = window.molstar
    const ref = startingModelRef.current
    if (!plugin || !ref) return
    const target = plugin.managers.structure.hierarchy.current.structures.find(
      (s) => s.cell.transform.ref === ref
    )
    if (!target) return
    const next = !showStartingModel
    plugin.managers.structure.hierarchy.toggleVisibility(
      [target],
      next ? 'show' : 'hide'
    )
    setShowStartingModel(next)
  }

  // Show exactly one ensemble at a time: reveal the chosen size and hide all
  // others.
  const selectEnsemble = (size: number) => {
    const plugin = window.molstar
    if (!plugin) return
    const allStructures = plugin.managers.structure.hierarchy.current.structures
    const sizes = Array.from(ensembleStructureRefs.current.keys())
    for (const s of sizes) {
      const refs = ensembleStructureRefs.current.get(s) ?? []
      const targets = allStructures.filter((st) =>
        refs.includes(st.cell.transform.ref)
      )
      if (targets.length > 0) {
        plugin.managers.structure.hierarchy.toggleVisibility(
          targets,
          s === size ? 'show' : 'hide'
        )
      }
    }
    setEnsembleVisibility(Object.fromEntries(sizes.map((s) => [s, s === size])))
  }

  return (
    <Item>
      <Grid container>
        <Box sx={{ width: '100%' }}>
          <EnsembleTogglePanel
            ensembleSizes={Object.keys(ensembleVisibility).map(Number)}
            visibility={ensembleVisibility}
            onSelect={selectEnsemble}
            hasConstraints={hasConstraints}
            domainColorActive={colorMode === 'domain'}
            onColorByDomain={toggleDomainColor}
            showConformationColor={showConformationColor}
            conformationColorActive={colorMode === 'conformation'}
            onColorByConformation={toggleConformationColor}
            showStartingModel={hasStartingModel}
            startingModelActive={showStartingModel}
            onToggleStartingModel={toggleStartingModel}
          />
          <Box sx={{ position: 'relative', width: '100%' }}>
            <div
              ref={parent}
              style={{
                width: '100%',
                height: isSmallScreen ? '420px' : '600px',
                position: 'relative'
              }}
            />
            {isSmallScreen && (
              <MobileControlsShield
                enabled={mobileControlsEnabled}
                onEnable={() => setMobileControlsEnabled(true)}
                onDisable={() => setMobileControlsEnabled(false)}
              />
            )}
          </Box>
          <EnsembleWeightsPanel
            ensembles={ensembles}
            visibility={ensembleVisibility}
            showColors={colorMode === 'conformation'}
          />
        </Box>
      </Grid>
    </Item>
  )
}

export default MolstarViewer
