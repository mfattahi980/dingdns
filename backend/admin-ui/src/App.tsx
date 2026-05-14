import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { AuthProvider, useAuth } from './core/auth'
import AdminLayout from './core/Layout'
import LoginPage from './core/LoginPage'

// Lazy load modules
const Dashboard = lazy(() => import('./modules/dashboard/DashboardPage'))
const Zones = lazy(() => import('./modules/dns/ZonesPage'))
const ZoneRecords = lazy(() => import('./modules/dns/RecordsPage'))
const DDNSTokens = lazy(() => import('./modules/dns/DDNSTokensPage'))
const APIKeys = lazy(() => import('./modules/apikeys/APIKeysPage'))
const APIUsage = lazy(() => import('./modules/apikeys/APIUsagePage'))
const IPBans = lazy(() => import('./modules/security/IPBansPage'))
const LoginAttempts = lazy(() => import('./modules/security/LoginAttemptsPage'))
const Firewall = lazy(() => import('./modules/security/FirewallPage'))
const ServerStatus = lazy(() => import('./modules/server/ServerStatusPage'))
const ServerServices = lazy(() => import('./modules/server/ServicesPage'))
const ServerLogs = lazy(() => import('./modules/server/LogsPage'))
const ServerConfig = lazy(() => import('./modules/server/ConfigPage'))
const ServerBackup = lazy(() => import('./modules/server/BackupPage'))
const EmailSettings = lazy(() => import('./modules/email/EmailPage'))
const ActiveAlerts = lazy(() => import('./modules/alerts/ActiveAlertsPage'))
const AlertRules = lazy(() => import('./modules/alerts/AlertRulesPage'))
const AlertHistory = lazy(() => import('./modules/alerts/AlertHistoryPage'))
const AdminsList = lazy(() => import('./modules/admins/AdminsPage'))
const AuditLogs = lazy(() => import('./modules/audit/AuditPage'))
const SettingsGeneral = lazy(() => import('./modules/settings/SettingsPage'))
const SettingsSecurity = lazy(() => import('./modules/settings/SettingsSecurityPage'))
const SettingsDNSCache = lazy(() => import('./modules/settings/DNSCachePage'))
const DNSTest = lazy(() => import('./modules/dns/DNSTestPage'))
const SSLManagement = lazy(() => import('./modules/server/SSLPage'))
const SystemUpdates = lazy(() => import('./modules/server/UpdatesPage'))
const AccountProfile = lazy(() => import('./modules/account/ProfilePage'))
const AccountSecurity = lazy(() => import('./modules/account/SecurityPage'))
const AccountSessions = lazy(() => import('./modules/account/SessionsPage'))

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
    <Spin size="large" />
  </div>
)

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

const AppRouter: React.FC = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />

            {/* DNS — paths match backend menu exactly */}
            <Route path="dns/zones" element={<Zones />} />
            <Route path="dns/zones/:id/records" element={<ZoneRecords />} />
            <Route path="dns/ddns" element={<DDNSTokens />} />
            <Route path="dns/test" element={<DNSTest />} />

            {/* API Keys */}
            <Route path="apikeys" element={<APIKeys />} />
            <Route path="apikeys/usage" element={<APIUsage />} />

            {/* Security */}
            <Route path="security/ip-bans" element={<IPBans />} />
            <Route path="security/login-attempts" element={<LoginAttempts />} />
            <Route path="security/firewall" element={<Firewall />} />

            {/* Server */}
            <Route path="server/status" element={<ServerStatus />} />
            <Route path="server/services" element={<ServerServices />} />
            <Route path="server/logs" element={<ServerLogs />} />
            <Route path="server/config" element={<ServerConfig />} />
            <Route path="server/backup" element={<ServerBackup />} />
            <Route path="server/ssl" element={<SSLManagement />} />
            <Route path="server/updates" element={<SystemUpdates />} />

            {/* Email — backend sends /email/settings & /email/test */}
            <Route path="email/settings" element={<EmailSettings />} />
            <Route path="email/test" element={<EmailSettings />} />

            {/* Alerts */}
            <Route path="alerts/active" element={<ActiveAlerts />} />
            <Route path="alerts/rules" element={<AlertRules />} />
            <Route path="alerts/history" element={<AlertHistory />} />

            {/* Admins */}
            <Route path="admins" element={<AdminsList />} />

            {/* Audit */}
            <Route path="audit" element={<AuditLogs />} />

            {/* Settings — backend sends /settings/general & /settings/security */}
            <Route path="settings/general" element={<SettingsGeneral />} />
            <Route path="settings/security" element={<SettingsSecurity />} />
            <Route path="settings/dns-cache" element={<SettingsDNSCache />} />

            {/* Account */}
            <Route path="account" element={<AccountProfile />} />
            <Route path="account/security" element={<AccountSecurity />} />
            <Route path="account/sessions" element={<AccountSessions />} />
          </Route>

          <Route pa