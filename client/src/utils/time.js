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

// Parses an ISO date-time string as UTC even when it omits a timezone
// designator. JS's `Date` constructor treats a bare "YYYY-MM-DDTHH:mm:ss" as
// *local* time — if a connector ever returns a reset timestamp without an
// offset, that default silently skews it by the machine's UTC offset (e.g.
// 1h in Portugal's summer DST) instead of the intended UTC instant.
export function parseUtcDate(text) {
  if (!text) return null
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(text)
  const d = new Date(hasOffset ? text : `${text}Z`)
  return isNaN(d.getTime()) ? null : d
}

// Resolves a metric row's date value regardless of which column carries it —
// connector-sourced dates (e.g. claude_plan's session/weekly reset) arrive as
// an ISO string in `value_text`; a manually-entered epoch would use `value_num`.
export function parseMetricDate({ value_text, value_num }) {
  if (value_text) return parseUtcDate(value_text)
  return value_num != null ? new Date(value_num * 1000) : null
}

// Countdown to a future reset instant ("in 5m" / "in 5h" / "in 3d") rather
// than the exact clock time — falls back to the date once it has passed.
export function formatCountdown(date) {
  const ms = date.getTime() - Date.now()
  if (ms <= 0) return date.toLocaleDateString()
  const mins = Math.round(ms / MINUTE)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(ms / HOUR)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(ms / DAY)}d`
}
