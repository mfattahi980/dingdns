import { useState, useEffect } from 'react'
import { Users, Globe, FileText, Key } from 'lucide-react'
import { getStats } from '../../lib/api'

export default function Stats() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getStats().then((res) => {
      setStats(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const cards = [
    { label: 'Users', value: stats?.users || 0, icon: Users, color: 'bg-blue-500' },
    { label: 'Zones', value: stats?.zones || 0, icon: Globe, color: 'bg-green-500' },
    { label: 'Records', value: stats?.records || 0, icon: FileText, color: 'bg-purple-500' },
    { label: 'DDNS Tokens', value: stats?.ddns_tokens || 0, icon: Key, color: 'bg-orange-500' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Statistics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-3xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${card.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
