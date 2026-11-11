import { describe, it, expect, vi } from 'vitest'
import {
  chainIdCheck,
  pdbLineStartCheck,
  singleModelCheck,
  pdbOrCifResidueCheck,
  paeMatchesStructureCheck,
  constInpCheck
} from '../fieldTests'
import { mixed, object } from 'yup'

const makeFile = (name: string, content: string, type = 'text/plain') => {
  const blob = new Blob([content], { type })
  const file = new File([blob], name, { type })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  return file
}

describe('PDB validators', () => {
  it('chainIdCheck passes when chain IDs are present', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      containsChainId: async () => true
    }))
    const schema = chainIdCheck()
    const validPdb = makeFile('model.pdb', 'ATOM      1  N   MET A   1\nEND\n')
    await expect(schema.isValid(validPdb)).resolves.toBe(true)
  })

  it('chainIdCheck fails when missing chain IDs', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      containsChainId: async () => false
    }))
    const schema = chainIdCheck()
    const invalidPdb = makeFile(
      'model.pdb',
      'ATOM      1  N   MET     1\nEND\n'
    )
    await expect(schema.isValid(invalidPdb)).resolves.toBe(false)
  })

  it('pdbLineStartCheck passes when no leading spaces', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      noLeadingSpaceOnPDBLines: async () => true
    }))
    const schema = pdbLineStartCheck()
    const validPdb = makeFile('model.pdb', 'ATOM      1  N   MET A   1\nEND\n')
    await expect(schema.isValid(validPdb)).resolves.toBe(true)
  })

  it('pdbLineStartCheck fails when leading spaces present', async () => {
    vi.doMock('../../ValidationFunctions', () => ({
      noLeadingSpaceOnPDBLines: async () => false
    }))
    const schema = pdbLineStartCheck()
    const invalidPdb = makeFile(
      'model.pdb',
      ' ATOM      1  N   MET A   1\nEND\n'
    )
    await expect(schema.isValid(invalidPdb)).resolves.toBe(false)
  })

  it('singleModelCheck passes when no MODEL records present', async () => {
    const schema = singleModelCheck()
    const singleModel = makeFile(
      'model.pdb',
      'ATOM      1  N   MET A   1       1.000   2.000   3.000\nEND\n'
    )
    await expect(schema.isValid(singleModel)).resolves.toBe(true)
  })

  it('singleModelCheck passes when exactly one MODEL record present', async () => {
    const schema = singleModelCheck()
    const singleModel = makeFile(
      'model.pdb',
      'MODEL        1\nATOM      1  N   MET A   1       1.000   2.000   3.000\nENDMDL\nEND\n'
    )
    await expect(schema.isValid(singleModel)).resolves.toBe(true)
  })

  it('singleModelCheck fails when multiple MODEL records present', async () => {
    const schema = singleModelCheck()
    const multiModel = makeFile(
      'model.pdb',
      'MODEL        1\nATOM      1  N   MET A   1       1.000   2.000   3.000\nENDMDL\nMODEL        2\nATOM      1  N   MET A   1       4.000   5.000   6.000\nENDMDL\nEND\n'
    )
    await expect(schema.isValid(multiModel)).resolves.toBe(false)
  })

  it('singleModelCheck passes for a CIF file with one model', async () => {
    const schema = singleModelCheck()
    // In mmCIF, data rows are plain values (no ATOM prefix) aligned to column order
    const cifContent = [
      'loop_',
      '_atom_site.id',
      '_atom_site.auth_asym_id',
      '_atom_site.pdbx_PDB_model_num',
      '1 A 1',
      '2 A 1'
    ].join('\n')
    const singleCif = makeFile('model.cif', cifContent)
    await expect(schema.isValid(singleCif)).resolves.toBe(true)
  })

  it('singleModelCheck fails for a CIF file with multiple models', async () => {
    const schema = singleModelCheck()
    const cifContent = [
      'loop_',
      '_atom_site.id',
      '_atom_site.auth_asym_id',
      '_atom_site.pdbx_PDB_model_num',
      '1 A 1',
      '2 A 2'
    ].join('\n')
    const multiCif = makeFile('model.cif', cifContent)
    await expect(schema.isValid(multiCif)).resolves.toBe(false)
  })

  describe('pdbOrCifResidueCheck messages', () => {
    const atom = (residue: string, n: number) =>
      `ATOM      1  CA  ${residue.padEnd(3)} A${String(n).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`
    const message = async (...residues: string[]) => {
      const pdb = makeFile(
        'model.pdb',
        residues.map((r, i) => atom(r, i + 1)).join('\n')
      )
      try {
        await pdbOrCifResidueCheck().validate(pdb)
        return null
      } catch (e) {
        return (e as Error).message
      }
    }

    it('accepts supported residues', async () => {
      expect(await message('ALA', 'GLY')).toBeNull()
    })

    it('asks for uppercase names when that is the only problem', async () => {
      expect(await message('ALA', 'gly', 'Leu')).toBe(
        'Residue names must be uppercase (found: Leu, gly). Change them to uppercase, for example Leu to LEU.'
      )
    })

    it('lists residues that are not supported in any case', async () => {
      const result = await message('ALA', 'UNK')
      expect(result).toMatch(/^Unsupported residues found: UNK /)
      expect(result).not.toMatch(/uppercase/)
    })

    it('reports both problems together', async () => {
      const result = await message('gly', 'UNK')
      expect(result).toMatch(/^Unsupported residues found: UNK /)
      expect(result).toMatch(/Residue names must be uppercase \(found: gly\)/)
    })
  })

  describe('pdbOrCifResidueCheck shared residue numbers', () => {
    const atom = (residue: string, n: number, record = 'ATOM  ') =>
      `${record}    1  CA  ${residue.padEnd(3)} A${String(n).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`

    it('rejects a PDB where a sugar shares a protein residue number', async () => {
      const pdb = makeFile(
        'model.pdb',
        [atom('ASP', 215), atom('NAG', 215, 'HETATM')].join('\n')
      )
      await expect(pdbOrCifResidueCheck().validate(pdb)).rejects.toThrow(
        'PDB has residues that share a chain and residue number: chain A residue 215 (ASP and NAG).'
      )
    })

    it('accepts distinct residue numbers', async () => {
      const pdb = makeFile(
        'model.pdb',
        [atom('ASP', 215), atom('NAG', 401, 'HETATM')].join('\n')
      )
      await expect(pdbOrCifResidueCheck().isValid(pdb)).resolves.toBe(true)
    })
  })

  describe('paeMatchesStructureCheck', () => {
    const atom = (n: number) =>
      `ATOM      1  CA  ALA A${String(n).padStart(4)}       1.000   2.000   3.000  1.00  0.00           C`
    const structure = (residues: number) =>
      makeFile(
        'model.pdb',
        Array.from({ length: residues }, (_, i) => atom(i + 1)).join('\n')
      )
    const pae = (n: number) =>
      makeFile(
        'pae.json',
        JSON.stringify({
          pae: Array.from({ length: n }, () => Array<number>(n).fill(1))
        }),
        'application/json'
      )
    const schema = object({
      pdb_file: mixed(),
      pae_file: paeMatchesStructureCheck()
    })
    const check = (values: { pdb_file: unknown; pae_file: unknown }) =>
      schema.validateAt('pae_file', values).then(
        () => null,
        (e: Error) => e.message
      )

    it('accepts a PAE matrix that matches the residue count', async () => {
      expect(
        await check({ pdb_file: structure(3), pae_file: pae(3) })
      ).toBeNull()
    })

    it('reports a mismatch with both sizes', async () => {
      const message = await check({ pdb_file: structure(2), pae_file: pae(3) })
      expect(message).toContain('3 × 3')
      expect(message).toContain('2 residues')
    })

    it('reports a PAE file the worker would reject', async () => {
      const bad = makeFile('pae.json', '{"plddt": []}', 'application/json')
      expect(await check({ pdb_file: structure(2), pae_file: bad })).toMatch(
        /must contain a 'predicted_aligned_error'/
      )
    })

    it('leaves invalid JSON to jsonFileCheck', async () => {
      const bad = makeFile('pae.json', '{nope', 'application/json')
      expect(await check({ pdb_file: structure(2), pae_file: bad })).toBeNull()
    })

    it('skips files reused on resubmit, which are names, not Files', async () => {
      expect(
        await check({ pdb_file: 'model.pdb', pae_file: pae(3) })
      ).toBeNull()
      expect(
        await check({ pdb_file: structure(2), pae_file: 'pae.json' })
      ).toBeNull()
    })
  })

  describe('constInpCheck segment ID rule', () => {
    const inp = (segid: string) =>
      makeFile(
        'const.inp',
        [
          `define fixed1 sele ( resid 1:20 .and. segid ${segid} ) end`,
          'cons fix sele fixed1 end',
          'return'
        ].join('\n')
      )
    const PDB_RULE = 'segid must be: PRO[A-Z], DNA[A-Z], RNA[A-Z], etc.'

    it('uses the mode it is given', async () => {
      await expect(constInpCheck('pdb').validate(inp('ABCD'))).rejects.toThrow(
        PDB_RULE
      )
      await expect(constInpCheck('pdb').isValid(inp('PROA'))).resolves.toBe(
        true
      )
    })

    it("otherwise follows the form's bilbomd_mode", async () => {
      await expect(
        constInpCheck().validate(inp('ABCD'), {
          context: { bilbomd_mode: 'pdb' }
        })
      ).rejects.toThrow(PDB_RULE)
      await expect(
        constInpCheck().isValid(inp('ABCD'), {
          context: { bilbomd_mode: 'crd_psf' }
        })
      ).resolves.toBe(true)
    })
  })
})
