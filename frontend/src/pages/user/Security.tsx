import { useState, useEffect } from 'react'
import { Shield, Plus, Trash2, ShieldCheck, ShieldOff, Monitor, X } from 'lucide-react'
import {
  getSecurityStatus, getIPAllowlist, addIPAllowlist, deleteIPAllowlist,
  toggleIPRestriction, setup2FA, verify2FA, disable2FA, getSessions, revokeSession
} from '../../lib/api'
import Modal from '../../components/Modal'
import CopyButton from '../../components/CopyButton'

export default function Security() {
  const [status, setStatus] = useState({ two_factor_enabled: false, ip_restricted: false })
  const [ipList, setIpList] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 2FA state
  const [showSetup2FA, setShowSetup2FA] = useState(false)
  const [totpSecret, setTotpSecret] = useState('')
  const [totpURI, setTotpURI] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [showDisable2FA, setShowDisable2FA] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')

  // IP state
  const [showAddIP, setShowAddIP] = useState(false)
  const [newIP, setNewIP] = useState('')
  const [newIPLabel, setNewIPLabel] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [statusRes, ipRes, sessRes] = await Promise.all([
        getSecurityStatus(),
        getIPAllowlist(),
        getSessions()
      ])
      setStatus(statusRes.data)
      setIpList(ipRes.data || [])
      setSessions(sessRes.data || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }

  const handleToggleIPRestriction = async () => {
    try {
      await toggleIPRestriction(!status.ip_restricted)
      setStatus(s => ({ ...s, ip_restricted: !s.ip_restricted }))
      setSuccess(status.ip_restricted ? 'IP restriction disabled' : 'IP restriction enabled')
    } catch { setError('Failed to toggle IP restriction') }
  }

  const handleAddIP = async () => {
    if (!newIP) return
    try {
      await addIPAllowlist(newIP, newIPLabel)
      setShowAddIP(false)
      setNewIP('')
      setNewIPLabel('')
      const res = await getIPAllowlist()
      setIpList(res.data || [])
      setSuccess('IP added to allowlist')
    } catch { setError('Failed to add IP') }
  }

  const handleDeleteIP = async (id: number) => {
    try {
      await deleteIPAllowlist(id)
      setIpList(l => l.filter(i => i.id !== id))
    } catch { setError('Failed to remove IP') }
  }

  const handleSetup2FA = async () => {
    try {
      const res = await setup2FA()
      setTotpSecret(res.data.secret)
      setTotpURI(res.data.uri)
      setShowSetup2FA(true)
      setVerifyCode('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to setup 2FA')
    }
  }

  const handleVerify2FA = async () => {
    try {
      const res = await verify2FA(verifyCode)
      setBackupCodes(res.data.backup_codes)
      setShowSetup2FA(false)
      setShowBackupCodes(true)
      setStatus(s => ({ ...s, two_factor_enabled: true }))
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid code')
    }
  }

  const handleDisable2FA = async () => {
    try {
      await disable2FA(disablePassword)
      setShowDisable2FA(false)
      setDisablePassword('')
      setStatus(s => ({ ...s, two_factor_enabled: false }))
      setSuccess('2FA disabled')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disable 2FA')
    }
  }

  const handleRevokeSession = async (id: number) => {
    try {
      await revokeSession(id)
      setSessions(s => s.filter(i => i.id !== id))
    } catch { setError('Failed to revoke session') }
  }


  if (loading) return <div className="flex justify-center py-12 text-gray-500">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="w-7 h-7 text-blue-500" />
        Security Settings
      </h1>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex justify-between">
          {error}
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex justify-between">
          {success}
          <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 2FA Section */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-purple-500" />
            <div>
              <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
            </div>
          </div>
          {status.two_factor_enabled ? (
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">Enabled</span>
              <button
                onClick={() => setShowDisable2FA(true)}
                className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
              >
                Disable
              </button>
            </div>
          ) : (
            <button
              onClick={handleSetup2FA}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* IP Restriction Section */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-6 h-6 text-orange-500" />
            <div>
              <h2 className="text-lg font-semibold">IP Restriction</h2>
              <p className="text-sm text-gray-500">Only allow login from specific IP addresses</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={status.ip_restricted}
              onChange={handleToggleIPRestriction}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-orange-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Allowed IPs</h3>
            <button
              onClick={() => setShowAddIP(true)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" /> Add IP
            </button>
          </div>

          {ipList.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No IPs configured. Add your IP before enabling restriction.</p>
          ) : (
            <div className="space-y-2">
              {ipList.map(ip => (
                <div key={ip.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <code className="text-sm font-mono">{ip.ip}</code>
                    {ip.label && <span className="ml-2 text-sm text-gray-500">({ip.label})</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteIP(ip.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="w-6 h-6 text-green-500" />
          <div>
            <h2 className="text-lg font-semibold">Active Sessions</h2>
            <p className="text-sm text-gray-500">Manage your active login sessions</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No active sessions</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="text-sm font-medium">{s.ip}</div>
                  <div className="text-xs text-gray-500 truncate max-w-xs">{s.user_agent}</div>
                  <div className="text-xs text-gray-400">Last used: {new Date(s.last_used).toLocaleString()}</div>
                </div>
                <button
                  onClick={() => handleRevokeSession(s.id)}
                  className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2FA Setup Modal */}
      <Modal isOpen={showSetup2FA} onClose={() => setShowSetup2FA(false)} title="Setup Two-Factor Authentication">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
          </p>
          <div className="flex justify-center p-4 bg-white border rounded-lg">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpURI)}`}
              alt="QR Code"
              className="w-48 h-48"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Or enter manually:</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">{totpSecret}</code>
              <CopyButton text={totpSecret} title="Copy secret" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enter verification code:</label>
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-center text-xl tracking-widest"
              placeholder="000000"
              maxLength={6}
            />
          </div>
          <button
            onClick={handleVerify2FA}
            disabled={verifyCode.length !== 6}
            className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            Verify & Enable
          </button>
        </div>
      </Modal>

      {/* Backup Codes Modal */}
      <Modal isOpen={showBackupCodes} onClose={() => setShowBackupCodes(false)} title="Backup Codes">
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm">
            Save these backup codes in a safe place. Each code can only be used once.
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, i) => (
              <code key={i} className="p-2 bg-gray-100 rounded text-center font-mono text-sm">{code}</code>
            ))}
          </div>
          <CopyButton
            text={backupCodes.join('\n')}
            label="Copy All & Close"
            title="Copy backup codes"
            onCopied={() => setTimeout(() => setShowBackupCodes(false), 600)}
          />
        </div>
      </Modal>

      {/* Disable 2FA Modal */}
      <Modal isOpen={showDisable2FA} onClose={() => setShowDisable2FA(false)} title="Disable 2FA">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Enter your password to disable two-factor authentication.</p>
          <input
            type="password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
            placeholder="Your password"
          />
          <button
            onClick={handleDisable2FA}
            className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Disable 2FA
          </button>
        </div>
      </Modal>

      {/* Add IP Modal */}
      <Modal isOpen={showAddIP} onClose={() => setShowAddIP(false)} title="Add Allowed IP">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IP Address or CIDR</label>
            <input
              type="text"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="192.168.1.0/24 or 1.2.3.4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
            <input
              type="text"
              value={newIPLabel}
              onChange={(e) => setNewIPLabel(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Home, Office, etc."
            />
          </div>
          <button
            onClick={handleAddIP}
            className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add IP
          </button>
        </div>
      </Modal>
    </div>
  )
}
