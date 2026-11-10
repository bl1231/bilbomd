import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobSequences from '../JobSequences'
import { toFasta } from '../sequenceFormat'

const short = {
  name: 'pro-1',
  sequence: 'MERKISRIHLVSEPS',
  type: 'Protein',
  copies: 2
}
const long = {
  name: 'pro-2',
  sequence: 'ACDEFGHIKL'.repeat(20),
  type: 'Protein',
  copies: 1
}
const dna = { name: 'dna-1', sequence: 'ACGTACGT', type: 'DNA', copies: 1 }

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true
  })
})

// The sequence text of one entity card, without the position labels
const shownSequence = (card: HTMLElement): string =>
  Array.from(card.querySelectorAll('span > span:not([aria-hidden])'))
    .map((el) => el.textContent)
    .join('')

describe('JobSequences', () => {
  it('lists each entity with its type, copies and length', () => {
    renderWithProviders(<JobSequences entities={[short, dna]} />)
    const [first, second, ...rest] = screen.getAllByTestId('sequence-entity')
    if (!first || !second) throw new Error('expected two entity cards')
    expect(rest).toHaveLength(0)
    expect(within(first).getByText('pro-1')).toBeInTheDocument()
    expect(
      within(first).getByText('Protein · 2 copies · 15 residues')
    ).toBeInTheDocument()
    expect(
      within(second).getByText('DNA · 1 copy · 8 nucleotides')
    ).toBeInTheDocument()
    expect(shownSequence(first)).toBe(short.sequence)
  })

  it('shows the total size counting copies', () => {
    renderWithProviders(<JobSequences entities={[short, dna]} />)
    expect(
      screen.getByText(/Total size: 38 residues and nucleotides/)
    ).toBeInTheDocument()
  })

  it('collapses long sequences until asked for all of it', () => {
    renderWithProviders(<JobSequences entities={[long]} />)
    const card = screen.getByTestId('sequence-entity')
    expect(shownSequence(card)).toBe(long.sequence.slice(0, 60))

    fireEvent.click(screen.getByRole('button', { name: 'Show all 200' }))
    expect(shownSequence(card)).toBe(long.sequence)

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(shownSequence(card)).toBe(long.sequence.slice(0, 60))
  })

  it('has no toggle for short sequences', () => {
    renderWithProviders(<JobSequences entities={[short]} />)
    expect(
      screen.queryByRole('button', { name: /show all/i })
    ).not.toBeInTheDocument()
  })

  it('copies the whole sequence even while collapsed', () => {
    renderWithProviders(<JobSequences entities={[long]} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy the pro-2 sequence' })
    )
    expect(writeText).toHaveBeenCalledWith(long.sequence)
  })

  it('copies every entity as FASTA', () => {
    renderWithProviders(<JobSequences entities={[short, long, dna]} />)
    fireEvent.click(screen.getByRole('button', { name: /copy as fasta/i }))
    expect(writeText).toHaveBeenCalledWith(toFasta([short, long, dna]))
  })

  it('renders nothing without entities', () => {
    renderWithProviders(<JobSequences entities={[]} />)
    expect(screen.queryByText('Sequences:')).not.toBeInTheDocument()
  })
})
