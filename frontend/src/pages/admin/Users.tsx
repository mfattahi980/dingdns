import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Crown } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser } from '../../lib/api'
import Modal from '../../components/Modal'

export default function Users() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ email: '', password: '', role: 'user', plan: 'free', max_zones: 0, max_subdomains: 3 })

  const loadUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data.users || [])
    } catch (err) {
      console.error('Failed to load users', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createUser(form)
      setShowCreate(false)
      setForm({ email: '', password: '', role: 'user', plan: 'free', max_zones: 0, max_subdomains: 3 })
      loadUsers()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user')
    }
  }

  const handleUpdate = async (id: number) => {
    try {
      const updates: any = { email: form.email, role: form.role, plan: form.plan, max_zones: form.max_zones, max_subdomains: form.max_subdomains }
      if (form.password) updates.password = form.password
      await updateUser(id, updates)
      setEditingId(null)
      loadUsers()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user')
    }
  }

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    try {
      await deleteUser(id)
      loadUsers()
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user')
    }
  }

  // Auto-set defaults when plan changes
  const handlePlanChange = (plan: string) => {
    if (plan === 'plus') {
      setForm({ ...form, plan, max_zones: 10, max_subdomains: 20 })
    } else {
      setForm({ ...form, plan, max_zones: 0, max_subdomains: 3 })
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>

  const PlanFields = () => (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
        <select value={form.plan} onChange={(e) => handlePlanChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
          <option value="free">Free - Subdomains only</option>
          <option value="plus">Plus - Subdomains + Custom Domains</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Subdomains</label>
          <input type="number" value={form.max_subdomains} onChange={(e) => setForm({ ...form, max_subdomains: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Under dingdns.com</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Max Custom Domains</label>
          <input type="number" value={form.max_zones} onChange={(e) => setForm({ ...form, max_zones: Number(e.target.value) })}
            className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            disabled={form.plan === 'free'} />
          <p className="text-xs text-gray-400 mt-1">{form.plan === 'free' ? 'Plus plan only' : 'Own domains'}</p>
        </div>
      </div>
    </>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">Manage system users and plans</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Plan</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Limits</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                  }`}>{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${
                    user.plan === 'plus' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user.plan === 'plus' && <Crown className="w-3 h-3" />}
                    {(user.plan || 'free').toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {user.max_subdomains || 3} sub / {user.max_zones || 0} custom
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{user.is_active ? 'Active' : 'Disabled'}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => {
                    setEditingId(user.id)
                    setForm({ ...form, email: user.email, role: user.role, plan: user.plan || 'free', max_zones: user.max_zones || 0, max_subdomains: user.max_subdomains || 3, password: '' })
                  }} className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(user.id, user.email)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 ml-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create User">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" required minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <PlanFields />
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editingId !== null} onClose={() => setEditingId(null)} title="Edit User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password (leave empty to keep)</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <PlanFields />
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={() => handleUpdate(editingId!)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
