import { useEffect, useState } from 'react'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Compact "Xm ago"-style label for a past ISO timestamp.
export function timeSince(dateStr) {
  if (!dateStr) return null
  const diffMs = Date.now() - new Date(dateStr).getTime()
  if (diffMs < MINUTE) return 'just now'
  if (diffMs < HOUR) return `${Math.floor(diffMs / MINUTE)}m ago`
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}h ago`
  return `${Math.floor(diffMs / DAY)}d ago`
}

// Re-renders every `intervalMs` so a rendered `timeSince` label keeps advancing
// without waiting on the underlying query to refetch.
export function useRelativeTime(dateStr, intervalMs = 30_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!dateStr) return
    const id = setInterval(() => setTick(t => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [dateStr, intervalMs])
  return timeSince(dateStr)
}
