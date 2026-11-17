import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readConstInp, type ConstInpSelection } from '../../constInpParser.js'
import { importConstraintsFromConstInp } from '../fromConstInp.js'
import { validateConstraintsInput } from '../validate.js'
import { writeConstInp } from '../writeConstInp.js'
import type { ConstraintStructure, ConstraintsInput } from '../types.js'

// Opt-in: runs every const.inp under CONST_INP_CORPUS_DIR (real uploads, kept
// out of the repo) through import → validate → writeConstInp → re-read, and
// checks the regenerated file selects the same atoms. Files that can't be
// carried over are listed for review rather than failing the test.
//   CONST_INP_CORPUS_DIR=/path/to/uploads pnpm vitest --run constInpCorpus
const corpusDir = process.env.CONST_INP_CORPUS_DIR

const findFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return findFiles(full)
    return entry.name === 'const.inp' ? [full] : []
  })

// With no structure file at hand, build one from the file's own selections:
// each segid it names, with the residues it selects (one for a whole segment)
const structureFrom = (input: ConstraintsInput): ConstraintStructure => {
  const residues = new Map<string, Set<number>>()
  for (const body of [...input.fixed_bodies, ...(input.rigid_bodies ?? [])]) {
    for (const { segid, residues: range } of body.segments) {
      if (!segid) continue
      const set = residues.get(segid) ?? new Set<number>()
      if (range) {
        for (
          let r = range.start;
          r <= range.stop && r - range.start < 10000;
          r++
        ) {
          set.add(r)
        }
      } else set.add(1)
      residues.set(segid, set)
    }
  }
  return {
    mode: 'crd_psf',
    segments: [...residues].map(([segid, set]) => ({
      segid,
      chain_id: segid,
      residues: [...set].sort((a, b) => a - b)
    }))
  }
}

// Atoms a set of selections picks, as comparable strings; a whole segment is
// written as "SEGID:*"
const selected = (selections: ConstInpSelection[]): string[] =>
  [
    ...new Set(
      selections.flatMap(({ segid, residues }) => {
        const id = segid.toUpperCase()
        if (!residues) return [`${id}:*`]
        return Array.from(
          { length: residues.stop - residues.start + 1 },
          (_, i) => `${id}:${residues.start + i}`
        )
      })
    )
  ].sort()

describe.skipIf(!corpusDir)('const.inp corpus', () => {
  it('regenerates every usable file with the same selections', () => {
    const files = findFiles(corpusDir as string)
    const outcome = {
      same: [] as string[],
      needsFixedChoice: [] as string[],
      notImportable: [] as string[],
      invalid: [] as string[],
      changed: [] as string[]
    }

    for (const file of files) {
      const name = path.relative(corpusDir as string, file)
      const text = fs.readFileSync(file, 'utf8')
      const imported = importConstraintsFromConstInp(text, 'crd_psf')
      if (imported.fixed_choices.length > 1) {
        outcome.needsFixedChoice.push(name)
        continue
      }
      if (!imported.input || imported.problems.length > 0) {
        outcome.notImportable.push(`${name}: ${imported.problems.join(' | ')}`)
        continue
      }
      const result = validateConstraintsInput(
        imported.input,
        structureFrom(imported.input)
      )
      if (!result.ok) {
        outcome.invalid.push(
          `${name}: ${result.errors.map((e) => e.message).join(' | ')}`
        )
        continue
      }

      const before = readConstInp(text)
      const after = readConstInp(writeConstInp(result.constraints))
      const fixedSame =
        JSON.stringify(
          selected(before.fixed_bodies.flatMap((b) => b.selections))
        ) ===
        JSON.stringify(
          selected(after.fixed_bodies.flatMap((b) => b.selections))
        )
      const rigidKey = (r: typeof before) =>
        JSON.stringify(r.rigid_bodies.map((b) => selected(b.selections)))
      if (fixedSame && rigidKey(before) === rigidKey(after)) {
        outcome.same.push(name)
      } else {
        outcome.changed.push(name)
      }
    }

    console.log(
      `const.inp corpus: ${files.length} files\n` +
        `  same selections:     ${outcome.same.length}\n` +
        `  needs a fixed choice: ${outcome.needsFixedChoice.length}\n` +
        `  not importable:      ${outcome.notImportable.length}\n` +
        `  invalid:             ${outcome.invalid.length}\n` +
        `  CHANGED:             ${outcome.changed.length}\n\n` +
        ['needsFixedChoice', 'notImportable', 'invalid', 'changed']
          .map(
            (key) =>
              `--- ${key}\n` +
              outcome[key as keyof typeof outcome]
                .map((l) => `  ${l}`)
                .join('\n')
          )
          .join('\n')
    )
    // A file that imports and validates must regenerate to the same atoms
    expect(outcome.changed).toEqual([])
  })
})
