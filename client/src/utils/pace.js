// Returns 'on_track' | 'warning' | 'over' | null (no budget set)
export function computePace(totalSpend, totalBudget, today = new Date()) {
  if (!totalBudget || totalBudget <= 0) return null
  if (totalSpend >= totalBudget) return 'over'

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const elapsedFraction = today.getDate() / daysInMonth
  const projected = totalSpend / elapsedFraction

  if (projected >= totalBudget) return 'over'
  if (projected >= totalBudget * 0.9) return 'warning'
  return 'on_track'
}
