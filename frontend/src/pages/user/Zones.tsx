import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Globe, Plus, Trash2, ExternalLink, Crown } from 'lucide-react'
import { getZones, createZone, deleteZone, getProfile } from '../../lib/api'
import Modal from '../../components/Modal'

export default function Zones() {
  const [zones, setZones] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createMode, setCreateMode] = useState<'subdomain' | 'custom'>('subdomain')
  const [subdomainName, setSubdomainName] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [error, setError] = useState('')

  const loadData = async () => {
    try {
      const [zonesRes, profileRes] = await Promise.all([getZones(), getProfile()])
      setZones(zonesRes.data.zones || [])
      setProfile(profileRes.data)
    } catch (err) {
      console.error('Failed to load data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const zoneName = createMode === 'subdomain'
      ? `${subdomainName}.dingdns.com`
      : customDomain

    if (!zoneName || zoneName === '.dingdns.com') {
      setError('Please enter a valid name')
      return
    }

    try {
      await createZone(zoneName)
      setShowCreate(false)
      setSubdomainName('')
      setCustomDomain('')
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create zone')
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete zone "${name}" and all its records?`)) return
    try {
      await deleteZone(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete zone', err)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const canCustomDomain = profile?.can_custom_domain || profile?.role === 'admin'
  const plan = profile?.plan || 'free'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DNS Zones</h1>
          <p className="text-gray-500 mt-1">
            Manage your DNS zones
            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
              plan === 'plus' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {plan === 'plus' && <Crown className="w-3 h-3 inline mr-1" />}
              {plan.toUpperCase()} Plan
            </span>
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Zone
        </button>
      </div>

      {zones.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">No zones yet</h3>
          <p className="text-gray-400 mt-1">Create your first DNS zone to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <Link to={`/zones/${zone.id}`} className="flex items-center gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${zone.is_active ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <Globe className={`w-5 h-5 ${zone.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {zone.name}
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                        zone.zone_type === 'custom' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {zone.zone_type === 'custom' ? 'Custom Domain' : 'Subdomain'}
                      </span>
                    </h3>
                    <p className="text-sm text-gray-500">
                      {zone.records?.length || 0} records &middot; Serial: {zone.soa_serial}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/zones/${zone.id}`}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(zone.id, zone.name)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Zone">
        <form onSubmit={handleCreate}>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {/* Mode selector */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setCreateMode('subdomain')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                createMode === 'subdomain'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              Subdomain (Free)
            </button>
            <button
              type="button"
              onClick={() => {
                if (!canCustomDomain) {
                  setError('Custom domains require Plus plan')
                  return
                }
                setCreateMode('custom')
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                createMode === 'custom'
                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                  : canCustomDomain
                    ? 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
              }`}
            >
              <Crown className="w-3 h-3 inline mr-1" />
              Custom Domain (Plus)
            </button>
          </div>

          {createMode === 'subdomain' ? (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain Name</label>
              <div className="flex">
                <input
                  type="text"
                  value={subdomainName}
                  onChange={(e) => setSubdomainName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 px-4 py-2 border border-r-0 border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="mysite"
                  required
                />
                <span className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-r-lg text-gray-500 text-sm whitespace-nowrap">
                  .dingdns.com
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Only lowercase letters, numbers, and hyphens.
                Limit: {profile?.max_subdomains || 3} subdomains.
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain Name</label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="example.com"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Point your domain's NS records to ns1.dingdns.com and ns2.dingdns.com
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Create Zone
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
