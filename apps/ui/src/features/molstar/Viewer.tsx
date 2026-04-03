import { useEffect, useRef, useState, createRef } from 'react'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import { axiosInstance } from 'app/api/axios'
import { useSelector } from 'react-redux'
import { selectCurrentToken } from '../../slices/authSlice'
import type {
  JobType,
  JobResultsDTO,
  IEnsembleModel,
  IEnsembleMember,
  IEnsemble
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

import { ViewportComponent } from './Viewport'
import EnsembleTogglePanel from './EnsembleTogglePanel'
import { ShowButtons } from './presets'
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
}

const MolstarViewer = ({
  id,
  jobType,
  results,
  isPublic,
  publicId
}: MolstarViewerProps) => {
  const token = useSelector(selectCurrentToken)
  const [ensembleVisibility, setEnsembleVisibility] = useState<
    Record<number, boolean>
  >({})
  const ensembleStructureRefs = useRef<Map<number, string[]>>(new Map())
  const ensembleVisibilityRef = useRef<Record<number, boolean>>({})

  const createLoadParamsArray = async (
    id: string,
    jobType: JobType,
    results: JobResultsDTO
  ): Promise<PDBsToLoad[]> => {
    // console.log('Creating LoadParams for job:', id, 'jobType:', jobType)
    // console.log('Results available:', !!results)
    // console.log('MolstarViewer job:', { id, jobType, results })
    const loadParamsMap = new Map<string, LoadParams[]>()

    // Helper function to add LoadParams to the Map
    const addFilesToLoadParams = (
      fileName: string,
      numModels: number,
      ensembleSize?: number
    ) => {
      // console.log(
      //   `Adding file to load params: ${fileName} with ${numModels} models`
      // )
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

    // Helper function to get the results key based on job type
    const getResultsKey = (jobType: JobType): string => {
      switch (jobType) {
        case 'pdb':
        case 'crd':
          return 'classic'
        case 'auto':
          return 'auto'
        case 'alphafold':
          return 'alphafold'
        case 'sans':
          return 'sans'
        case 'scoper':
          return 'scoper'
        case 'multi':
          // Multi jobs don't have ensembles
          return ''
        default:
          console.warn(`Unknown job type '${jobType}', defaulting to 'classic'`)
          return 'classic'
      }
    }

    // Helper function to process ensemble results
    const processEnsembleResults = (results: JobResultsDTO) => {
      // console.log('Processing ensemble results for job type:', jobType)
      // console.log('Ensemble results data:', results)
      if (
        !('ensembles' in results) ||
        !Array.isArray((results as HasEnsembles).ensembles)
      )
        return

      // Process each ensemble size
      for (const ensemble of (results as HasEnsembles).ensembles) {
        const fileName = `ensemble_size_${ensemble.size}_model.pdb`

        // Count unique PDB files from all models' states to determine number of assemblies
        const uniquePdbs = new Set<string>()
        ensemble.models.forEach((model: IEnsembleModel) => {
          model.states.forEach((state: IEnsembleMember) => {
            if (state.pdb) {
              uniquePdbs.add(state.pdb)
            }
          })
        })

        // Use the ensemble size as the number of models to load
        // This corresponds to the number of MODEL records in the ensemble PDB file
        addFilesToLoadParams(fileName, ensemble.size, ensemble.size)
      }
    }

    // Adding LoadParams based on job type and results structure
    const ensembleJobTypes: JobType[] = ['pdb', 'crd', 'auto', 'alphafold']

    if (ensembleJobTypes.includes(jobType)) {
      // Use the appropriate results structure based on job type
      const resultsKey = getResultsKey(jobType)
      const jobResults = results?.[
        resultsKey as keyof typeof results
      ] as JobResultsDTO

      if (jobResults) {
        processEnsembleResults(jobResults)
      }
    } else if (jobType === 'scoper') {
      // const scoperJob = job as BilboMDScoperDTO
      // const scoperResults = results as ScoperJobResults
      if (results && results.scoper && results.scoper.foxs_top_file) {
        const pdbFilename = `scoper_combined_${results.scoper.foxs_top_file}`
        addFilesToLoadParams(pdbFilename, 1)
      }
    } else if (jobType === 'sans') {
      // SANS jobs might have different file structures - handle if needed
      console.log('SANS job detected - no ensemble loading implemented yet')
    }

    // Convert the Map values to an array of arrays
    return Array.from(loadParamsMap.values())
  }

  // Function to fetch PDB data with authorization
  const fetchPdbData = async (url: string) => {
    try {
      const headers = isPublic ? {} : { Authorization: `Bearer ${token}` }
      const response = await axiosInstance.get(url, {
        responseType: 'text',
        headers
      })
      // console.log('fetch: ', url)
      return response.data
    } catch (error) {
      console.error('Error fetching PDB data:', error)
      // Optionally, return something to indicate an error to the caller
      return null
    }
  }

  const parent = createRef<HTMLDivElement>()

  useEffect(() => {
    ensembleVisibilityRef.current = ensembleVisibility
  }, [ensembleVisibility])

  // Attempt to prevent React Strictmode from loading molstar twice in dev mode.
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) {
      return
    }
    hasRun.current = true
    const showButtons = true

    const refsMap = ensembleStructureRefs.current

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
          // [PluginConfig.item('showButtons', true), true]
          [ShowButtons, showButtons]
        ]
      }

      window.molstar = await createPluginUI({
        target: parent.current as HTMLDivElement,
        spec,
        render: renderReact18
      })

      const loadParamsArray = await createLoadParamsArray(id, jobType, results)
      // console.log(loadParamsArray)
      for (const loadParamsGroup of loadParamsArray) {
        const { url, format, fileName, ensembleSize } = loadParamsGroup[0] // All items in group have same url, format, fileName
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
          // console.log('traj: ', trajectory)
          // console.log('create model for assemblyId:', assemblyId)
          const model = await window.molstar.builders.structure.createModel(
            trajectory,
            {
              modelIndex: assemblyId
            }
          )
          const struct =
            await window.molstar.builders.structure.createStructure(model)
          // console.log('struct: ', struct)
          if (ensembleSize !== undefined) {
            const refs = ensembleStructureRefs.current.get(ensembleSize) ?? []
            refs.push(struct.ref)
            ensembleStructureRefs.current.set(ensembleSize, refs)
          }
          await window.molstar.builders.structure.representation.addRepresentation(
            struct,
            {
              type: 'cartoon',
              color: 'structure-index',
              size: 'uniform',
              sizeParams: { value: 1.0 }
            }
          )
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

          // Register callback so preset buttons can re-apply visibility after rebuilding representations
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
    }

    void init()

    return () => {
      window.molstar?.dispose()
      window.molstar = undefined
      hasRun.current = false
      refsMap.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleAllEnsembles = (action: 'show' | 'hide') => {
    const plugin = window.molstar
    if (!plugin) return
    const allRefs = Array.from(ensembleStructureRefs.current.values()).flat()
    const targets = plugin.managers.structure.hierarchy.current.structures.filter(
      (s) => allRefs.includes(s.cell.transform.ref)
    )
    if (targets.length > 0) {
      plugin.managers.structure.hierarchy.toggleVisibility(targets, action)
    }
    const sizes = Array.from(ensembleStructureRefs.current.keys())
    setEnsembleVisibility(
      Object.fromEntries(sizes.map((s) => [s, action === 'show']))
    )
  }

  const toggleEnsemble = (size: number) => {
    const plugin = window.molstar
    if (!plugin) return
    const refs = ensembleStructureRefs.current.get(size) ?? []
    const action = ensembleVisibility[size] ? 'hide' : 'show'
    const targets = plugin.managers.structure.hierarchy.current.structures.filter(
      (s) => refs.includes(s.cell.transform.ref)
    )
    if (targets.length > 0) {
      plugin.managers.structure.hierarchy.toggleVisibility(targets, action)
    }
    setEnsembleVisibility((prev) => ({ ...prev, [size]: !prev[size] }))
  }

  return (
    <Item>
      <Grid container>
        <Box sx={{ width: '100%' }}>
          <EnsembleTogglePanel
            ensembleSizes={Object.keys(ensembleVisibility).map(Number)}
            visibility={ensembleVisibility}
            onToggle={toggleEnsemble}
            onToggleAll={toggleAllEnsembles}
          />
          <div
            ref={parent}
            style={{
              width: '100%',
              height: '600px',
              position: 'relative'
            }}
          />
        </Box>
      </Grid>
    </Item>
  )
}

export default MolstarViewer
