import { useEffect, useRef, createRef } from 'react'
import Grid from '@mui/material/Grid'
import { axiosInstance } from 'app/api/axios'
import { useSelector } from 'react-redux'
import { selectCurrentToken } from '../../slices/authSlice'
import type {
  BilboMDJobDTO,
  JobType,
  ClassicJobResults,
  AutoJobResults,
  AlphafoldJobResults,
  SANSJobResults,
  ScoperJobResults,
  IEnsembleModel,
  IEnsembleMember
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
import { ShowButtons, ViewportComponent } from './Viewport'
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory'
import 'molstar/lib/mol-plugin-ui/skin/light.scss'
import Item from 'themes/components/Item'

declare global {
  interface Window {
    molstar?: PluginUIContext
    molstarEnsembleInfo?: Map<
      string,
      {
        ensembleSize: number
        fileName: string
        assemblyId: number
      }
    >
  }
}

type LoadParams = {
  url: string
  format: BuiltInTrajectoryFormat
  fileName: string
  isBinary?: boolean
  assemblyId: number
}

type PDBsToLoad = LoadParams[]

type EnsembleResults =
  | ClassicJobResults
  | AutoJobResults
  | AlphafoldJobResults
  | SANSJobResults
  | ScoperJobResults

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
  job: BilboMDJobDTO
}

const MolstarViewer = ({ job }: MolstarViewerProps) => {
  const token = useSelector(selectCurrentToken)

  const createLoadParamsArray = async (
    job: BilboMDJobDTO
  ): Promise<PDBsToLoad[]> => {
    console.log(
      'Creating LoadParams for job:',
      job.mongo.id,
      'jobType:',
      job.mongo.jobType
    )
    console.log('Results available:', !!job.mongo.results)
    console.log('MolstarViewer job:', job)
    const loadParamsMap = new Map<string, LoadParams[]>()

    // Helper function to add LoadParams to the Map
    const addFilesToLoadParams = (fileName: string, numModels: number) => {
      let paramsArray = loadParamsMap.get(fileName)

      if (!paramsArray) {
        paramsArray = []
        loadParamsMap.set(fileName, paramsArray)
      }

      for (let assemblyId = 1; assemblyId <= numModels; assemblyId++) {
        paramsArray.push({
          url: `/jobs/${job.mongo.id}/results/${fileName}`,
          format: 'pdb',
          fileName: fileName,
          assemblyId: assemblyId
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
    const processEnsembleResults = (results: EnsembleResults) => {
      if (!results?.ensembles) return

      // Process each ensemble size
      for (const ensemble of results.ensembles) {
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
        addFilesToLoadParams(fileName, ensemble.size)
      }
    }

    // Adding LoadParams based on job type and results structure
    const ensembleJobTypes: JobType[] = ['pdb', 'crd', 'auto', 'alphafold']

    if (ensembleJobTypes.includes(job.mongo.jobType)) {
      // Use the appropriate results structure based on job type
      const resultsKey = getResultsKey(job.mongo.jobType)
      const jobResults = job.mongo.results?.[
        resultsKey as keyof typeof job.mongo.results
      ] as EnsembleResults

      if (jobResults) {
        processEnsembleResults(jobResults)
      }
    } else if (job.mongo.jobType === 'scoper') {
      const scoperResults = job.mongo.results?.scoper
      if (scoperResults && scoperResults.foxs_top_file) {
        const pdbFilename = `scoper_combined_${scoperResults.foxs_top_file}`
        addFilesToLoadParams(pdbFilename, 1)
      }
    } else if (job.mongo.jobType === 'sans') {
      // SANS jobs might have different file structures - handle if needed
      console.log('SANS job detected - no ensemble loading implemented yet')
    }

    // Convert the Map values to an array of arrays
    return Array.from(loadParamsMap.values())
  }

  const fetchPdbData = async (url: string) => {
    try {
      const response = await axiosInstance.get(url, {
        responseType: 'text',
        headers: {
          Authorization: `Bearer ${token}`
        }
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

  // Attempt to prevent React Strictmode from loading molstar twice in dev mode.
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) {
      return
    }
    hasRun.current = true
    const showButtons = true

    async function init() {
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

      const loadParamsArray = await createLoadParamsArray(job)
      // console.log(loadParamsArray)
      for (const loadParamsGroup of loadParamsArray) {
        const { url, format, fileName } = loadParamsGroup[0] // All items in group have same url, format, fileName
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

          // Store ensemble information globally for the viewport to access
          if (!window.molstarEnsembleInfo) {
            window.molstarEnsembleInfo = new Map()
          }

          // Extract ensemble size from fileName if it matches the pattern
          const ensembleMatch = fileName.match(/ensemble_size_(\d+)_model\.pdb/)
          if (ensembleMatch && struct.cell) {
            const ensembleSize = parseInt(ensembleMatch[1], 10)
            window.molstarEnsembleInfo.set(struct.cell.transform.ref, {
              ensembleSize,
              fileName,
              assemblyId
            })
          }
          // console.log('struct: ', struct)
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
    }

    void init()

    return () => {
      window.molstar?.dispose()
      window.molstar = undefined
      hasRun.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Item>
      <Grid container>
        <div
          ref={parent}
          style={{
            width: '100%',
            height: '600px',
            position: 'relative'
          }}
        />
      </Grid>
    </Item>
  )
}

export default MolstarViewer
