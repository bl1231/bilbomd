import { stringify } from 'yaml'

/**
 * One set of constraints as both kinds of file, for the jiffy's instructions:
 * a fixed body over chains A and B, and two rigid bodies.
 */
export const EXAMPLE_CONST_INP = [
  'define fixed1 sele ( resid 159:414 .and. segid PROA ) end',
  'define fixed2 sele ( resid 94:563 .and. segid PROB ) end',
  'cons fix sele fixed1 .or. fixed2 end',
  '',
  'define rigid1 sele ( resid 8:155 .and. segid PROA ) end',
  'shape desc dock1 rigid sele rigid1 end',
  '',
  'define rigid2 sele ( resid 51:79 .and. segid PROB ) end',
  'shape desc dock2 rigid sele rigid2 end',
  '',
  'return'
].join('\n')

const segment = (chain_id: string, start: number, stop: number) => ({
  chain_id,
  residues: { start, stop }
})

// Written the way BilboMD writes openmm_const.yml for an OpenMM job
export const EXAMPLE_OPENMM_YAML = stringify(
  {
    constraints: {
      fixed_bodies: [
        {
          name: 'FixedBody1',
          segments: [segment('A', 159, 414), segment('B', 94, 563)]
        }
      ],
      rigid_bodies: [
        { name: 'RigidBody1', segments: [segment('A', 8, 155)] },
        { name: 'RigidBody2', segments: [segment('B', 51, 79)] }
      ]
    }
  },
  { indent: 2, lineWidth: 0 }
)
