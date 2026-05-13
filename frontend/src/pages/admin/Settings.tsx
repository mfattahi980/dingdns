import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, X, Send, Mail } from 'lucide-react'
import { getAdminSettings, updateAdminSettings, sendTestEmail } from '../../lib/api'

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [testingSMTP, setTestingSMTP] = useState(false)

  useEffect(() => {
    getAdminSettings()
      .then(res => setSettings(res.data))
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const handleChange = (key: string, value: string) => {
    setSettings(s => ({ ...s, [key]: value }))
  }

  const handleToggle = (key: string) => {
    setSettings(s => ({ ...s, [key]: s[key] === 'true' ? 'false' : 'true' }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await updateAdminSettings(settings)
      setSuccess('Settings saved successfully')
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    if (!testEmail) return
    setTestingSMTP(true)
    setError('')
    setSuccess('')
    try {
      // Save current SMTP settings first
      await updateAdminSettings(settings)
      await sendTestEmail(testEmail)
      setSuccess(`Test email sent to ${testEmail}`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send test email')
    } finally {
      setTestingSMTP(false)
    }
  }

  if (loading) return <div className="flex justify-center py-12 text-gray-500">Loading...</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-7 h-7 text-gray-500" />
          System Settings
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

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

      {/* General Settings */}
      <div className="bg-white rounded-xl border">
        <div className="p-5 border-b">
          <h2 className="font-semibold">General</h2>
        </div>
        <div className="divide-y">
          <div className="flex items-center justify-between p-5">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-gray-900">Public Registration</h3>
              <p className="text-sm text-gray-500 mt-1">Allow new users to create accounts. Free plan by default.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.registration_enabled === 'true'} onChange={() => handleToggle('registration_enabled')} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-5">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-gray-900">Login & Registration Captcha</h3>
              <p className="text-sm text-gray-500 mt-1">Math captcha to protect against bots.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.captcha_enabled === 'true'} onChange={() => handleToggle('captcha_enabled')} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="flex items-center justify-between p-5">
            <div className="flex-1 pr-4">
              <h3 className="font-medium text-gray-900">Email Verification</h3>
              <p className="text-sm text-gray-500 mt-1">Require users to verify their email before they can log in. Needs SMTP configured below.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.email_verification_enabled === 'true'} onChange={() => handleToggle('email_verification_enabled')} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="p-5">
            <h3 className="font-medium text-gray-900 mb-2">Base URL</h3>
            <p className="text-sm text-gray-500 mb-3">Used in verification emails. Include protocol (e.g., https://dingdns.com)</p>
            <input
              type="text"
              value={settings.base_url || ''}
              onChange={(e) => handleChange('base_url', e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="https://dingdns.com"
            />
          </div>
        </div>
      </div>

      {/* SMTP Settings */}
      <div className="bg-white rounded-xl border">
        <div className="p-5 border-b flex items-center gap-2">
          <Mail className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold">SMTP Email Server</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input
                type="text"
                value={settings.smtp_host || ''}
                onChange={(e) => handleChange('smtp_host', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="smtp.gmail.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
              <input
                type="text"
                value={settings.smtp_port || '587'}
                onChange={(e) => handleChange('smtp_port', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="587"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={settings.smtp_username || ''}
                onChange={(e) => handleChange('smtp_username', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="user@gmail.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={settings.smtp_password || ''}
                onChange={(e) => handleChange('smtp_password', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="app password"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input
              type="text"
              value={settings.smtp_from || ''}
              onChange={(e) => handleChange('smtp_from', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              placeholder="noreply@dingdns.com"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 text-sm">Use SSL/TLS (port 465)</h3>
              <p className="text-xs text-gray-500">Enable for implicit TLS. Disable for STARTTLS (port 587).</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={settings.smtp_tls === 'true'} onChange={() => handleToggle('smtp_tls')} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>

          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-2">Test SMTP Configuration</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="test@example.com"
              />
              <button
                onClick={handleTestEmail}
                disabled={testingSMTP || !testEmail}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                <Send className="w-4 h-4" />
                {testingSMTP ? 'Sending...' : 'Send Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Help */}
      <div className="bg-gray-50 rounded-xl border p-5 text-sm text-gray-500 space-y-2">
        <p><strong>Gmail SMTP:</strong> Host: smtp.gmail.com, Port: 587, TLS: off. Use an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener" className="text-blue-600 underline">App Password</a> (not your regular password).</p>
        <p><strong>Mailgun:</strong> Host: smtp.mailgun.org, Port: 587, TLS: off.</p>
        <p><strong>Custom:</strong> Any SMTP server works. Port 587 (STARTTLS) or 465 (SSL/TLS).</p>
      </div>
    </div>
  )
}
