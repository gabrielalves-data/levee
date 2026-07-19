import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api'

const SYNC_ALL_COOLDOWN_MS = 5 * 60 * 1000
const SYNC_ALL_STORAGE_KEY = 'levee:syncAllNextAllowedAt'

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

// Server enforces the real 5min cooldown (see server/routes/connectors.js);
// this mirrors it in localStorage so the button can show a countdown and
// disable itself without waiting on a rejected request. Written on both
// success and failure — a failure only happens this soon after a prior click
// if the server itself was already cooling down (e.g. localStorage was
// cleared), so backing off the full window again avoids hammering it.
export function useSyncAllConnectors() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/api/connectors/sync-all', { method: 'POST' }),
    onSettled: () => {
      localStorage.setItem(SYNC_ALL_STORAGE_KEY, String(Date.now() + SYNC_ALL_COOLDOWN_MS))
      qc.invalidateQueries({ queryKey: ['services'] })
      qc.invalidateQueries({ queryKey: ['metrics'] })
    },
  })
}

export function useSyncAllCooldown() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const nextAllowedAt = Number(localStorage.getItem(SYNC_ALL_STORAGE_KEY)) || 0
  return Math.max(0, Math.ceil((nextAllowedAt - now) / 1000))
}

export function useTestConnector() {
  return useMutation({
    mutationFn: (serviceId) =>
      apiFetch(`/api/connectors/${serviceId}/test`, { method: 'POST' }),
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
