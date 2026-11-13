import { parseConstInp, type MDConstraintsDTO } from '@bilbomd/bilbomd-types'

/**
 * The bodies in a const.inp file, for the schematic, or null when the text
 * has no fixed or rigid body to draw.
 */
export const constraintsFromConstInp = (
  text: string
): MDConstraintsDTO | null => {
  if (!text.trim()) return null
  const parsed = parseConstInp(text)
  const bodies =
    (parsed.fixed_bodies?.length ?? 0) + (parsed.rigid_bodies?.length ?? 0)
  return bodies > 0 ? parsed : null
}
