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
    // Only apply preset to visible structures based on our ensemble visibility state
    const allStructures =
      this.plugin.managers.structure.hierarchy.selection.structures
    const visibleStructures = allStructures.filter((structure) => {
      if (window.molstarEnsembleInfo) {
        const ensembleInfo = window.molstarEnsembleInfo.get(
          structure.cell.transform.ref
        )
        if (ensembleInfo) {
          const ensembleKey = `ensemble_size_${ensembleInfo.ensembleSize}`
          return this.state.visibleEnsembles.has(ensembleKey)
        }
      }
      // If no ensemble info, assume it should be visible (for non-ensemble structures)
      return true
    })

    await this._set(visibleStructures, preset)
  }

  structurePreset = () => this.set(StructurePreset)
  illustrativePreset = () => this.set(IllustrativePreset)
  surfacePreset = () => this.set(SurfacePreset)
  pocketPreset = () => this.set(PocketPreset)
  interactionsPreset = () => this.set(InteractionsPreset)

  toggleEnsemble = async (ensembleSize: number) => {
    const ensembleKey = `ensemble_size_${ensembleSize}`
    const isCurrentlyVisible = this.state.visibleEnsembles.has(ensembleKey)

    console.log(
      `DEBUG: Toggling ensemble ${ensembleSize}, currently tracked as visible: ${isCurrentlyVisible}`
    )

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
          console.log(
            `DEBUG: Found structure for ensemble ${ensembleSize}, ref: ${structure.cell.transform.ref}`
          )

          // Always toggle - let Molstar handle the actual visibility state
          await PluginCommands.State.ToggleVisibility(this.plugin, {
            state,
            ref: structure.cell.transform.ref
          }).catch((e) => console.warn('Failed to toggle visibility:', e))

          // Also toggle child components (representations)
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

    // Update local state - simply flip the current state
    if (isCurrentlyVisible) {
      this.state.visibleEnsembles.delete(ensembleKey)
      console.log(`DEBUG: Removed ${ensembleKey} from visible set`)
    } else {
      this.state.visibleEnsembles.add(ensembleKey)
      console.log(`DEBUG: Added ${ensembleKey} to visible set`)
    }

    console.log(
      `DEBUG: Visible ensembles after toggle:`,
      Array.from(this.state.visibleEnsembles)
    )
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

  // Initialize ensemble visibility when component mounts
  componentDidMount() {
    console.log('DEBUG: ViewportComponent mounted')

    // Set up a single listener for when structures are loaded
    this.plugin.managers.structure.hierarchy.behaviors.selection.subscribe(
      async () => {
        console.log('DEBUG: Structure hierarchy changed')
        await this.initializeEnsembleVisibility()
      }
    )

    // Also try immediate initialization in case structures are already loaded
    setTimeout(() => this.initializeEnsembleVisibility(), 100)
  }

  initializeEnsembleVisibility = async () => {
    const available = this.getAvailableEnsembles()
    console.log('DEBUG: Available ensembles:', available)

    if (available.length > 0 && this.state.visibleEnsembles.size === 0) {
      console.log('DEBUG: Initializing ensemble visibility...')

      // Initialize only the first (smallest) ensemble as visible
      const firstEnsemble = available[0] // available is already sorted
      this.state.visibleEnsembles.clear()
      this.state.visibleEnsembles.add(`ensemble_size_${firstEnsemble}`)

      // Hide all other ensembles
      const state = this.plugin.state.data
      const structures =
        this.plugin.managers.structure.hierarchy.current.structures

      console.log(
        `DEBUG: Will keep ensemble ${firstEnsemble} visible, hiding others`
      )

      if (window.molstarEnsembleInfo) {
        for (const structure of structures) {
          const ensembleInfo = window.molstarEnsembleInfo.get(
            structure.cell.transform.ref
          )
          if (ensembleInfo && ensembleInfo.ensembleSize !== firstEnsemble) {
            // Check if structure is currently visible before toggling
            const isVisible =
              state.tree.transforms.get(structure.cell.transform.ref)?.state
                .isCollapsed === false
            console.log(
              `DEBUG: Ensemble ${ensembleInfo.ensembleSize} is currently visible: ${isVisible}`
            )

            if (isVisible) {
              console.log(`DEBUG: Hiding ensemble ${ensembleInfo.ensembleSize}`)
              await PluginCommands.State.ToggleVisibility(this.plugin, {
                state,
                ref: structure.cell.transform.ref
              }).catch((e) =>
                console.warn('Failed to hide initial ensemble:', e)
              )

              // Also hide child components
              const children = state.tree.children.get(
                structure.cell.transform.ref
              )
              if (children) {
                for (const childRef of children.values()) {
                  await PluginCommands.State.ToggleVisibility(this.plugin, {
                    state,
                    ref: childRef
                  }).catch((e) => console.warn('Failed to hide child:', e))
                }
              }
            }
          }
        }
      }

      console.log(
        'DEBUG: Initialized only first ensemble as visible:',
        this.state.visibleEnsembles
      )
      this.forceUpdate()
    }
  }

  componentWillUnmount() {
    // Clean up any remaining intervals
    console.log('DEBUG: ViewportComponent unmounting')
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
            {/* <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.structurePreset}>Structure</Button>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.illustrativePreset}>Illustrative</Button>
            </div>
            <div style={{ marginBottom: '4px' }}>
              <Button onClick={this.surfacePreset}>Surface</Button>
            </div> */}
            {/* Ensemble toggle buttons */}
            {(() => {
              const availableEnsembles = this.getAvailableEnsembles()
              console.log(
                'DEBUG: Render - available ensembles:',
                availableEnsembles,
                'visible:',
                Array.from(this.state.visibleEnsembles)
              )

              // If we have ensembles but no visible state, trigger initialization
              if (
                availableEnsembles.length > 0 &&
                this.state.visibleEnsembles.size === 0
              ) {
                console.log(
                  'DEBUG: Triggering delayed initialization from render'
                )
                // Use setTimeout to avoid React warning about state updates during render
                setTimeout(() => {
                  const firstEnsemble = availableEnsembles[0]
                  this.state.visibleEnsembles.add(
                    `ensemble_size_${firstEnsemble}`
                  )
                  this.forceUpdate()
                }, 0)
              }

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
                  Toggle Ensembles:
                </div>
                {this.getAvailableEnsembles().map((size) => {
                  const ensembleKey = `ensemble_size_${size}`
                  const isVisible = this.state.visibleEnsembles.has(ensembleKey)
                  console.log(
                    `DEBUG: Button render ${size} - tracked visible: ${isVisible}, visible set:`,
                    Array.from(this.state.visibleEnsembles)
                  )
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
