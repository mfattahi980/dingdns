import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Edit2, Save, X } from 'lucide-react'
import { getZone, createRecord, updateRecord, deleteRecord } from '../../lib/api'
import Modal from '../../components/Modal'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR']

export default function ZoneDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [zone, setZone] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ name: '', type: 'A', content: '', ttl: 300, priority: 0 })

  const loadZone = async () => {
    try {
      const res = await getZone(Number(id))
      setZone(res.data)
      setRecords(res.data.records || [])
    } catch {
      navigate('/zones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadZone() }, [id])

  const resetForm = () => setForm({ name: '', type: 'A', content: '', ttl: 300, priority: 0 })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createRecord(Number(id), form)
      setShowCreate(false)
      resetForm()
      loadZone()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create record')
    }
  }

  const handleUpdate = async (recordId: number) => {
    setError('')
    try {
      await updateRecord(Number(id), recordId, form)
      setEditingId(null)
      resetForm()
      loadZone()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update record')
    }
  }

  const handleDelete = async (recordId: number) => {
    if (!confirm('Delete this record?')) return
    try {
      await deleteRecord(Number(id), recordId)
      loadZone()
    } catch (err) {
      console.error('Failed to delete record', err)
    }
  }

  const startEdit = (record: any) => {
    setEditingId(record.id)
    setForm({
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority,
    })
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const typeColor: Record<string, string> = {
    A: 'bg-blue-100 text-blue-700',
    AAAA: 'bg-purple-100 text-purple-700',
    CNAME: 'bg-green-100 text-green-700',
    MX: 'bg-orange-100 text-orange-700',
    TXT: 'bg-yellow-100 text-yellow-700',
    NS: 'bg-cyan-100 text-cyan-700',
    SRV: 'bg-pink-100 text-pink-700',
    CAA: 'bg-red-100 text-red-700',
    PTR: 'bg-gray-100 text-gray-700',
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/zones')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{zone?.name}</h1>
          <p className="text-gray-500 text-sm">Serial: {zone?.soa_serial}</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => { resetForm(); setShowCreate(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Record
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Content</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">TTL</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Priority</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">No records yet</td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  {editingId === record.id ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                          className="px-2 py-1 border rounded text-sm">
                          {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                          className="w-full px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })}
                          className="w-20 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                          className="w-16 px-2 py-1 border rounded text-sm" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => handleUpdate(record.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded ml-1">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-mono">{record.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[record.type] || 'bg-gray-100'}`}>
                          {record.type}
                        </span>
                        {record.is_ddns && (
                          <span className="ml-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">DDNS</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600 max-w-xs truncate">{record.content}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{record.ttl}s</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{record.priority || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => startEdit(record)} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(record.id)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 ml-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add DNS Record">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="@ or subdomain" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="IP address or hostname" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TTL (seconds)</label>
              <input type="number" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create Record</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
