import { useEffect, useRef } from 'react'
import { useStore } from 'react-redux'
import { AppDispatch } from 'app/store'
import { publicJobsApiSlice } from 'slices/publicJobsApiSlice'
import Item from 'themes/components/Item'
import { Grid, Typography, Box } from '@mui/material'
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
import { ShowButtons, ViewportComponent } from 'features/molstar/Viewport'
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory'
import 'molstar/lib/mol-plugin-ui/skin/light.scss'
import type { PublicJobStatus, JobType } from '@bilbomd/bilbomd-types'
import HeaderBox from 'components/HeaderBox'

declare global {
  interface Window {
    molstar?: PluginUIContext
  }
}

type LoadParams = {
  format: BuiltInTrajectoryFormat
  fileName: string
  isBinary?: boolean
  assemblyId: number
}

type PDBsToLoad = LoadParams[]

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

interface PublicMolstarViewerProps {
  job: PublicJobStatus
}

const PublicMolstarViewer = ({ job }: PublicMolstarViewerProps) => {
  console.log('PublicMolstarViewer job:', job)
  const hasRun = useRef(false)
  const parent = useRef<HTMLDivElement>(null)
  const store = useStore()
  const dispatch = store.dispatch as AppDispatch

  const createLoadParamsArray = async (
    job: PublicJobStatus
  ): Promise<PDBsToLoad[]> => {
    console.log(
      'Creating LoadParams for public job:',
      job.jobId,
      'jobType:',
      job.jobType
    )
    console.log('Results available:', !!job.results)
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
          format: 'pdb',
          fileName: fileName,
          assemblyId: assemblyId
        })
      }
    }

    // Adding LoadParams based on job type and results structure
    const ensembleJobTypes: JobType[] = ['pdb', 'crd', 'auto', 'alphafold']

    if (ensembleJobTypes.includes(job.jobType as JobType)) {
      // Use the results structure
      const classicResults = job.results?.classic
      if (classicResults?.ensembles) {
        // Process each ensemble size
        for (const ensemble of classicResults.ensembles) {
          const fileName = `ensemble_size_${ensemble.size}_model.pdb`

          // Use the ensemble size as the number of models to load
          // This corresponds to the number of MODEL records in the ensemble PDB file
          addFilesToLoadParams(fileName, ensemble.size)
        }
      }
    } else if (job.jobType === 'scoper') {
      // For scoper jobs, we might need to handle differently
      // Since we don't have the foxs_top_file in PublicJobStatus, we'll skip for now
      console.warn(
        'Scoper job visualization not yet implemented for public viewer'
      )
    }

    // Convert the Map values to an array of arrays
    return Array.from(loadParamsMap.values())
  }

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
          [ShowButtons, showButtons]
        ]
      }

      window.molstar = await createPluginUI({
        target: parent.current as HTMLDivElement,
        spec,
        render: renderReact18
      })

      const loadParamsArray = await createLoadParamsArray(job)
      console.log('Load params array:', loadParamsArray)

      const pdbDataMap = new Map<string, string>()
      for (const loadParamsGroup of loadParamsArray) {
        const { fileName } = loadParamsGroup[0] // All items in group have same fileName
        const pdbResult = await dispatch(
          publicJobsApiSlice.endpoints.getPublicResultFileText.initiate({
            publicId: job.publicId,
            filename: fileName
          })
        )
        pdbDataMap.set(fileName, pdbResult.data || '')
      }

      for (const loadParamsGroup of loadParamsArray) {
        const { fileName } = loadParamsGroup[0]
        const pdbData = pdbDataMap.get(fileName)
        if (!pdbData) continue

        for (const { assemblyId } of loadParamsGroup) {
          console.log('Loading assembly:', assemblyId, 'from file:', fileName)
          const data = await window.molstar.builders.data.rawData({
            data: pdbData,
            label: fileName
          })
          const trajectory =
            await window.molstar.builders.structure.parseTrajectory(data, 'pdb')
          const model = await window.molstar.builders.structure.createModel(
            trajectory,
            {
              modelIndex: assemblyId
            }
          )
          const struct =
            await window.molstar.builders.structure.createStructure(model)
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
  }, [job, dispatch])

  return (
    <>
      <Grid size={{ xs: 12 }}>
        <HeaderBox sx={{ py: '6px' }}>
          <Typography>
            Molstar Viewer
            <Box
              component="span"
              sx={{ color: 'yellow', fontSize: '0.75em' }}
            >
              experimental
            </Box>
          </Typography>
        </HeaderBox>
        <Item>
          <div
            ref={parent}
            style={{
              width: '100%',
              height: '600px',
              position: 'relative'
            }}
          />
        </Item>
      </Grid>
    </>
  )
}

export default PublicMolstarViewer
