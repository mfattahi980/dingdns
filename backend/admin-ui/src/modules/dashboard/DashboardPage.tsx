import React from 'react'
import { Card, Row, Col, Statistic, Table, Tag, Typography } from 'antd'
import {
  GlobalOutlined, FileTextOutlined, KeyOutlined, SwapOutlined,
  StopOutlined, TeamOutlined
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { getStats, getRecentActivity } from '../../core/api'

const { Title } = Typography

const statCards = [
  { key: 'zones', label: 'DNS Zones', icon: <GlobalOutlined />, color: '#1668dc' },
  { key: 'records', label: 'DNS Records', icon: <FileTextOutlined />, color: '#52c41a' },
  { key: 'ddns_tokens', label: 'DDNS Tokens', icon: <SwapOutlined />, color: '#faad14' },
  { key: 'api_keys', label: 'API Keys', icon: <KeyOutlined />, color: '#722ed1' },
  { key: 'ip_bans', label: 'IP Bans', icon: <StopOutlined />, color: '#f5222d' },
  { key: 'admins', label: 'Admins', icon: <TeamOutlined />, color: '#13c2c2' },
]

const activityColumns = [
  { title: 'Time', dataIndex: 'created_at', key: 'time', width: 180,
    render: (v: string) => new Date(v).toLocaleString() },
  { title: 'User', dataIndex: 'user_id', key: 'admin', width: 80 },
  { title: 'Action', dataIndex: 'action', key: 'action', width: 150,
    render: (v: string) => {
      const colors: Record<string, string> = { create: 'green', update: 'blue', delete: 'red', login: 'cyan', logout: 'orange' }
      const base = v?.split('_')[0]
      return <Tag color={colors[base] || 'default'}>{v}</Tag>
    }
  },
  { title: 'Resource', dataIndex: 'resource', key: 'resource', width: 100 },
  { title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true },
]

const DashboardPage: React.FC = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => getStats().then(r => r.data), // returns flat object
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['recentActivity'],
    queryFn: () => getRecentActivity().then(r => r.data.activity || []), // key is "activity"
  })

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Dashboard</Title>

      <Row gutter={[16, 16]}>
        {statCards.map(sc => (
          <Col xs={12} sm={8} md={6} key={sc.key}>
            <Card>
              <Statistic
                title={sc.label}
                value={statsLoading ? '-' : (stats?.[sc.key] ?? 0)}
                prefix={sc.icon}
                valueStyle={{ color: sc.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Recent Activity" style={{ marginTop: 24 }}>
        <Table
          columns={activityColumns}
          dataSource={activity || []}
          loading={activityLoading}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 15 }}
          scroll={{ x: 700 }}
          locale={{ emptyText: 'No recent activity' }}
        />
      </Card>
    </div>
  )
}

export default DashboardPage
