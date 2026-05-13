import { useState, useEffect } from 'react'
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react'
import { getAuditLogs } from '../../lib/api'

export default function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const perPage = 50

  const loadLogs = async (p: number) => {
    setLoading(true)
    try {
      const res = await getAuditLogs(p)
      setLogs(res.data.logs || [])
      setTotal(res.data.total || 0)
      setPage(p)
    } catch (err) {
      console.error('Failed to load logs', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs(1) }, [])

  const totalPages = Math.ceil(total / perPage)

  const actionColor: Record<string, string> = {
    login: 'bg-green-100 text-green-700',
    create_zone: 'bg-blue-100 text-blue-700',
    update_zone: 'bg-blue-100 text-blue-700',
    delete_zone: 'bg-red-100 text-red-700',
    create_record: 'bg-cyan-100 text-cyan-700',
    update_record: 'bg-cyan-100 text-cyan-700',
    delete_record: 'bg-red-100 text-red-700',
    ddns_update: 'bg-amber-100 text-amber-700',
    create_user: 'bg-purple-100 text-purple-700',
    delete_user: 'bg-red-100 text-red-700',
    change_password: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Logs</h1>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Time</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Action</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Resource</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Details</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No logs yet</td></tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColor[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {log.resource} {log.resource_id ? `#${log.resource_id}` : ''}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{log.details || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{log.ip}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex gap-2">
              <button onClick={() => loadLogs(page - 1)} disabled={page <= 1}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-50">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => loadLogs(page + 1)} disabled={page >= totalPages}
                className="p-1 rounded hover:bg-gray-200 disabled:opacity-50">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
