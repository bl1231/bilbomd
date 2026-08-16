import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MobileControlsShield from '../MobileControlsShield'

const onEnable = vi.fn()
const onDisable = vi.fn()

describe('MobileControlsShield', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the tap-to-enable overlay when controls are disabled', () => {
    render(
      <MobileControlsShield
        enabled={false}
        onEnable={onEnable}
        onDisable={onDisable}
      />
    )
    expect(screen.getByText('Tap to enable 3D controls')).toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('calls onEnable when the overlay is tapped', () => {
    render(
      <MobileControlsShield
        enabled={false}
        onEnable={onEnable}
        onDisable={onDisable}
      />
    )
    fireEvent.click(screen.getByText('Tap to enable 3D controls'))
    expect(onEnable).toHaveBeenCalledTimes(1)
  })

  it('shows only the Done chip when controls are enabled', () => {
    render(
      <MobileControlsShield
        enabled={true}
        onEnable={onEnable}
        onDisable={onDisable}
      />
    )
    expect(
      screen.queryByText('Tap to enable 3D controls')
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Done'))
    expect(onDisable).toHaveBeenCalledTimes(1)
  })
})
