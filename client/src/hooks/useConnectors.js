import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useAllowOutbound() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'allow_outbound'],
    queryFn: () => apiFetch('/api/settings/allow_outbound'),
    staleTime: 30_000,
  })
  const mutation = useMutation({
    mutationFn: (enabled) =>
      apiFetch('/api/settings/allow_outbound', {
        method: 'PUT',
        body: JSON.stringify({ value: enabled ? 'true' : 'false' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'allow_outbound'] }),
  })
  return {
    allowed: data?.value === 'true',
    isLoading,
    setAllowed: mutation.mutate,
    isPending: mutation.isPending,
  }
}

export function useUpsertConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ serviceId, providerKey, secret, secrets, config }) =>
      apiFetch(`/api/connectors/${serviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ providerKey, secret, secrets, config }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useSyncConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (serviceId) =>
      apiFetch(`/api/connectors/${serviceId}/sync`, { method: 'POST' }),
    onSuccess: (_, serviceId) => {
      qc.invalidateQueries({ queryKey: ['metrics', serviceId] })
      qc.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useAuditConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (serviceId) =>
      apiFetch(`/api/connectors/${serviceId}/audit`, { method: 'POST' }),
    onSuccess: (_, serviceId) => {
      qc.invalidateQueries({ queryKey: ['metrics', serviceId] })
    },
  })
}

export function useDeleteConnector() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (serviceId) =>
      apiFetch(`/api/connectors/${serviceId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}
