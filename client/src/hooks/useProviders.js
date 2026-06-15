import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api'

// Canonical provider directory — see server/providers.js. Each entry:
//   { key, label, category, catalogKey?, apiKey?, authType? }
export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => apiFetch('/api/providers'),
    staleTime: 5 * 60_000,
  })
}
