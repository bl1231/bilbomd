import { describe, it, expect } from 'vitest'
import { parseCifAtomSite } from '../cifUtils.js'

const header = [
  'data_x',
  '#',
  'loop_',
  '_atom_site.group_PDB',
  '_atom_site.label_atom_id',
  '_atom_site.auth_seq_id',
  '_atom_site.auth_asym_id'
]
const cif = (...rows: string[]) => [...header, ...rows].join('\n')

describe('parseCifAtomSite', () => {
  it('reads one record per line', () => {
    expect(parseCifAtomSite(cif('ATOM N 1 A', 'ATOM CA 1 A'))).toEqual({
      columnNames: [
        'group_PDB',
        'label_atom_id',
        'auth_seq_id',
        'auth_asym_id'
      ],
      dataRows: [
        ['ATOM', 'N', '1', 'A'],
        ['ATOM', 'CA', '1', 'A']
      ]
    })
  })

  it('reads several records on one line', () => {
    expect(parseCifAtomSite(cif('ATOM CA 1 A ATOM CA 2 A'))?.dataRows).toEqual([
      ['ATOM', 'CA', '1', 'A'],
      ['ATOM', 'CA', '2', 'A']
    ])
  })

  it('reads a record wrapped across lines', () => {
    expect(
      parseCifAtomSite(cif('ATOM CA', '1 A', 'ATOM', 'CA 2 A'))?.dataRows
    ).toEqual([
      ['ATOM', 'CA', '1', 'A'],
      ['ATOM', 'CA', '2', 'A']
    ])
  })

  it('unquotes values, including ones with spaces or inner quotes', () => {
    expect(
      parseCifAtomSite(cif(`HETATM "O5'" 1 A`, `HETATM 'C 1' 2 'B'`))?.dataRows
    ).toEqual([
      ['HETATM', "O5'", '1', 'A'],
      ['HETATM', 'C 1', '2', 'B']
    ])
  })

  it('keeps a quote inside an unquoted value', () => {
    expect(parseCifAtomSite(cif(`HETATM O5' 1 A`))?.dataRows).toEqual([
      ['HETATM', "O5'", '1', 'A']
    ])
  })

  it('reads semicolon text fields as one value', () => {
    expect(
      parseCifAtomSite(cif('ATOM', ';long', 'name', ';', '1 A'))?.dataRows
    ).toEqual([['ATOM', 'long\nname', '1', 'A']])
  })

  it('skips comments', () => {
    expect(
      parseCifAtomSite(cif('# first atom', 'ATOM CA 1 A # trailing'))?.dataRows
    ).toEqual([['ATOM', 'CA', '1', 'A']])
  })

  it('stops at the next category', () => {
    const text = cif('ATOM CA 1 A', '#', 'loop_', '_atom_type.symbol', 'C', 'N')
    expect(parseCifAtomSite(text)?.dataRows).toEqual([['ATOM', 'CA', '1', 'A']])
  })

  it('drops a trailing partial record', () => {
    expect(parseCifAtomSite(cif('ATOM CA 1 A ATOM CA'))?.dataRows).toEqual([
      ['ATOM', 'CA', '1', 'A']
    ])
  })

  it('finds the _atom_site loop after other loops', () => {
    const text = [
      'data_x',
      'loop_',
      '_entity.id',
      '1',
      ...header.slice(2),
      'ATOM CA 1 A'
    ].join('\n')
    expect(parseCifAtomSite(text)?.dataRows).toEqual([['ATOM', 'CA', '1', 'A']])
  })

  it('returns null without an _atom_site loop', () => {
    expect(parseCifAtomSite('data_x\n_cell.length_a 10\n')).toBeNull()
  })
})
