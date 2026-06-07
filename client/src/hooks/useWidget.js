import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useWidget() {
  return useQuery({
    queryKey: ['widget'],
    queryFn: () => apiFetch('/api/widget'),
  })
}

export function useSetWidgetSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ slotIndex, service_id, metric_key, label_override }) =>
      apiFetch(`/api/widget/${slotIndex}`, {
        method: 'PUT',
        body: JSON.stringify({ service_id, metric_key, label_override }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['widget'] }),
  })
}

export function useClearWidgetSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slotIndex) =>
      apiFetch(`/api/widget/${slotIndex}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['widget'] }),
  })
}
