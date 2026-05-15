import React, { useState } from 'react'
import {
  Card, Table, Tag, Typography, Button, Popconfirm, Space, message,
  Row, Col, Statistic, Input, Select, Tooltip,
} from 'antd'
import {
  ClearOutlined, ReloadOutlined, WarningOutlined, StopOutlined,
  ApiOutlined, GlobalOutlined, ClockCircleOutlined, LoginOutlined, KeyOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSuspiciousEvents, clearSuspiciousEvents, addIPBan } from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title, Text } = Typography

interface SuspiciousEvent {
  id: number
  ip: string
  event_type: string
  method: string
  path: string
  user_agent: string
  origin: string
  details: string
  banned: boolean
  created_at: string
}

interface ByTypeRow { event_type: string; count: number }
interface TopIPRow { ip: string; count: number }

const EVENT_LABEL: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  bad_api_key: { color: 'red',     label: 'Bad API Key', icon: <KeyOutlined /> },
  bad_origin:  { color: 'orange',  label: 'Bad Origin',  icon: <GlobalOutlined /> },
  bad_ip:      { color: 'volcano', label: 'Bad IP',      icon: <StopOutlined /> },
  rate_limit:  { color: 'gold',    label: 'Rate Limit',  icon: <ClockCircleOutlined /> },
  bad_login:   { color: 'magenta', label: 'Bad Login',   icon: <LoginOutlined /> },
  bad_token:   { color: 'purple',  label: 'Bad Token',   icon: <ApiOutlined /> },
  bad_path:    { color: 'geekblue',label: 'Bad Path',    icon: <WarningOutlined /> },
}

const SuspiciousActivityPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [filterIP, setFilterIP] = useState('')
  const [filterType, setFilterType] = useState<string | undefined>(undefined)
  const [filterBanned, setFilterBanned] = useState<string | undefined>(undefined)
  const queryClient = useQueryClient()
  const { isSuperAdmin } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['suspiciousEvents', page, filterIP, filterType, filterBanned],
    queryFn: () => getSuspiciousEvents({
      page,
      per_page: 50,
      ip: filterIP || undefined,
      event_type: filterType,
      banned: filterBanned,
    }).then(r => r.data),
  })

  const clearMut = useMutation({
    mutationFn: () => clearSuspiciousEvents(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['suspiciousEvents'] })
      message.success(`Cleared ${res.data.deleted} events`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const banMut = useMutation({
    mutationFn: (ip: string) => addIPBan({ ip, reason: 'manual ban from suspicious activity' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suspiciousEvents'] })
      queryClient.invalidateQueries({ queryKey: ['ipBans'] })
      message.success('IP banned')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const events: SuspiciousEvent[] = data?.data || []
  const total: number = data?.total || 0
  const byType: ByTypeRow[] = data?.stats?.by_type_24h || []
  const topIPs: TopIPRow[] = data?.stats?.top_ips_24h || []
  const totalLast24h = byType.reduce((sum, r) => sum + r.count, 0)
  const bannedHits = events.filter(e => e.banned).length

  const columns = [
    {
      title: 'Time', dataIndex: 'created_at', key: 'time', width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: 150,
      render: (v: string) => <code>{v}</code>,
    },
    {
      title: 'Event', dataIndex: 'event_type', key: 'event_type', width: 150,
      render: (v: string) => {
        const meta = EVENT_LABEL[v] || { color: 'default', label: v, icon: <WarningOutlined /> }
        return <Tag color={meta.color} icon={meta.icon}>{meta.label}</Tag>
      },
    },
    {
      title: 'Method', dataIndex: 'method', key: 'method', width: 80,
      render: (v: string) => v ? <code>{v}</code> : '—',
    },
    {
      title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'User-Agent', dataIndex: 'user_agent', key: 'ua', ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text type="secondary" style={{ fontSize: 12 }}>{v ? v.slice(0, 30) + (v.length > 30 ? '...' : '') : '—'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Banned?', dataIndex: 'banned', key: 'banned', width: 100,
      render: (v: boolean) => v
        ? <Tag color="red" icon={<StopOutlined />}>Banned</Tag>
        : <Tag>Logged</Tag>,
    },
    {
      title: 'Action', key: 'action', width: 110, fixed: 'right' as const,
      render: (_: any, record: SuspiciousEvent) => (
        <Popconfirm
          title={`Ban ${record.ip} now?`}
          onConfirm={() => banMut.mutate(record.ip)}
          okType="danger"
        >
          <Button size="small" danger disabled={record.banned}>
            {record.banned ? 'Banned' : 'Ban IP'}
          </Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Suspicious Activity</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['suspiciousEvents'] })}
          >
            Refresh
          </Button>
          {isSuperAdmin && (
            <Popconfirm
              title="Clear ALL suspicious events?"
              description="This is just the log — active IP bans are not affected."
              onConfirm={() => clearMut.mutate()}
              okType="danger"
              okText="Yes, clear log"
            >
              <Button danger icon={<ClearOutlined />} loading={clearMut.isPending}>
                Clear Log
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Anything the auto-ban engine considers suspicious is recorded here. Crossing the
        threshold configured in <strong>Settings → Security</strong> turns the entry into a
        real IP ban (and optionally a firewall rule).
      </Text>

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Events (24h)" value={totalLast24h}
              valueStyle={{ color: '#faad14', fontSize: 20 }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Banned hits (page)" value={bannedHits}
              valueStyle={{ color: '#ff4d4f', fontSize: 20 }} prefix={<StopOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" title="By Type (24h)" styles={{ body: { padding: 12 } }}>
            {byType.length === 0
              ? <Text type="secondary" style={{ fontSize: 12 }}>No events</Text>
              : byType.slice(0, 4).map(r => (
                  <div key={r.event_type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{EVENT_LABEL[r.event_type]?.label || r.event_type}</span>
                    <strong>{r.count}</strong>
                  </div>
                ))
            }
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card size="small" title="Top IPs (24h)" styles={{ body: { padding: 12 } }}>
            {topIPs.length === 0
              ? <Text type="secondary" style={{ fontSize: 12 }}>No events</Text>
              : topIPs.slice(0, 4).map(r => (
                  <div key={r.ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <code>{r.ip}</code>
                    <strong>{r.count}</strong>
                  </div>
                ))
            }
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Filter by IP"
            value={filterIP}
            onChange={e => { setFilterIP(e.target.value); setPage(1) }}
            allowClear
            style={{ width: 200 }}
          />
          <Select
            placeholder="Event type"
            value={filterType}
            onChange={v => { setFilterType(v); setPage(1) }}
            allowClear
            style={{ width: 180 }}
            options={Object.entries(EVENT_LABEL).map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Select
            placeholder="Banned?"
            value={filterBanned}
            onChange={v => { setFilterBanned(v); setPage(1) }}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'true', label: 'Banned' },
              { value: 'false', label: 'Just logged' },
            ]}
          />
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={events}
          loading={isLoading}
          rowKey="id"
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: t => `Total ${t} events`,
          }}
          scroll={{ x: 1100 }}
          size="small"
          rowClassName={(record) => record.banned ? 'row-banned' : ''}
        />
      </Card>
    </div>
  )
}

export default SuspiciousActivityPage
