/** Up to two letters for the avatar: "Jane Doe" → "JD", "jane.doe" → "JD", "jdoe" → "JD". */
export const initialsFor = (name: string): string => {
  const [first, second] = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (!first) return '?'
  if (!second) return first.slice(0, 2).toUpperCase()
  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

/** A stable color per name, so a user's avatar looks the same every visit. */
export const avatarColorFor = (name: string): string => {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 42%)`
}
