import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useMetrics(serviceId) {
  return useQuery({
    queryKey: ['metrics', serviceId],
    queryFn: () => apiFetch(`/api/metrics/${serviceId}`),
    enabled: serviceId != null,
  })
}

export function useUpsertMetric(serviceId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ metricKey, label, value_type, value_num, value_text, unit }) =>
      apiFetch(`/api/metrics/${serviceId}/${metricKey}`, {
        method: 'PUT',
        body: JSON.stringify({ label, value_type, value_num, value_text, unit }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metrics', serviceId] }),
  })
}

export function useDeleteMetric(serviceId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (metricKey) =>
      apiFetch(`/api/metrics/${serviceId}/${metricKey}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metrics', serviceId] }),
  })
}
