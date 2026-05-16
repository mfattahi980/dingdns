import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: `${API_BASE}/admin/api`,
  timeout: 30000,
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
    // CSRF protection - double submit
    config.headers['X-CSRF-Token'] = token
  }
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  }
)

export default api

// Auth
export const login = (data: { username: string; password: string; totp_code?: string; captcha_id?: string; captcha_answer?: string }) =>
  api.post('/login', data)
export const logout = () => api.post('/logout')
export const getProfile = () => api.get('/me')
export const updateProfile = (data: { email: string }) => api.put('/me', data)
export const changePassword = (data: { old_password: string; new_password: string }) => api.put('/password', data)
export const getMenu = () => api.get('/menu')
export const getCaptcha = () => api.get('/captcha')

// 2FA
export const setup2FA = () => api.post('/2fa/setup')
export const verify2FA = (code: string) => api.post('/2fa/verify', { code })
export const disable2FA = (password: string) => api.post('/2fa/disable', { password })

// Sessions
export const getSessions = () => api.get('/sessions')
export const revokeSession = (id: number) => api.delete(`/sessions/${id}`)

// IP Allowlist (admin's own)
export const getIPAllowlist = () => api.get('/ip-allowlist')
export const addIPAllowlist = (data: { ip: string; label: string }) => api.post('/ip-allowlist', data)
export const deleteIPAllowlist = (id: number) => api.delete(`/ip-allowlist/${id}`)
export const toggleIPRestriction = (enabled: boolean) => api.put('/ip-restriction', { enabled })

// Dashboard
export const getStats = () => api.get('/dashboard/stats')
export const getRecentActivity = () => api.get('/dashboard/activity')

// DNS
export const getZones = () => api.get('/zones')
export const getZone = (id: number) => api.get(`/zones/${id}`)
export const createZone = (data: { name: string; zone_type?: string }) => api.post('/zones', data)
export const updateZone = (id: number, data: any) => api.put(`/zones/${id}`, data)
export const deleteZone = (id: number) => api.delete(`/zones/${id}`)

export const getRecords = (zoneId: number) => api.get(`/records/zone/${zoneId}`)
export const createRecord = (zoneId: number, data: any) => api.post(`/records/zone/${zoneId}`, data)
export const updateRecord = (id: number, data: any) => api.put(`/records/${id}`, data)
export const deleteRecord = (id: number) => api.delete(`/records/${id}`)

export const getDDNSTokens = () => api.get('/ddns-tokens')
export const createDDNSToken = (data: { record_id: number; label: string }) => api.post('/ddns-tokens', data)
export const updateDDNSToken = (id: number, data: { label?: string; is_active?: boolean }) => api.put(`/ddns-tokens/${id}`, data)
export const deleteDDNSToken = (id: number) => api.delete(`/ddns-tokens/${id}`)

// API Keys
export const getAPIKeys = () => api.get('/api-keys')
export const createAPIKey = (data: { name: string; allowed_origins?: string }) => api.post('/api-keys', data)
export const updateAPIKey = (id: number, data: any) => api.put(`/api-keys/${id}`, data)
export const deleteAPIKey = (id: number) => api.delete(`/api-keys/${id}`)

// Security
export const getIPBans = () => api.get('/ip-bans')
export const addIPBan = (data: { ip: string; reason?: string; expires_in?: number }) => api.post('/ip-bans', data)
export const deleteIPBan = (id: number) => api.delete(`/ip-bans/${id}`)
export const getLoginAttempts = (page?: number) => api.get('/login-attempts', { params: { page } })
export const clearLoginAttempts = () => api.delete('/login-attempts')

// Suspicious activity (auto-ban engine)
export const getSuspiciousEvents = (params?: {
  page?: number; per_page?: number;
  ip?: string; event_type?: string; banned?: string;
}) => api.get('/suspicious-events', { params })
export const clearSuspiciousEvents = () => api.delete('/suspicious-events')

// Server
export const getServerStatus = () => api.get('/server/status')
export const getServices = () => api.get('/server/services')
export const startService = (name: string) => api.post(`/server/services/${name}/start`)
export const stopService = (name: string) => api.post(`/server/services/${name}/stop`)
export const restartService = (name: string) => api.post(`/server/services/${name}/restart`)
export const installService = (name: string) => api.post(`/server/services/${name}/install`)
export const getServiceLogs = (name: string, lines?: number) => api.get(`/server/services/${name}/logs`, { params: { lines } })
export const getServerLogs = (service?: string, lines?: number, search?: string) => api.get('/server/logs', { params: { service, lines, search } })
export const getServerConfig = () => api.get('/server/config')
export const updateServerConfig = (data: any) => api.put('/server/config', data)
export const getDatabaseInfo = () => api.get('/server/database-info')
// Backup & Restore
export const listBackups = () => api.get('/server/backups')
export const createBackup = () => api.post('/server/backups')
export const downloadBackup = (name: string) => api.get(`/server/backups/${encodeURIComponent(name)}`, { responseType: 'blob' })
export const deleteBackup = (name: string) => api.delete(`/server/backups/${encodeURIComponent(name)}`)
export const restoreBackup = (name: string) => api.post(`/server/backups/${encodeURIComponent(name)}/restore`)
// DB Engine
export const getDBEngines = () => api.get('/server/db-engines')
export const testDBConnection = (data: any) => api.post('/server/db-test', data)
export const startDBMigration = (data: any) => api.post('/server/db-migrate', data)
export const getMigrationJob = (id: string) => api.get(`/server/db-migrate/${id}`)
// System Updates
export const getUpdateInfo = () => api.get('/server/update/info')
export const triggerUpdate = () => api.post('/server/update')
export const getUpdateJob = (id: string, offset?: number) =>
  api.get(`/server/update/job/${id}`, { params: { offset } })

// Email
export const getEmailSettings = () => api.get('/email/settings')
export const updateEmailSettings = (data: any) => api.put('/email/settings', data)
export const sendTestEmail = (email: string) => api.post('/email/test', { email })

// Alerts
export const getActiveAlerts = () => api.get('/alerts/active')
export const getAlertHistory = (page?: number) => api.get('/alerts/history', { params: { page } })
export const getAlertRules = () => api.get('/alerts/rules')
export const updateAlertRule = (id: number, data: any) => api.put(`/alerts/rules/${id}`, data)
export const resolveAlert = (id: number) => api.post(`/alerts/resolve/${id}`)

// Admins
export const getAdmins = () => api.get('/admins')
export const createAdmin = (data: any) => api.post('/admins', data)
export const updateAdmin = (id: number, data: any) => api.put(`/admins/${id}`, data)
export const deleteAdmin = (id: number) => api.delete(`/admins/${id}`)
export const getPermissions = () => api.get('/admins/permissions')

// API Usage
export const getAPIUsageLogs = (params?: {
  page?: number
  per_page?: number
  api_key_id?: string
  method?: string
  status_code?: string
}) =>
  api.get('/api-usage', { params })
export const getAPIUsageStats = (hours?: number) => api.get('/api-usage/stats', { params: { hours } })
export const clearAPIUsageLogs = () => api.delete('/api-usage')

// Audit
export const getAuditLogs = (params?: { page?: number; action?: string; resource?: string; search?: string }) =>
  api.get('/audit-logs', { params })
export const deleteAuditLog = (id: number) => api.delete(`/audit-logs/${id}`)
export const clearAllAuditLogs = () => api.delete('/audit-logs')

// Settings
export const getSettings = () => api.get('/settings')
export const updateSettings = (data: any) => api.put('/settings', data)

// DNS Test & Server Identity
export const testDNS = (domain: string) => api.get('/dns-test', { params: { domain } })
export const getServerInfo = () => api.get('/server-info')
export const detectServerIP = () => api.post('/server-info/detect-ip')

// DNS Cache
export const getDNSCacheStatus = () => api.get('/dns/cache-status')
export const manualDNSReload = () => api.post('/dns/reload')

// Firewall
export const getFirewallRules = () => api.get('/firewall/rules')
export const addFirewallRule = (data: any) => api.post('/firewall/rules', data)
export const deleteFirewallRule = (id: number) => api.delete(`/firewall/rules/${id}`)
export const getSystemFirewallRules = (chain?: string) => api.get('/firewall/system', { params: { chain } })
export const syncFirewallRules = () => api.post('/firewall/sync')

// SSL
export const getSSLStatus = () => api.get('/ssl/status')
export const issueSSLCert = (domain?: string) => api.post('/ssl/issue', { domain })
export const getSSLJob = (jobId: string) => api.get(`/ssl/job/${jobId}`)
export const renewSSLCert = () => api.post('/ssl/renew')
export const getSSLAutoRenew = () => api.get('/ssl/auto-renew')
