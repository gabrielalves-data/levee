import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useMetrics(serviceId) {
  return useQuery({
    queryKey: ['metrics', serviceId],
    queryFn: () => apiFetch(`/api/metrics/${serviceId}`),
    enabled: serviceId != null,
  })
}
