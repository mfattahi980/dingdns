import { useState, useEffect } from 'react'
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react'
import { getDDNSTokens, createDDNSToken, deleteDDNSToken, getZones } from '../../lib/api'
import Modal from '../../components/Modal'

export default function DDNS() {
  const [tokens, setTokens] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(0)
  const [label, setLabel] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const loadData = async () => {
    try {
      const [tokensRes, zonesRes] = await Promise.all([getDDNSTokens(), getZones()])
      setTokens(tokensRes.data.tokens || [])
      setZones(zonesRes.data.zones || [])
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
    if (!selectedRecord) {
      setError('Please select a record')
      return
    }
    try {
      await createDDNSToken(selectedRecord, label)
      setShowCreate(false)
      setLabel('')
      setSelectedRecord(0)
      loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create token')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this DDNS token?')) return
    try {
      await deleteDDNSToken(id)
      loadData()
    } catch (err) {
      console.error('Failed to delete token', err)
    }
  }

  const copyToken = (id: number, token: string) => {
    navigator.clipboard.writeText(token)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Get all A/AAAA records from all zones for DDNS
  const allRecords = zones.flatMap((z: any) =>
    (z.records || [])
      .filter((r: any) => r.type === 'A' || r.type === 'AAAA')
      .map((r: any) => ({ ...r, zoneName: z.name }))
  )

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dynamic DNS</h1>
          <p className="text-gray-500 mt-1">Manage DDNS tokens for automatic IP updates</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Token
        </button>
      </div>

      {/* Usage guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-medium text-blue-800 mb-2">How to use DDNS</h3>
        <p className="text-sm text-blue-700 mb-2">Update your IP by calling this URL:</p>
        <code className="block bg-white px-3 py-2 rounded-lg text-sm text-blue-900 border">
          GET /api/ddns/update?token=YOUR_TOKEN&ip=auto
        </code>
        <p className="text-xs text-blue-600 mt-2">
          If <code>ip</code> is omitted, your public IP will be detected automatically.
          Compatible with ddclient and most routers.
        </p>
      </div>

      {tokens.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600">No DDNS tokens</h3>
          <p className="text-gray-400 mt-1">Create a token to enable automatic IP updates</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {tokens.map((token) => (
            <div key={token.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{token.label || 'Unnamed Token'}</h3>
                  <p className="text-sm text-gray-500">
                    Record: {token.record?.name}.{token.record?.zone?.name || '?'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToken(token.id, token.token)}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                    title="Copy token"
                  >
                    {copiedId === token.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(token.id)}
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-600 break-all">
                {token.token}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400">
                <span>Last IP: {token.last_ip || 'Never used'}</span>
                <span>Last used: {token.last_used ? new Date(token.last_used).toLocaleString() : 'Never'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create DDNS Token">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Home Router, Office, ..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNS Record</label>
            <select
              value={selectedRecord}
              onChange={(e) => setSelectedRecord(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value={0}>Select a record...</option>
              {allRecords.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}.{r.zoneName} ({r.type}: {r.content})
                </option>
              ))}
            </select>
            {allRecords.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No A/AAAA records found. Create one first.</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Token</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
