import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useSnapshots(n = 2) {
  return useQuery({
    queryKey: ['snapshots', n],
    queryFn: () => apiFetch(`/api/snapshots/last?n=${n}`),
    staleTime: 5 * 60_000,
  })
}
