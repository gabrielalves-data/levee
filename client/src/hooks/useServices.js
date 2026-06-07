import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useServices({ all = false } = {}) {
  return useQuery({
    queryKey: ['services', { all }],
    queryFn: () => apiFetch(`/api/services${all ? '?all=1' : ''}`),
  })
}
