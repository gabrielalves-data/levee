import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch('/api/catalog'),
    staleTime: 10 * 60_000,
  })
}

export function useApplyCatalogPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, providerKey, planKey }) =>
      apiFetch('/api/catalog/apply', {
        method: 'POST',
        body: JSON.stringify({ serviceId, providerKey, planKey }),
      }),
    onSuccess: (_, { serviceId }) => {
      qc.invalidateQueries({ queryKey: ['metrics', serviceId] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })
}
