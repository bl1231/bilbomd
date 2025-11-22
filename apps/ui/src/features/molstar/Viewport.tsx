/**
 * Copyright (c) 2020-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { InteractionsRepresentationProvider } from 'molstar/lib/mol-model-props/computed/representations/interactions'
import { InteractionTypeColorThemeProvider } from 'molstar/lib/mol-model-props/computed/themes/interaction-type'
import {
  presetStaticComponent,
  StructureRepresentationPresetProvider
} from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset'
import {
  StructureSelectionQueries,
  StructureSelectionQuery
} from 'molstar/lib/mol-plugin-state/helpers/structure-selection-query'
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state'
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base'
import { LociLabels } from 'molstar/lib/mol-plugin-ui/controls'
import { Button } from 'molstar/lib/mol-plugin-ui/controls/common'
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task'
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast'
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport'
import { PluginCommands } from 'molstar/lib/mol-plugin/commands'
import { PluginConfig } from 'molstar/lib/mol-plugin/config'
import { PluginContext } from 'molstar/lib/mol-plugin/context'
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder'
import { StateObjectRef } from 'molstar/lib/mol-state'
import { Color } from 'molstar/lib/mol-util/color'
import { Material } from 'molstar/lib/mol-util/material'

function shinyStyle(plugin: PluginContext) {
  return PluginCommands.Canvas3D.SetSettings(plugin, {
    settings: {
      renderer: {
        ...plugin.canvas3d!.props.renderer
      },
      postprocessing: {
        ...plugin.canvas3d!.props.postprocessing,
        occlusion: { name: 'off', params: {} },
        shadow: { name: 'off', params: {} },
        outline: { name: 'off', params: {} }
      }
    }
  })
}

function occlusionStyle(plugin: PluginContext) {
  return PluginCommands.Canvas3D.SetSettings(plugin, {
    settings: {
      renderer: {
        ...plugin.canvas3d!.props.renderer
      },
      postprocessing: {
        ...plugin.canvas3d!.props.postprocessing,
        occlusion: {
          name: 'on',
          params: {
            blurKernelSize: 15,
            multiScale: { name: 'off', params: {} },
            radius: 5,
            bias: 0.8,
            samples: 32,
            resolutionScale: 1,
            color: Color(0x000000)
          }
        },
        outline: {
          name: 'on',
          params: {
            scale: 1.0,
            threshold: 0.33,
            color: Color(0x0000),
            includeTransparent: true
          }
        },
        shadow: { name: 'off', params: {} }
      }
    }
  })
}

const ligandPlusSurroundings = StructureSelectionQuery(
  'Surrounding Residues (5 \u212B) of Ligand plus Ligand itself',
  MS.struct.modifier.union([
    MS.struct.modifier.includeSurroundings({
      0: StructureSelectionQueries.ligand.expression,
      radius: 5,
      'as-whole-residues': true
    })
  ])
)

const ligandSurroundings = StructureSelectionQuery(
  'Surrounding Residues (5 \u212B) of Ligand',
  MS.struct.modifier.union([
    MS.struct.modifier.exceptBy({
      0: ligandPlusSurroundings.expression,
      by: StructureSelectionQueries.ligand.expression
    })
  ])
)

const PresetParams = {
  ...StructureRepresentationPresetProvider.CommonParams
}

const CustomMaterial = Material({ roughness: 0.2, metalness: 0 })

export const StructurePreset = StructureRepresentationPresetProvider({
  id: 'preset-structure',
  display: { name: 'Structure' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    if (!structureCell) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      polymer: await presetStaticComponent(plugin, structureCell, 'polymer'),
      ions: await presetStaticComponent(plugin, structureCell, 'ion')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 0.35
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      polymer: builder.buildRepresentation(
        update,
        components.polymer,
        {
          type: 'cartoon',
          typeParams: { ...typeParams, material: CustomMaterial },
          color: 'structure-index',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorParams: { palette: (plugin.customState as any).colorPalette }
        },
        { tag: 'polymer' }
      ),
      ions: builder.buildRepresentation(
        update,
        components.ions,
        {
          type: 'spacefill',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 1.0
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      )
    }

    await update.commit({ revertOnError: true })
    await shinyStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'residue' })

    return { components, representations }
  }
})

export const IllustrativePreset = StructureRepresentationPresetProvider({
  id: 'preset-illustrative',
  display: { name: 'Illustrative' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    if (!structureCell) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      polymer: await presetStaticComponent(plugin, structureCell, 'polymer'),
      ions: await presetStaticComponent(plugin, structureCell, 'ion')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'spacefill',
          typeParams: { ...typeParams, ignoreLight: true },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      polymer: builder.buildRepresentation(
        update,
        components.polymer,
        {
          type: 'spacefill',
          typeParams: { ...typeParams, ignoreLight: true },
          color: 'illustrative',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorParams: { palette: (plugin.customState as any).colorPalette }
        },
        { tag: 'polymer' }
      ),
      ions: builder.buildRepresentation(
        update,
        components.ions,
        {
          type: 'spacefill',
          typeParams: { ...typeParams, ignoreLight: true },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      )
    }

    await update.commit({ revertOnError: true })
    await occlusionStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'residue' })

    return { components, representations }
  }
})

const SurfacePreset = StructureRepresentationPresetProvider({
  id: 'preset-surface',
  display: { name: 'Surface' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    const structure = structureCell?.obj?.data
    if (!structureCell || !structure) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      polymer: await presetStaticComponent(plugin, structureCell, 'polymer'),
      ions: await presetStaticComponent(plugin, structureCell, 'ion')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 0.26
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      polymer: builder.buildRepresentation(
        update,
        components.polymer,
        {
          type: 'molecular-surface',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            quality: 'custom',
            resolution: 0.5,
            doubleSided: true
          },
          color: 'partial-charge'
        },
        { tag: 'polymer' }
      ),
      ions: builder.buildRepresentation(
        update,
        components.ions,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 1.0
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      )
    }

    await update.commit({ revertOnError: true })
    await shinyStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'residue' })

    return { components, representations }
  }
})

const PocketPreset = StructureRepresentationPresetProvider({
  id: 'preset-pocket',
  display: { name: 'Pocket' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    const structure = structureCell?.obj?.data
    if (!structureCell || !structure) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      surroundings:
        await plugin.builders.structure.tryCreateComponentFromSelection(
          structureCell,
          ligandSurroundings,
          `surroundings`
        )
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 0.26
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      surroundings: builder.buildRepresentation(
        update,
        components.surroundings,
        {
          type: 'molecular-surface',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            includeParent: true,
            quality: 'custom',
            resolution: 0.2,
            doubleSided: true
          },
          color: 'partial-charge'
        },
        { tag: 'surroundings' }
      )
    }

    await update.commit({ revertOnError: true })
    await shinyStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'element' })

    return { components, representations }
  }
})

const InteractionsPreset = StructureRepresentationPresetProvider({
  id: 'preset-interactions',
  display: { name: 'Interactions' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    const structure = structureCell?.obj?.data
    if (!structureCell || !structure) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      surroundings:
        await plugin.builders.structure.tryCreateComponentFromSelection(
          structureCell,
          ligandSurroundings,
          `surroundings`
        ),
      interactions: await presetStaticComponent(plugin, structureCell, 'ligand')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 0.3
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      ballAndStick: builder.buildRepresentation(
        update,
        components.surroundings,
        {
          type: 'ball-and-stick',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            sizeFactor: 0.1,
            sizeAspectRatio: 1
          },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ball-and-stick' }
      ),
      interactions: builder.buildRepresentation(
        update,
        components.interactions,
        {
          type: InteractionsRepresentationProvider,
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            includeParent: true,
            parentDisplay: 'between'
          },
          color: InteractionTypeColorThemeProvider
        },
        { tag: 'interactions' }
      ),
      label: builder.buildRepresentation(
        update,
        components.surroundings,
        {
          type: 'label',
          typeParams: {
            ...typeParams,
            material: CustomMaterial,
            background: false,
            borderWidth: 0.1
          },
          color: 'uniform',
          colorParams: { value: Color(0x000000) }
        },
        { tag: 'label' }
      )
    }

    await update.commit({ revertOnError: true })
    await shinyStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'element' })

    return { components, representations }
  }
})

export const ShowButtons = PluginConfig.item('showButtons', true)

export class ViewportComponent extends PluginUIComponent {
  state = {
    visibleEnsembles: new Set<string>() // Track which ensembles are visible
  }

  async _set(
    structures: readonly StructureRef[],
    preset: StructureRepresentationPresetProvider
  ) {
    await this.plugin.managers.structure.component.clear(structures)
    await this.plugin.managers.structure.component.applyPreset(
      structures,
      preset
    )
  }

  set = async (preset: StructureRepresentationPresetProvider) => {
    await this._set(
      this.plugin.managers.structure.hierarchy.selection.structures,
      preset
    )
  }

  structurePreset = () => this.set(StructurePreset)
  illustrativePreset = () => this.set(IllustrativePreset)
  surfacePreset = () => this.set(SurfacePreset)
  pocketPreset = () => this.set(PocketPreset)
  interactionsPreset = () => this.set(InteractionsPreset)

  toggleEnsemble = async (ensembleSize: number) => {
    const ensembleKey = `ensemble_size_${ensembleSize}`
    const isVisible = this.state.visibleEnsembles.has(ensembleKey)
    const newVisibility = !isVisible

    // Find structures matching this ensemble size using global ensemble info
    const state = this.plugin.state.data
    const structures =
      this.plugin.managers.structure.hierarchy.current.structures

    if (window.molstarEnsembleInfo) {
      for (const structure of structures) {
        const ensembleInfo = window.molstarEnsembleInfo.get(
          structure.cell.transform.ref
        )
        if (ensembleInfo && ensembleInfo.ensembleSize === ensembleSize) {
          // Toggle visibility of matching structures and their representations
          await PluginCommands.State.ToggleVisibility(this.plugin, {
            state,
            ref: structure.cell.transform.ref
          }).catch((e) => console.warn('Failed to toggle visibility:', e))

          // Also check for child components (representations)
          const children = state.tree.children.get(structure.cell.transform.ref)
          if (children) {
            for (const childRef of children.values()) {
              await PluginCommands.State.ToggleVisibility(this.plugin, {
                state,
                ref: childRef
              }).catch((e) =>
                console.warn('Failed to toggle child visibility:', e)
              )
            }
          }
        }
      }
    }

    // Update local state
    if (newVisibility) {
      this.state.visibleEnsembles.add(ensembleKey)
    } else {
      this.state.visibleEnsembles.delete(ensembleKey)
    }
    this.forceUpdate()
  }

  getAvailableEnsembles = () => {
    const structures =
      this.plugin.managers.structure.hierarchy.current.structures
    const ensembleSizes = new Set<number>()

    console.log('DEBUG: Checking structures for ensembles:', structures.length)
    console.log('DEBUG: Global ensemble info:', window.molstarEnsembleInfo)

    if (window.molstarEnsembleInfo) {
      structures.forEach((s) => {
        const ensembleInfo = window.molstarEnsembleInfo?.get(
          s.cell.transform.ref
        )
        console.log(
          'DEBUG: Structure ref:',
          s.cell.transform.ref,
          'Info:',
          ensembleInfo
        )
        if (ensembleInfo) {
          ensembleSizes.add(ensembleInfo.ensembleSize)
        }
      })
    }

    console.log('DEBUG: Available ensemble sizes:', Array.from(ensembleSizes))
    return Array.from(ensembleSizes).sort((a, b) => a - b)
  }

  // Initialize all ensembles as visible when first loaded
  componentDidMount() {
    console.log('DEBUG: ViewportComponent mounted')

    // Set up a listener for when structures are loaded
    this.plugin.managers.structure.hierarchy.behaviors.selection.subscribe(
      () => {
        console.log('DEBUG: Structure hierarchy changed')
        const available = this.getAvailableEnsembles()
        console.log('DEBUG: Available ensembles after change:', available)
        if (available.length > 0 && this.state.visibleEnsembles.size === 0) {
          // Initialize all ensembles as visible
          available.forEach((size) => {
            this.state.visibleEnsembles.add(`ensemble_size_${size}`)
          })
          console.log(
            'DEBUG: Initialized visible ensembles:',
            this.state.visibleEnsembles
          )
          this.forceUpdate()
        }
      }
    )

    // Also check periodically in case the subscription doesn't fire
    const checkInterval = setInterval(() => {
      const available = this.getAvailableEnsembles()
      if (available.length > 0) {
        console.log('DEBUG: Periodic check found ensembles:', available)
        if (this.state.visibleEnsembles.size === 0) {
          available.forEach((size) => {
            this.state.visibleEnsembles.add(`ensemble_size_${size}`)
          })
          this.forceUpdate()
        }
        clearInterval(checkInterval)
      }
    }, 1000)

    // Clear interval after 10 seconds to avoid memory leaks
    setTimeout(() => clearInterval(checkInterval), 10000)
  }

  get showButtons() {
    return this.plugin.config.get(ShowButtons)
  }

  render() {
    const VPControls =
      this.plugin.spec.components?.viewport?.controls || ViewportControls

    return (
      <>
        <Viewport />
        {this.showButtons && (
          <div className="msp-viewport-top-left-controls">
            <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.structurePreset}>Structure</Button>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.illustrativePreset}>Illustrative</Button>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.surfacePreset}>Surface</Button>
            </div>
            {/* Ensemble toggle buttons */}
            {(() => {
              const availableEnsembles = this.getAvailableEnsembles()
              console.log(
                'DEBUG: Render - available ensembles:',
                availableEnsembles
              )
              return availableEnsembles.length > 0
            })() && (
              <div
                style={{
                  borderTop: '1px solid #ccc',
                  paddingTop: '8px',
                  marginTop: '8px'
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    marginBottom: '4px',
                    color: '#666'
                  }}
                >
                  Ensembles:
                </div>
                {this.getAvailableEnsembles().map((size) => {
                  const ensembleKey = `ensemble_size_${size}`
                  const isVisible = this.state.visibleEnsembles.has(ensembleKey)
                  return (
                    <div
                      key={size}
                      style={{ marginBottom: '2px' }}
                    >
                      <Button
                        onClick={() => this.toggleEnsemble(size)}
                        style={{
                          backgroundColor: isVisible ? '#28a745' : '#6c757d',
                          color: 'white',
                          fontSize: '11px',
                          padding: '2px 8px',
                          minWidth: '60px'
                        }}
                        title={
                          isVisible
                            ? `Hide ensemble size ${size}`
                            : `Show ensemble size ${size}`
                        }
                      >
                        {isVisible ? '\u25CF' : '\u25CB'} {size}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
            {/* <div style={{ marginBottom: '4px' }}>
                    <Button onClick={this.pocketPreset}>Pocket</Button>
                </div> */}
            {/* <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.interactionsPreset}>Interactions</Button>
            </div> */}
          </div>
        )}
        <VPControls />
        <BackgroundTaskProgress />
        <div className="msp-highlight-toast-wrapper">
          <LociLabels />
          <Toasts />
        </div>
      </>
    )
  }
}
