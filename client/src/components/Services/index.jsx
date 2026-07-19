import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useServices } from '../../hooks/useServices'
import ServiceCard from './ServiceCard'
import SyncAllButton from '../SyncAllButton'

const CATEGORY_LABELS = {
  cloud:    'Cloud',
  ai_model: 'AI Models',
  ai_api:   'AI APIs',
  tool:     'Dev Tools',
  custom:   'Custom',
}

export default function Services() {
  const [filter, setFilter] = useState('all')
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const { data: services = [], isLoading, isError } = useServices()

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>
  if (isError)   return <div className="p-6 text-red-400 text-sm">Failed to load services.</div>

  const categories = [...new Set(services.map(s => s.category))]
  const visible = filter === 'all' ? services : services.filter(s => s.category === filter)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">
          <span className="text-emerald-400 glow">&gt;</span> services
        </h2>
        <SyncAllButton />
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', ...categories].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            {cat === 'all' ? 'All' : (CATEGORY_LABELS[cat] ?? cat)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map(service => (
          <ServiceCard
            key={service.id}
            service={service}
            focused={focusId != null && String(service.id) === focusId}
          />
        ))}
      </div>
    </div>
  )
}
