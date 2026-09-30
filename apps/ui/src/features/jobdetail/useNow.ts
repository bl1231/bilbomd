import { useEffect, useState } from 'react'

// The current time, re-read every second while `active` so running
// durations tick. Stays put otherwise.
export const useNow = (active: boolean): Date => {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!active) return
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [active])

  return now
}
