// Per-browser choice to mount the Molstar viewer without clicking
// "Load 3D Viewer" first.
export const AUTO_LOAD_KEY = 'molstarAutoLoad'

// Storage can be missing or throw (private windows, blocked site data), so
// the preference quietly falls back to "off".
export const readAutoLoad = (): boolean => {
  try {
    return localStorage.getItem(AUTO_LOAD_KEY) === 'true'
  } catch {
    return false
  }
}

export const writeAutoLoad = (value: boolean) => {
  try {
    if (value) localStorage.setItem(AUTO_LOAD_KEY, 'true')
    else localStorage.removeItem(AUTO_LOAD_KEY)
  } catch {
    // Not persisted; the choice still applies for this visit
  }
}
