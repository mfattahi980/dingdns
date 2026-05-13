import React, { useState } from 'react'
import { Layout, Menu, Avatar, Dropdown, Badge, Space, Typography } from 'antd'
import {
  DashboardOutlined, GlobalOutlined, KeyOutlined, SafetyOutlined,
  CloudServerOutlined, MailOutlined, AlertOutlined, TeamOutlined,
  AuditOutlined, SettingOutlined, LogoutOutlined, UserOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SwapOutlined, StopOutlined,
  LoginOutlined, AppstoreOutlined, FileTextOutlined, CloudDownloadOutlined,
  SendOutlined, HistoryOutlined, BellOutlined, LockOutlined,
  SearchOutlined, SafetyCertificateOutlined, DatabaseOutlined,
  ReloadOutlined, ApiOutlined, LinkOutlined, InfoCircleOutlined,
  FireOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth'
import { getMenu, getActiveAlerts, logout as apiLogout } from './api'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const iconMap: Record<string, React.ReactNode> = {
  DashboardOutlined: <DashboardOutlined />,
  GlobalOutlined: <GlobalOutlined />,
  KeyOutlined: <KeyOutlined />,
  SafetyOutlined: <SafetyOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
  MailOutlined: <MailOutlined />,
  AlertOutlined: <AlertOutlined />,
  TeamOutlined: <TeamOutlined />,
  AuditOutlined: <AuditOutlined />,
  SettingOutlined: <SettingOutlined />,
  SwapOutlined: <SwapOutlined />,
  StopOutlined: <StopOutlined />,
  LoginOutlined: <LoginOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  CloudDownloadOutlined: <CloudDownloadOutlined />,
  SendOutlined: <SendOutlined />,
  HistoryOutlined: <HistoryOutlined />,
  LockOutlined: <LockOutlined />,
  BellOutlined: <BellOutlined />,
  // New icons for added pages
  SearchOutlined: <SearchOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  DatabaseOutlined: <DatabaseOutlined />,
  ReloadOutlined: <ReloadOutlined />,
  ApiOutlined: <ApiOutlined />,
  LinkOutlined: <LinkOutlined />,
  InfoCircleOutlined: <InfoCircleOutlined />,
  FireOutlined: <FireOutlined />,
}

const AdminLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false)
  const [manualOpenKeys, setManualOpenKeys] = useState<string[] | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { admin, logout } = useAuth()

  const { data: menuData } = useQuery({
    queryKey: ['menu'],
    queryFn: () => getMenu().then(r => r.data.menu),
  })

  const { data: alertsData } = useQuery({
    queryKey: ['activeAlerts'],
    queryFn: () => getActiveAlerts().then(r => r.data.alerts),
    refetchInterval: 60000,
  })

  const alertCount = alertsData?.length || 0

  const buildMenuItems = (modules: any[]): any[] => {
    if (!modules) return []
    return modules.map((mod: any) => ({
      key: mod.id,
      icon: iconMap[mod.icon] || <SettingOutlined />,
      label: mod.name,
      children: mod.children?.map((item: any) => ({
        key: item.path,
        icon: iconMap[item.icon] || null,
        label: item.label,
      })),
    }))
  }

  const handleMenuClick = (e: any) => {
    navigate(e.key)
  }

  const handleLogout = async () => {
    try { await apiLogout() } catch {}
    logout()
    navigate('/login')
  }

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: 'My Account', onClick: () => navigate('/account') },
      { key: 'security', icon: <LockOutlined />, label: 'Security', onClick: () => navigate('/account/security') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout, danger: true },
    ],
  }

  // Find current selected key — location.pathname is without basename
  const currentPath = location.pathname
  const selectedKeys = [currentPath]
  // Auto-open the module that contains the current route
  const autoOpenKeys = (menuData || [])
    .filter((m: any) => m.children?.some((c: any) => currentPath === c.path || currentPath.startsWith(c.path + '/')))
    .map((m: any) => m.id)
  // Use manual override if set, otherwise auto-detect
  const openKeys = manualOpenKeys ?? autoOpenKeys

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        theme="dark"
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span style={{
            color: '#1668dc',
            fontSize: collapsed ? 20 : 24,
            fontWeight: 700,
            letterSpacing: 1,
          }}>
            {collapsed ? 'DD' : 'DingDns'}
          </span>
          {!collapsed && (
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8, color: 'rgba(255,255,255,0.45)' }}>
              Admin
            </Text>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={(keys) => setManualOpenKeys(keys as string[])}
          items={buildMenuItems(menuData)}
          onClick={handleMenuClick}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: '#141414',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #303030',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: 'pointer', color: 'rgba(255,255,255,0.65)' },
            })}
          </div>

          <Space size={20}>
            <Badge count={alertCount} size="small">
              <BellOutlined
                style={{ fontSize: 18, cursor: 'pointer', color: 'rgba(255,255,255,0.65)' }}
                onClick={() => navigate('/alerts/active')}
              />
            </Badge>

            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" style={{ backgroundColor: '#1668dc' }}>
                  {admin?.username?.[0]?.toUpperCase() || 'A'}
                </Avatar>
                <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{admin?.username}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: 24,
          minHeight: 'calc(100vh - 112px)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default AdminLayout
