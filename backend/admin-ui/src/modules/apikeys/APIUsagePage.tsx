import React, { useState } from 'react'
import {
  Card, Table, Tag, Typography, Select, Space, Button, Popconfirm, message,
  Statistic, Row, Col, Switch, Alert, Progress,
} from 'antd'
import {
  ApiOutlined, ReloadOutlined, ClearOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAPIUsageLogs, getAPIUsageStats, clearAPIUsageLogs, getSettings, updateSettings } from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title, Text } = Typography

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const STATUS_OPTIONS = ['200', '201', '400', '401', '403', '404', '500']

const methodColor: Record<string, string> = {
  GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red', PATCH: 'purple',
}

const APIUsagePage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [filterKey] = useState<string>()
  const [filterMethod, setFilterMethod] = useState<string>()
  const [filterStatus, setFilterStatus] = useState<string>()
  const [hours, setHours] = useState(24)
  const queryClient = useQueryClient()
  const { isSuperAdmin } = useAuth()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['apiUsageStats', hours],
    queryFn: () => getAPIUsageStats(hours).then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['apiUsageLogs', page, filterKey, filterMethod, filterStatus],
    queryFn: () => getAPIUsageLogs({ page, api_key_id: filterKey, method: filterMethod, status_code: filterStatus }).then(r => r.data),
  })

  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => r.data),
  })

  const loggingEnabled = settingsData?.api_usage_log_enabled !== 'false'

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => updateSettings({ api_usage_log_enabled: enabled ? 'true' : 'false' }),
    onSuccess: () => { refetchSettings(); message.success('Setting updated') },
  })

  const clearMut = useMutation({
    mutationFn: () => clearAPIUsageLogs(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['apiUsageLogs', 'apiUsageStats'] })
      message.success(`Cleared ${res.data.deleted} log entries`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to clear'),
  })

  const logs: any[] = logsData?.logs ?? []
  const total: number = logsData?.total ?? 0

  const columns = [
    {
      title: 'Time', dataIndex: 'created_at', key: 'time', width: 150,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'API Key', dataIndex: 'api_key_name', key: 'key', width: 140,
      render: (v: string) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Method', dataIndex: 'method', key: 'method', width: 80,
      render: (v: string) => <Tag color={methodColor[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Status', dataIndex: 'status_code', key: 'status', width: 80,
      render: (v: number) => (
        <Tag color={v < 300 ? 'green' : v < 400 ? 'blue' : v < 500 ? 'orange' : 'red'}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Duration', dataIndex: 'duration_ms', key: 'dur', width: 90,
      render: (v: number) => (
        <Text style={{ color: v > 1000 ? '#ff4d4f' : v > 300 ? '#faad14' : '#52c41a' }}>
          {v}ms
        </Text>
      ),
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: 120,
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ApiOutlined style={{ fontSize: 22, color: '#1890ff' }} />
          <Title level={3} style={{ margin: 0 }}>API Usage</Title>
          <Tag color={loggingEnabled ? 'green' : 'default'}>
            {loggingEnabled ? 'Logging ON' : 'Logging OFF'}
          </Tag>
        </div>
        <Space>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Logging:</span>
          <Switch
            checked={loggingEnabled}
            onChange={v => toggleMut.mutate(v)}
            loading={toggleMut.isPending}
            checkedChildren="ON"
            unCheckedChildren="OFF"
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['apiUsageLogs', 'apiUsageStats'] })}
            loading={statsLoading}
          >
            Refresh
          </Button>
          {isSuperAdmin && (
            <Popconfirm
              title="Clear ALL API usage logs?"
              onConfirm={() => clearMut.mutate()}
              okType="danger"
              okText="Yes, clear all"
            >
              <Button danger icon={<ClearOutlined />} loading={clearMut.isPending}>
                Clear All
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {!loggingEnabled && (
        <Alert
          type="warning"
          showIcon
          message="API Usage logging is disabled. Enable it above to start recording requests."
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

      {/* Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={`Requests (${hours}h)`}
              value={stats?.total_requests ?? '—'}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Errors"
              value={stats?.total_errors ?? '—'}
              valueStyle={{ color: (stats?.total_errors ?? 0) > 0 ? '#ff4d4f' : undefined }}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Error Rate"
              value={stats?.error_rate != null ? stats.error_rate.toFixed(1) : '—'}
              suffix="%"
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Avg Response"
              value={stats?.avg_duration_ms != null ? Math.round(stats.avg_duration_ms) : '—'}
              suffix="ms"
              loading={statsLoading}
            />
          </Card>
        </Col>
      </Row>

      {/* Top keys & paths */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {stats?.top_keys?.length > 0 && (
          <Col xs={24} md={12}>
            <Card size="small" title="Top API Keys" extra={
              <Select size="small" value={hours} onChange={setHours} style={{ width: 90 }}
                options={[{value:1,label:'1h'},{value:6,label:'6h'},{value:24,label:'24h'},{value:168,label:'7d'}]}
              />
            }>
              {stats.top_keys.map((k: any) => (
                <div key={k.api_key_id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ width: 160, fontSize: 12 }} ellipsis>{k.api_key_name}</Text>
                  <Progress
                    percent={Math.round((k.requests / (stats.total_requests || 1)) * 100)}
                    size="small" style={{ flex: 1, margin: '0 8px' }}
                    format={() => `${k.requests}`}
                  />
                </div>
              ))}
            </Card>
          </Col>
        )}
        {stats?.top_paths?.length > 0 && (
          <Col xs={24} md={12}>
            <Card size="small" title="Top Endpoints">
              {stats.top_paths.map((p: any) => (
                <div key={p.path} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <Text code style={{ width: 200, fontSize: 11 }} ellipsis>{p.path}</Text>
                  <Progress
                    percent={Math.round((p.requests / (stats.total_requests || 1)) * 100)}
                    size="small" style={{ flex: 1, margin: '0 8px' }}
                    format={() => `${p.requests}`}
                  />
                </div>
              ))}
            </Card>
          </Col>
        )}
      </Row>

      {/* Log table */}
      <Card title={<Space><ApiOutlined /><span>Request Log</span><Tag>{total.toLocaleString()} total</Tag></Space>}>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            placeholder="Filter by method"
            allowClear
            value={filterMethod}
            onChange={v => { setFilterMethod(v); setPage(1) }}
            style={{ width: 130 }}
            options={METHODS.map(m => ({ value: m, label: m }))}
          />
          <Select
            placeholder="Filter by status"
            allowClear
            value={filterStatus}
            onChange={v => { setFilterStatus(v); setPage(1) }}
            style={{ width: 130 }}
            options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={logs}
          loading={logsLoading}
          rowKey="id"
          size="small"
          scroll={{ x: 900 }}
          pagination={{
            current: page, total, pageSize: 50,
            onChange: setPage,
            showTotal: t => `Total ${t} entries`,
          }}
        />
      </Card>
    </div>
  )
}

export default APIUsagePage
