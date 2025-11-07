import { useEffect, useRef } from 'react'

import { useStore } from 'react-redux'
import { AppDispatch } from 'app/store'
import { publicJobsApiSlice } from 'slices/publicJobsApiSlice'
import Item from 'themes/components/Item'
import { Grid } from '@mui/material'
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
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'

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
  const hasRun = useRef(false)
  const parent = useRef<HTMLDivElement>(null)
  const store = useStore()
  const dispatch = store.dispatch as AppDispatch

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

      const manifestResult = await dispatch(
        publicJobsApiSlice.endpoints.getPublicResultFileJson.initiate({
          publicId: job.publicId,
          filename: 'ensemble_pdb_files.json'
        })
      )
      const manifest = manifestResult.data as { ensemblePdbFiles: string[] }
      if (!manifest || !manifest.ensemblePdbFiles.length) {
        console.warn(
          `PublicMolstarViewer: no ensemblePdbFiles in manifest for publicId=${job.publicId}`
        )
        return
      }

      const pdbDataMap = new Map<string, string>()
      for (const fileName of manifest.ensemblePdbFiles) {
        const pdbResult = await dispatch(
          publicJobsApiSlice.endpoints.getPublicResultFileText.initiate({
            publicId: job.publicId,
            filename: fileName
          })
        )
        pdbDataMap.set(fileName, pdbResult.data || '')
      }

      const loadParamsMap = new Map<string, LoadParams[]>()
      for (const fileName of manifest.ensemblePdbFiles) {
        const match = fileName.match(/ensemble_size_(\d+)_model\.pdb$/)
        const ensembleSize = match ? parseInt(match[1], 10) : 1

        let paramsArray = loadParamsMap.get(fileName)
        if (!paramsArray) {
          paramsArray = []
          loadParamsMap.set(fileName, paramsArray)
        }

        for (let assemblyId = 1; assemblyId <= ensembleSize; assemblyId++) {
          paramsArray.push({
            format: 'pdb',
            fileName,
            assemblyId
          })
        }
      }

      const loadParamsArray = Array.from(loadParamsMap.values())

      for (const loadParamsGroup of loadParamsArray) {
        const { fileName } = loadParamsGroup[0]
        const pdbData = pdbDataMap.get(fileName)
        if (!pdbData) continue

        for (const { assemblyId } of loadParamsGroup) {
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
  }, [job, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

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

export default PublicMolstarViewer
