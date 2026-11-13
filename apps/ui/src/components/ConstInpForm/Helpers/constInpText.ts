import { wrapConstInpCommand } from '@bilbomd/bilbomd-types'
import type { Chain, RigidBody } from 'types/interfaces'

/**
 * The segid the Inp Jiffy writes for a chain: its molecule type then its chain
 * ID. A lowercase chain ID is uppercased and the type's last letter becomes
 * 'L' (PRO → PRL), so 'a' and 'A' stay apart.
 */
export const jiffySegid = (chainId: string, chains: Chain[]): string => {
  const chain = chains.find((c) => c.id === chainId)
  let chainType = (chain ? chain.type : '').toUpperCase()
  let id = chainId
  if (id.toLowerCase() === id) {
    chainType = chainType.slice(0, -1) + 'L'
    id = id.toUpperCase()
  }
  return chainType + id
}

/**
 * The const.inp text for the jiffy's bodies. PRIMARY becomes one 'cons fix'
 * over fixed1, fixed2, …; every other body becomes a 'shape desc dockN rigid'.
 * CHARMM cuts lines over 200 characters short, so long commands are continued
 * over several lines ending in ' -'.
 */
export const buildConstInp = (
  rigidBodies: RigidBody[],
  chains: Chain[]
): string => {
  const contentArray: string[] = []
  const push = (line: string) => contentArray.push(...wrapConstInpCommand(line))
  let dockCount = 1
  let rigidCount = 1
  // "a .or. b " – empty for a body with no segments, as before
  const selection = (names: string[]) =>
    names.map((name) => `${name} `).join('.or. ')

  rigidBodies.forEach((rb) => {
    const names: string[] = []
    if (rb.id === 'PRIMARY') {
      rb.domains.forEach(({ chainid, start, end }, index) => {
        const name = `fixed${index + 1}`
        push(
          `define ${name} sele ( resid ${start}:${end} .and. segid ${jiffySegid(chainid, chains)} ) end`
        )
        names.push(name)
      })
      push(`cons fix sele ${selection(names)}end`)
    } else {
      rb.domains.forEach(({ chainid, start, end }) => {
        const name = `rigid${rigidCount}`
        push(
          `define ${name} sele ( resid ${start}:${end} .and. segid ${jiffySegid(chainid, chains)} ) end`
        )
        names.push(name)
        rigidCount++
      })
      push(`shape desc dock${dockCount} rigid sele ${selection(names)}end`)
      dockCount++
    }
    contentArray.push(' ')
  })

  contentArray.push('return')
  return contentArray.join('\n')
}
