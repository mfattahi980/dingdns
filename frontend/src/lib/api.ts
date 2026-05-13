import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (email: string, password: string, totpCode?: string, captchaId?: string, captchaAnswer?: string) =>
  api.post('/auth/login', { email, password, totp_code: totpCode, captcha_id: captchaId, captcha_answer: captchaAnswer })

export const register = (email: string, password: string, captchaId?: string, captchaAnswer?: string) =>
  api.post('/auth/register', { email, password, captcha_id: captchaId, captcha_answer: captchaAnswer })

export const resendVerification = (email: string) =>
  api.post('/auth/resend-verification', { email })

// Public settings
export const getPublicSettings = () => api.get('/settings/public')
export const getCaptcha = () => api.get('/captcha')

export const getProfile = () => api.get('/auth/profile')

export const changePassword = (oldPassword: string, newPassword: string) =>
  api.put('/auth/password', { old_password: oldPassword, new_password: newPassword })

// Zones
export const getZones = () => api.get('/zones')
export const getZone = (id: number) => api.get(`/zones/${id}`)
export const createZone = (name: string) => api.post('/zones', { name })
export const updateZone = (id: number, data: any) => api.put(`/zones/${id}`, data)
export const deleteZone = (id: number) => api.delete(`/zones/${id}`)

// Records
export const getRecords = (zoneId: number) => api.get(`/records/zone/${zoneId}`)
export const createRecord = (zoneId: number, data: any) => api.post(`/records/zone/${zoneId}`, data)
export const updateRecord = (_zoneId: number, id: number, data: any) => api.put(`/records/${id}`, data)
export const deleteRecord = (_zoneId: number, id: number) => api.delete(`/records/${id}`)

// DDNS
export const getDDNSTokens = () => api.get('/ddns/tokens')
export const createDDNSToken = (recordId: number, label: string) =>
  api.post('/ddns/tokens', { record_id: recordId, label })
export const deleteDDNSToken = (id: number) => api.delete(`/ddns/tokens/${id}`)

// Admin
export const getUsers = () => api.get('/admin/users')
export const createUser = (data: any) => api.post('/admin/users', data)
export const updateUser = (id: number, data: any) => api.put(`/admin/users/${id}`, data)
export const deleteUser = (id: number) => api.delete(`/admin/users/${id}`)
export const getStats = () => api.get('/admin/stats')
export const getAuditLogs = (page: number = 1) => api.get(`/admin/audit-logs?page=${page}`)

// Security
export const getSecurityStatus = () => api.get('/security/status')
export const getIPAllowlist = () => api.get('/security/ip-allowlist')
export const addIPAllowlist = (ip: string, label: string) =>
  api.post('/security/ip-allowlist', { ip, label })
export const deleteIPAllowlist = (id: number) => api.delete(`/security/ip-allowlist/${id}`)
export const toggleIPRestriction = (enabled: boolean) =>
  api.put('/security/ip-restriction', { enabled })
export const setup2FA = () => api.post('/security/2fa/setup')
export const verify2FA = (code: string) => api.post('/security/2fa/verify', { code })
export const disable2FA = (password: string) => api.post('/security/2fa/disable', { password })
export const getSessions = () => api.get('/security/sessions')
export const revokeSession = (id: number) => api.delete(`/security/sessions/${id}`)

// Admin - IP Bans
export const getIPBans = () => api.get('/admin/ip-bans')
export const addIPBan = (ip: string, reason: string, expiresIn: number) =>
  api.post('/admin/ip-bans', { ip, reason, expires_in: expiresIn })
export const deleteIPBan = (id: number) => api.delete(`/admin/ip-bans/${id}`)
export const getLoginAttempts = (page: number = 1) => api.get(`/admin/login-attempts?page=${page}`)

// Admin settings
export const getAdminSettings = () => api.get('/admin/settings')
export const updateAdminSettings = (settings: Record<string, string>) =>
  api.put('/admin/settings', settings)
export const sendTestEmail = (email: string) =>
  api.post('/admin/settings/test-email', { email })

export default api
