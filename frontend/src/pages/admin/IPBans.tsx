import { useState, useEffect } from 'react'
import { ShieldBan, Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { getIPBans, addIPBan, deleteIPBan, getLoginAttempts } from '../../lib/api'
import Modal from '../../components/Modal'

export default function IPBans() {
  const [bans, setBans] = useState<any[]>([])
  const [attempts, setAttempts] = useState<any[]>([])
  const [attemptsTotal, setAttemptsTotal] = useState(0)
  const [attemptsPage, setAttemptsPage] = useState(1)
  const [tab, setTab] = useState<'bans' | 'attempts'>('bans')
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newIP, setNewIP] = useState('')
  const [newReason, setNewReason] = useState('')
  const [newExpiry, setNewExpiry] = useState('0')
  const [error, setError] = useState('')

  useEffect(() => {
    loadBans()
    loadAttempts(1)
  }, [])

  const loadBans = async () => {
    try {
      const res = await getIPBans()
      setBans(res.data || [])
    } catch {} finally { setLoading(false) }
  }

  const loadAttempts = async (page: number) => {
    try {
      const res = await getLoginAttempts(page)
      setAttempts(res.data.data || [])
      setAttemptsTotal(res.data.total)
      setAttemptsPage(page)
    } catch {}
  }

  const handleAddBan = async () => {
    if (!newIP) return
    try {
      await addIPBan(newIP, newReason, parseInt(newExpiry))
      setShowAdd(false)
      setNewIP('')
      setNewReason('')
      setNewExpiry('0')
      loadBans()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to ban IP')
    }
  }

  const handleDeleteBan = async (id: number) => {
    try {
      await deleteIPBan(id)
      setBans(b => b.filter(i => i.id !== id))
    } catch { setError('Failed to remove ban') }
  }

  if (loading) return <div className="flex justify-center py-12 text-gray-500">Loading...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldBan className="w-7 h-7 text-red-500" />
          IP Security
        </h1>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('bans')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'bans' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
        >
          IP Bans ({bans.length})
        </button>
        <button
          onClick={() => setTab('attempts')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${tab === 'attempts' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
        >
          Login Attempts
        </button>
      </div>

      {tab === 'bans' && (
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Banned IPs</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              <Plus className="w-4 h-4" /> Ban IP
            </button>
          </div>

          {bans.length === 0 ? (
            <p className="text-center py-8 text-gray-400">No banned IPs</p>
          ) : (
            <div className="divide-y">
              {bans.map(ban => (
                <div key={ban.id} className="flex items-center justify-between p-4">
                  <div>
                    <code className="text-sm font-mono font-medium">{ban.ip}</code>
                    {ban.reason && <span className="ml-3 text-sm text-gray-500">{ban.reason}</span>}
                    <div className="text-xs text-gray-400 mt-1">
                      {ban.expires_at
                        ? `Expires: ${new Date(ban.expires_at).toLocaleString()}`
                        : 'Permanent'}
                      {' · '}Added: {new Date(ban.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteBan(ban.id)}
                    className="p-2 text-red-400 hover:text-red-600"
                    title="Remove ban"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'attempts' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Recent Login Attempts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">IP</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Username</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attempts.map(a => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-gray-600">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs">{a.ip}</td>
                    <td className="px-4 py-3">{a.username}</td>
                    <td className="px-4 py-3">
                      {a.success ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Success</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1 w-fit">
                          <AlertTriangle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {attemptsTotal > 50 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t">
              <button
                onClick={() => loadAttempts(attemptsPage - 1)}
                disabled={attemptsPage <= 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">Page {attemptsPage}</span>
              <button
                onClick={() => loadAttempts(attemptsPage + 1)}
                disabled={attemptsPage * 50 >= attemptsTotal}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Ban Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Ban IP Address">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IP Address or CIDR</label>
            <input
              type="text"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="1.2.3.4 or 10.0.0.0/8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="Brute force attempt"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
            <select
              value={newExpiry}
              onChange={(e) => setNewExpiry(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
            >
              <option value="0">Permanent</option>
              <option value="60">1 hour</option>
              <option value="1440">24 hours</option>
              <option value="10080">7 days</option>
              <option value="43200">30 days</option>
            </select>
          </div>
          <button
            onClick={handleAddBan}
            className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Ban IP
          </button>
        </div>
      </Modal>
    </div>
  )
}
