/**
 * Copyright (c) 2020-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { StructureRepresentationPresetProvider } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset'
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state'
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base'
import { LociLabels } from 'molstar/lib/mol-plugin-ui/controls'
import { Button } from 'molstar/lib/mol-plugin-ui/controls/common'
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task'
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast'
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport'
import {
  StructurePreset,
  IllustrativePreset,
  SurfacePreset,
  PocketPreset,
  InteractionsPreset,
  ShowButtons
} from './presets'

export class ViewportComponent extends PluginUIComponent {
  async _set(
    structures: readonly StructureRef[],
    preset: StructureRepresentationPresetProvider
  ) {
    await this.plugin.managers.structure.component.clear(structures)
    await this.plugin.managers.structure.component.applyPreset(structures, preset)
    const reapply = (
      this.plugin.customState as Record<string, unknown>
    ).reapplyVisibility
    if (typeof reapply === 'function') reapply()
  }

  set = async (preset: StructureRepresentationPresetProvider) => {
    await this._set(this.plugin.managers.structure.hierarchy.selection.structures, preset)
  }

  structurePreset = () => this.set(StructurePreset)
  illustrativePreset = () => this.set(IllustrativePreset)
  surfacePreset = () => this.set(SurfacePreset)
  pocketPreset = () => this.set(PocketPreset)
  interactionsPreset = () => this.set(InteractionsPreset)

  get showButtons() {
    return this.plugin.config.get(ShowButtons)
  }

  render() {
    const VPControls = this.plugin.spec.components?.viewport?.controls || ViewportControls

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
