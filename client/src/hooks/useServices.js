import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

export function useServices({ all = false } = {}) {
  return useQuery({
    queryKey: ['services', { all }],
    queryFn: () => apiFetch(`/api/services${all ? '?all=1' : ''}`),
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) =>
      apiFetch('/api/services', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function usePatchService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      apiFetch(`/api/services/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}

export function useArchiveService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  })
}
