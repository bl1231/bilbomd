import { screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import Preferences from '../Preferences'
import { renderWithProviders } from 'test/test-utils'
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation
} from '../../../slices/userAccountApiSlice'

vi.mock('../../../slices/userAccountApiSlice')

const updatePreferences = vi.fn()

const mockHooks = (
  query: Partial<ReturnType<typeof useGetPreferencesQuery>>,
  mutation: { isLoading?: boolean; isError?: boolean } = {}
) => {
  ;(useGetPreferencesQuery as Mock).mockReturnValue(query)
  ;(useUpdatePreferencesMutation as Mock).mockReturnValue([
    updatePreferences,
    mutation
  ])
}

beforeEach(() => vi.clearAllMocks())

describe('Preferences', () => {
  it('shows the saved job email setting', () => {
    mockHooks({ data: { emailNotifications: false } })
    renderWithProviders(<Preferences />)

    expect(
      screen.getByRole('switch', {
        name: 'Email me when my jobs complete or fail'
      })
    ).not.toBeChecked()
  })

  it('saves the new setting when toggled', () => {
    mockHooks({ data: { emailNotifications: true } })
    renderWithProviders(<Preferences />)

    fireEvent.click(screen.getByRole('switch'))

    expect(updatePreferences).toHaveBeenCalledWith({
      emailNotifications: false
    })
  })

  it('explains that account emails are always sent', () => {
    mockHooks({ data: { emailNotifications: true } })
    renderWithProviders(<Preferences />)

    expect(
      screen.getByText(/sign-in codes, magic links, and account changes/i)
    ).toBeInTheDocument()
  })

  it('shows an error when preferences cannot be loaded', () => {
    mockHooks({ isError: true })
    renderWithProviders(<Preferences />)

    expect(
      screen.getByText('Could not load your preferences.')
    ).toBeInTheDocument()
  })

  it('shows an error when saving fails', () => {
    mockHooks({ data: { emailNotifications: true } }, { isError: true })
    renderWithProviders(<Preferences />)

    expect(
      screen.getByText('Could not save your preference. Please try again.')
    ).toBeInTheDocument()
  })
})
