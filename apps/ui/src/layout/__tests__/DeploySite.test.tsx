import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DeploySite from '../DeploySite'

describe('DeploySite', () => {
  it('shows the NERSC logo on NERSC', () => {
    render(<DeploySite deploySite="nersc" />)
    expect(screen.getByAltText('NERSC Logo')).toBeInTheDocument()
    expect(screen.queryByAltText('Berkelium Logo')).not.toBeInTheDocument()
  })

  it('shows the Berkelium logo and name on Berkelium', () => {
    render(<DeploySite deploySite="berkelium" />)
    const logo = screen.getByAltText('Berkelium Logo')
    expect(logo).toHaveStyle({ height: '24px', width: '24px' })
    expect(screen.getByText('BERKELIUM')).toBeInTheDocument()
    expect(screen.queryByAltText('NERSC Logo')).not.toBeInTheDocument()
  })

  it('labels the beamline and local deployments with text', () => {
    const { rerender } = render(<DeploySite deploySite="bl1231" />)
    expect(screen.getByText('BL12.3.1')).toBeInTheDocument()
    rerender(<DeploySite deploySite="local" />)
    expect(screen.getByText('LOCAL')).toBeInTheDocument()
  })

  it('shows nothing for an unknown or empty site', () => {
    const { container } = render(<DeploySite deploySite="" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('')
  })
})
