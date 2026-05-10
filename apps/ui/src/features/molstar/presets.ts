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
import { PluginCommands } from 'molstar/lib/mol-plugin/commands'
import { PluginConfig } from 'molstar/lib/mol-plugin/config'
import { PluginContext } from 'molstar/lib/mol-plugin/context'
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder'
import { StateObjectRef } from 'molstar/lib/mol-state'
import { Color } from 'molstar/lib/mol-util/color'
import { Material } from 'molstar/lib/mol-util/material'
import type { MDConstraintsDTO } from '@bilbomd/bilbomd-types'

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
  'Surrounding Residues (5 Å) of Ligand plus Ligand itself',
  MS.struct.modifier.union([
    MS.struct.modifier.includeSurroundings({
      0: StructureSelectionQueries.ligand.expression,
      radius: 5,
      'as-whole-residues': true
    })
  ])
)

const ligandSurroundings = StructureSelectionQuery(
  'Surrounding Residues (5 Å) of Ligand',
  MS.struct.modifier.union([
    MS.struct.modifier.exceptBy({
      0: ligandPlusSurroundings.expression,
      by: StructureSelectionQueries.ligand.expression
    })
  ])
)

// Selects nucleic acid residues by residue name, covering standard PDB names
// and CHARMM non-standard names so that DNA/RNA is always rendered consistently.
const nucleicResidueQuery = StructureSelectionQuery(
  'Nucleic acid residues',
  MS.struct.modifier.union([
    MS.struct.generator.atomGroups({
      'residue-test': MS.core.set.has([
        MS.set(
          'DA', 'DT', 'DG', 'DC', 'DU', // standard DNA
          'A', 'G', 'C', 'T', 'U', // standard RNA
          'ADE', 'GUA', 'CYT', 'THY', 'URA' // CHARMM residue names
        ),
        MS.ammp('label_comp_id')
      ])
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
      protein: await presetStaticComponent(plugin, structureCell, 'protein'),
      nucleic: await plugin.builders.structure.tryCreateComponentFromSelection(
        structureCell,
        nucleicResidueQuery,
        'nucleic'
      ),
      ions: await presetStaticComponent(plugin, structureCell, 'ion'),
      branched: await presetStaticComponent(plugin, structureCell, 'branched')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.35 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      ),
      protein: builder.buildRepresentation(
        update,
        components.protein,
        {
          type: 'cartoon',
          typeParams: { ...typeParams, material: CustomMaterial },
          color: 'structure-index',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorParams: { palette: (plugin.customState as any).colorPalette }
        },
        { tag: 'protein' }
      ),
      nucleic: builder.buildRepresentation(
        update,
        components.nucleic,
        {
          type: 'cartoon',
          typeParams: { ...typeParams, material: CustomMaterial },
          color: 'structure-index',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorParams: { palette: (plugin.customState as any).colorPalette }
        },
        { tag: 'nucleic' }
      ),
      ions: builder.buildRepresentation(
        update,
        components.ions,
        {
          type: 'spacefill',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 1.0 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      ),
      branched: builder.buildRepresentation(
        update,
        components.branched,
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.35 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'branched' }
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
      ions: await presetStaticComponent(plugin, structureCell, 'ion'),
      branched: await presetStaticComponent(plugin, structureCell, 'branched')
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
      ),
      branched: builder.buildRepresentation(
        update,
        components.branched,
        {
          type: 'spacefill',
          typeParams: { ...typeParams, ignoreLight: true },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'branched' }
      )
    }

    await update.commit({ revertOnError: true })
    await occlusionStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'residue' })

    return { components, representations }
  }
})

export const SurfacePreset = StructureRepresentationPresetProvider({
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
      ions: await presetStaticComponent(plugin, structureCell, 'ion'),
      branched: await presetStaticComponent(plugin, structureCell, 'branched')
    }

    const { update, builder, typeParams } =
      StructureRepresentationPresetProvider.reprBuilder(plugin, params)
    const representations = {
      ligand: builder.buildRepresentation(
        update,
        components.ligand,
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.26 },
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
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 1.0 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      ),
      branched: builder.buildRepresentation(
        update,
        components.branched,
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.35 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'branched' }
      )
    }

    await update.commit({ revertOnError: true })
    await shinyStyle(plugin)
    plugin.managers.interactivity.setProps({ granularity: 'residue' })

    return { components, representations }
  }
})

export const PocketPreset = StructureRepresentationPresetProvider({
  id: 'preset-pocket',
  display: { name: 'Pocket' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    const structure = structureCell?.obj?.data
    if (!structureCell || !structure) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      surroundings: await plugin.builders.structure.tryCreateComponentFromSelection(
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
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.26 },
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

export const InteractionsPreset = StructureRepresentationPresetProvider({
  id: 'preset-interactions',
  display: { name: 'Interactions' },
  params: () => PresetParams,
  async apply(ref, params, plugin) {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
    const structure = structureCell?.obj?.data
    if (!structureCell || !structure) return {}

    const components = {
      ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
      surroundings: await plugin.builders.structure.tryCreateComponentFromSelection(
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
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.3 },
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

// Colors matching MDConstraintsRenderer
const FIXED_COLOR = Color(0x2f54eb)
const RIGID_COLOR = Color(0xfa8c16)

const buildSegmentExpression = (chainId: string, start: number, stop: number) =>
  MS.struct.generator.atomGroups({
    'chain-test': MS.core.rel.eq([MS.ammp('auth_asym_id'), chainId]),
    'residue-test': MS.core.logic.and([
      MS.core.rel.gre([MS.ammp('auth_seq_id'), start]),
      MS.core.rel.lte([MS.ammp('auth_seq_id'), stop])
    ])
  })

export const createDomainColorPreset = (constraints: MDConstraintsDTO) =>
  StructureRepresentationPresetProvider({
    id: 'preset-domain-color',
    display: { name: 'Domain Color' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {
      const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref)
      if (!structureCell) return {}

      // Get typeParams/builder before component creation; update must be created
      // AFTER all components are committed — reprBuilder captures the state tree
      // as an immutable snapshot, so any component created after that point
      // won't be findable via update.to(comp).
      const { builder, typeParams } =
        StructureRepresentationPresetProvider.reprBuilder(plugin, params)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const components: Record<string, any> = {}
      const allDomainExpressions: ReturnType<typeof buildSegmentExpression>[] = []

      // Fixed bodies — blue
      for (const body of constraints.fixed_bodies ?? []) {
        for (const seg of body.segments ?? []) {
          const expr = buildSegmentExpression(
            seg.chain_id,
            seg.residues.start,
            seg.residues.stop
          )
          allDomainExpressions.push(expr)
          const tag = `fixed-${body.name}-${seg.chain_id}-${seg.residues.start}`
          const q = StructureSelectionQuery(
            tag,
            MS.struct.modifier.union([expr])
          )
          components[tag] = await plugin.builders.structure.tryCreateComponentFromSelection(
            structureCell,
            q,
            tag
          )
        }
      }

      // Rigid bodies — orange
      for (const body of constraints.rigid_bodies ?? []) {
        for (const seg of body.segments ?? []) {
          const expr = buildSegmentExpression(
            seg.chain_id,
            seg.residues.start,
            seg.residues.stop
          )
          allDomainExpressions.push(expr)
          const tag = `rigid-${body.name}-${seg.chain_id}-${seg.residues.start}`
          const q = StructureSelectionQuery(
            tag,
            MS.struct.modifier.union([expr])
          )
          components[tag] = await plugin.builders.structure.tryCreateComponentFromSelection(
            structureCell,
            q,
            tag
          )
        }
      }

      // Flexible — everything in polymer not covered by a domain segment.
      // Note: CHARMM DNA classified by Molstar as 'branched' rather than
      // 'polymer' will not appear here; that is a known limitation of the
      // residue-classification fix in StructurePreset (see nucleicResidueQuery).
      const flexExpr =
        allDomainExpressions.length > 0
          ? MS.struct.modifier.exceptBy({
              0: StructureSelectionQueries.polymer.expression,
              by: MS.struct.modifier.union(allDomainExpressions)
            })
          : StructureSelectionQueries.polymer.expression

      const flexQ = StructureSelectionQuery('flexible', flexExpr)
      components['flexible'] =
        await plugin.builders.structure.tryCreateComponentFromSelection(
          structureCell,
          flexQ,
          'flexible'
        )

      // Standard non-polymer components
      components['ligand'] = await presetStaticComponent(plugin, structureCell, 'ligand')
      components['ions'] = await presetStaticComponent(plugin, structureCell, 'ion')
      components['branched'] = await presetStaticComponent(plugin, structureCell, 'branched')

      // All components are now committed to the live state tree.
      // Create the update builder NOW so its snapshot includes them all.
      const update = plugin.state.data.build()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const representations: Record<string, any> = {}

      // Fixed body representations — blue
      for (const body of constraints.fixed_bodies ?? []) {
        for (const seg of body.segments ?? []) {
          const tag = `fixed-${body.name}-${seg.chain_id}-${seg.residues.start}`
          representations[tag] = builder.buildRepresentation(
            update,
            components[tag],
            {
              type: 'cartoon',
              typeParams: { ...typeParams, material: CustomMaterial },
              color: 'uniform',
              colorParams: { value: FIXED_COLOR }
            },
            { tag }
          )
        }
      }

      // Rigid body representations — orange
      for (const body of constraints.rigid_bodies ?? []) {
        for (const seg of body.segments ?? []) {
          const tag = `rigid-${body.name}-${seg.chain_id}-${seg.residues.start}`
          representations[tag] = builder.buildRepresentation(
            update,
            components[tag],
            {
              type: 'cartoon',
              typeParams: { ...typeParams, material: CustomMaterial },
              color: 'uniform',
              colorParams: { value: RIGID_COLOR }
            },
            { tag }
          )
        }
      }

      representations['flexible'] = builder.buildRepresentation(
        update,
        components['flexible'],
        {
          type: 'cartoon',
          typeParams: { ...typeParams, material: CustomMaterial },
          color: 'structure-index',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorParams: { palette: (plugin.customState as any).colorPalette }
        },
        { tag: 'flexible' }
      )
      representations['ligand'] = builder.buildRepresentation(
        update,
        components['ligand'],
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.35 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ligand' }
      )
      representations['ions'] = builder.buildRepresentation(
        update,
        components['ions'],
        {
          type: 'spacefill',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 1.0 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'ions' }
      )
      representations['branched'] = builder.buildRepresentation(
        update,
        components['branched'],
        {
          type: 'ball-and-stick',
          typeParams: { ...typeParams, material: CustomMaterial, sizeFactor: 0.35 },
          color: 'element-symbol',
          colorParams: { carbonColor: { name: 'element-symbol', params: {} } }
        },
        { tag: 'branched' }
      )

      await update.commit({ revertOnError: true })
      await shinyStyle(plugin)
      plugin.managers.interactivity.setProps({ granularity: 'residue' })

      return { components, representations }
    }
  })
