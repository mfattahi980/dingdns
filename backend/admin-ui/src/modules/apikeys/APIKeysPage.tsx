import React, { useState, useMemo } from 'react'
import {
  App, Card, Table, Button, Modal, Form, Input, Tag, Space, Typography,
  Popconfirm, Switch, Tooltip, Drawer, Descriptions, Statistic, Row, Col,
  Select, Divider, Empty, Pagination, Badge,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, CheckOutlined,
  SafetyOutlined, EyeOutlined, EyeInvisibleOutlined, InfoCircleOutlined,
  ReloadOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAPIKeys, createAPIKey, updateAPIKey, deleteAPIKey,
  getAPIUsageLogs, getAPIUsageStats,
} from '../../core/api'

const { Title, Text } = Typography

// Format a UTC ISO string as a short relative time like "12s ago" / "3m ago".
// We render the full timestamp in a tooltip alongside this for precision.
function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  if (diff < 0) return 'in the future'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

// Antd Tag color per HTTP method. Keep these tame — the column is dense.
function methodColor(m?: string): string {
  switch ((m || '').toUpperCase()) {
    case 'GET':    return 'blue'
    case 'POST':   return 'green'
    case 'PUT':    return 'gold'
    case 'PATCH':  return 'cyan'
    case 'DELETE': return 'red'
    case 'OPTIONS':return 'default'
    default:       return 'default'
  }
}

// Antd Badge status per HTTP status range.
function statusBadge(code?: number): 'success' | 'processing' | 'warning' | 'error' | 'default' {
  if (!code) return 'default'
  if (code >= 500) return 'error'
  if (code >= 400) return 'warning'
  if (code >= 300) return 'processing'
  if (code >= 200) return 'success'
  return 'default'
}

const APIKeysPage: React.FC = () => {
  // Use App.useApp().message so toasts pick up the ConfigProvider theme
  // (static `import { message } from 'antd'` warns in v5 and renders
  // outside the React tree — invisible to users in some environments).
  const { message } = App.useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copiedRowId, setCopiedRowId] = useState<number | null>(null)
  const [newKeyCopied, setNewKeyCopied] = useState(false)
  // View-drawer state
  const [viewKey, setViewKey] = useState<any | null>(null)
  const [revealKey, setRevealKey] = useState(false)
  const [drawerKeyCopied, setDrawerKeyCopied] = useState(false)
  // Usage table state (inside the drawer)
  const [usagePage, setUsagePage] = useState(1)
  const [usagePerPage, setUsagePerPage] = useState(10)
  const [usageMethod, setUsageMethod] = useState<string | undefined>()
  const [usageStatus, setUsageStatus] = useState<string | undefined>()
  const [statsHours, setStatsHours] = useState(24)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  // Writes text to clipboard with a fallback for non-secure contexts
  // (e.g. plain http://… in dev). Returns whether the copy succeeded.
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  // Copy handler for the table row icon — flashes a Check icon for 2s
  // next to the row that was clicked (`rowId`) AND shows a toast.
  const handleRowCopy = async (rowId: number, value: string) => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopiedRowId(rowId)
      message.success('Copied to clipboard')
      setTimeout(() => setCopiedRowId(curr => (curr === rowId ? null : curr)), 2000)
    } else {
      message.error('Copy failed')
    }
  }

  // Copy handler for the "API Key Created" modal — flips the button to
  // a Check + "Copied!" label for 2s, plus toast.
  const handleNewKeyCopy = async (value: string) => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setNewKeyCopied(true)
      message.success('Copied to clipboard')
      setTimeout(() => setNewKeyCopied(false), 2000)
    } else {
      message.error('Copy failed')
    }
  }

  // Copy handler for the View-drawer's full-key field.
  const handleDrawerKeyCopy = async (value: string) => {
    const ok = await copyToClipboard(value)
    if (ok) {
      setDrawerKeyCopied(true)
      message.success('Copied to clipboard')
      setTimeout(() => setDrawerKeyCopied(false), 2000)
    } else {
      message.error('Copy failed')
    }
  }

  // Open the View drawer for a given key row.
  const openViewDrawer = (record: any) => {
    setViewKey(record)
    setRevealKey(false)
    setDrawerKeyCopied(false)
    setUsagePage(1)
    setUsagePerPage(10)
    setUsageMethod(undefined)
    setUsageStatus(undefined)
    setStatsHours(24)
  }

  const closeViewDrawer = () => {
    setViewKey(null)
    setRevealKey(false)
  }

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => getAPIKeys().then(r => {
      // backend returns plain array
      return Array.isArray(r.data) ? r.data : (r.data.keys || [])
    }),
  })

  // Per-key usage logs query — only enabled when the drawer is open.
  // Paginated; the server filters by api_key_id, method, and status_code.
  const {
    data: usageData,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = useQuery({
    enabled: !!viewKey,
    queryKey: ['apiKeyUsage', viewKey?.id, usagePage, usagePerPage, usageMethod, usageStatus],
    queryFn: () => getAPIUsageLogs({
      api_key_id: String(viewKey.id),
      page: usagePage,
      per_page: usagePerPage,
      ...(usageMethod ? { method: usageMethod } : {}),
      ...(usageStatus ? { status_code: usageStatus } : {}),
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  // Per-key usage stats (aggregated over `statsHours` window). Same enable
  // gate. We use this only to surface a small headline summary at the top of
  // the drawer (total requests, errors, avg duration) since the stats
  // endpoint doesn't natively filter by key id, we derive a slice client-side.
  const {
    data: usageStats,
    isFetching: statsFetching,
  } = useQuery({
    enabled: !!viewKey,
    queryKey: ['apiKeyUsageStats', viewKey?.id, statsHours],
    queryFn: () => getAPIUsageStats(statsHours).then(r => r.data),
  })

  // The stats endpoint returns top_keys aggregated across all keys; pluck
  // the row for the currently-viewed key (may be undefined if the key had
  // no traffic in the window).
  const keyStatRow = useMemo(() => {
    if (!usageStats || !viewKey) return null
    const list: Array<{ api_key_id: number; api_key_name: string; requests: number }> =
      usageStats.top_keys || []
    return list.find(k => k.api_key_id === viewKey.id) || null
  }, [usageStats, viewKey])

  const createMut = useMutation({
    mutationFn: (data: any) => createAPIKey(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      setModalOpen(false)
      setNewKey(res.data.key)
      message.success('API key created')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => updateAPIKey(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      setModalOpen(false)
      setEditing(null)
      message.success('Updated')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAPIKey(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['apiKeys'] }); message.success('Deleted') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Key', dataIndex: 'key', key: 'key', width: 200, ellipsis: true,
      render: (v: string, record: any) => {
        const justCopied = copiedRowId === record.id
        return (
          <Space>
            <Text code style={{ fontSize: 12 }}>{v?.substring(0, 16)}...</Text>
            <Tooltip title={justCopied ? 'Copied!' : 'Copy key'} open={justCopied || undefined}>
              {justCopied
                ? <CheckOutlined style={{ color: '#52c41a', cursor: 'pointer' }} onClick={() => handleRowCopy(record.id, v)} />
                : <CopyOutlined style={{ cursor: 'pointer' }} onClick={() => handleRowCopy(record.id, v)} />}
            </Tooltip>
          </Space>
        )
      }
    },
    { title: 'Origins', dataIndex: 'allowed_origins', key: 'origins', ellipsis: true,
      render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">All</Text> },
    { title: 'IP Allowlist', dataIndex: 'allowed_ips', key: 'allowed_ips', ellipsis: true,
      render: (v: string) => v
        ? <Tooltip title={v}><Tag color="blue" icon={<SafetyOutlined />}>{v.split(',').length} IP{v.split(',').length > 1 ? 's' : ''}</Tag></Tooltip>
        : <Text type="secondary">All IPs</Text>
    },
    { title: 'Active', dataIndex: 'is_active', key: 'active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'Last Used', dataIndex: 'last_used', key: 'last_used', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString() : 'Never' },
    { title: 'Actions', key: 'actions', width: 160,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="View details & usage">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openViewDrawer(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />}
              onClick={() => { setEditing(record); form.setFieldsValue({ name: record.name, allowed_origins: record.allowed_origins, allowed_ips: record.allowed_ips, is_active: record.is_active }); setModalOpen(true) }} />
          </Tooltip>
          <Popconfirm title="Delete?" onConfirm={() => deleteMut.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>API Keys</Title>
        <Button type="primary" icon={<PlusOutlined />}
          onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true) }}>
          Create Key
        </Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={keys || []} loading={isLoading} rowKey="id" scroll={{ x: 800 }} />
      </Card>

      {newKey && (
        <Modal title="API Key Created" open={!!newKey}
          onOk={() => { setNewKey(null); setNewKeyCopied(false) }}
          onCancel={() => { setNewKey(null); setNewKeyCopied(false) }}
          cancelButtonProps={{ style: { display: 'none' } }}>
          <p>Copy this key now — it won't be shown again:</p>
          <Input.TextArea value={newKey} readOnly rows={2} style={{ fontFamily: 'monospace' }} />
          <Button
            icon={newKeyCopied ? <CheckOutlined /> : <CopyOutlined />}
            type={newKeyCopied ? 'primary' : 'default'}
            style={{ marginTop: 8 }}
            onClick={() => handleNewKeyCopy(newKey)}
          >
            {newKeyCopied ? 'Copied!' : 'Copy'}
          </Button>
        </Modal>
      )}

      {/* ─── View drawer: full info, key reveal, copy, usage history ─── */}
      <Drawer
        width={Math.min(960, typeof window !== 'undefined' ? window.innerWidth - 80 : 960)}
        title={
          viewKey ? (
            <Space>
              <InfoCircleOutlined />
              <span>API Key: <Text code>{viewKey.name}</Text></span>
              <Tag color={viewKey.is_active ? 'green' : 'red'}>
                {viewKey.is_active ? 'Active' : 'Inactive'}
              </Tag>
            </Space>
          ) : 'API Key'
        }
        open={!!viewKey}
        onClose={closeViewDrawer}
        destroyOnClose
      >
        {viewKey && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="ID" span={1}>{viewKey.id}</Descriptions.Item>
              <Descriptions.Item label="Created" span={1}>
                {viewKey.created_at ? new Date(viewKey.created_at).toLocaleString() : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Name" span={1}>{viewKey.name}</Descriptions.Item>
              <Descriptions.Item label="Last Used" span={1}>
                {viewKey.last_used ? new Date(viewKey.last_used).toLocaleString() : 'Never'}
              </Descriptions.Item>
              <Descriptions.Item label="Allowed Origins" span={2}>
                {viewKey.allowed_origins
                  ? <Text code>{viewKey.allowed_origins}</Text>
                  : <Text type="secondary">All origins (no restriction)</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="IP Allowlist" span={2}>
                {viewKey.allowed_ips
                  ? <Text code>{viewKey.allowed_ips}</Text>
                  : <Text type="secondary">All IPs (no restriction)</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="API Key" span={2}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    readOnly
                    value={
                      revealKey
                        ? viewKey.key
                        : (viewKey.key ? '•'.repeat(Math.min(48, viewKey.key.length)) : '')
                    }
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Tooltip title={revealKey ? 'Hide' : 'Reveal'}>
                    <Button
                      icon={revealKey ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      onClick={() => setRevealKey(v => !v)}
                    />
                  </Tooltip>
                  <Tooltip title={drawerKeyCopied ? 'Copied!' : 'Copy'} open={drawerKeyCopied || undefined}>
                    <Button
                      icon={drawerKeyCopied ? <CheckOutlined /> : <CopyOutlined />}
                      type={drawerKeyCopied ? 'primary' : 'default'}
                      onClick={() => handleDrawerKeyCopy(viewKey.key)}
                    />
                  </Tooltip>
                </Space.Compact>
                <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Hidden by default. Click the eye icon to reveal, or copy directly.
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">
              <Space>
                <BarChartOutlined /> Usage summary
                <Select
                  size="small"
                  value={statsHours}
                  onChange={setStatsHours}
                  options={[
                    { label: 'Last 1h', value: 1 },
                    { label: 'Last 24h', value: 24 },
                    { label: 'Last 7d', value: 24 * 7 },
                    { label: 'Last 30d', value: 24 * 30 },
                  ]}
                  style={{ width: 110 }}
                />
              </Space>
            </Divider>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic
                  title="Requests"
                  value={keyStatRow?.requests ?? 0}
                  loading={statsFetching}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="All-time"
                  value={
                    // The stats endpoint doesn't have a per-key all-time
                    // counter — fall back to the paginated logs total.
                    usageData?.total ?? 0
                  }
                  loading={usageFetching}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Avg duration (window)"
                  suffix="ms"
                  value={
                    usageStats?.avg_duration_ms != null
                      ? Number(usageStats.avg_duration_ms).toFixed(1)
                      : 0
                  }
                  loading={statsFetching}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Logging"
                  valueRender={() => usageStats?.logging_enabled === false
                    ? <Tag color="red">Disabled</Tag>
                    : <Tag color="green">Enabled</Tag>}
                />
              </Col>
            </Row>

            <Divider orientation="left">
              <Space>
                <span>Request log</span>
                <Tooltip title="Reload">
                  <Button size="small" type="text" icon={<ReloadOutlined />}
                    onClick={() => refetchUsage()} loading={usageFetching} />
                </Tooltip>
              </Space>
            </Divider>

            <Space wrap style={{ marginBottom: 12 }}>
              <Select
                allowClear
                placeholder="Method"
                value={usageMethod}
                onChange={v => { setUsageMethod(v); setUsagePage(1) }}
                style={{ width: 110 }}
                options={['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
                  .map(m => ({ label: m, value: m }))}
              />
              <Select
                allowClear
                placeholder="Status"
                value={usageStatus}
                onChange={v => { setUsageStatus(v); setUsagePage(1) }}
                style={{ width: 140 }}
                options={[
                  { label: '2xx success', value: '200' },
                  { label: '4xx client', value: '400' },
                  { label: '401 unauthorized', value: '401' },
                  { label: '403 forbidden', value: '403' },
                  { label: '404 not found', value: '404' },
                  { label: '429 rate limited', value: '429' },
                  { label: '5xx server', value: '500' },
                ]}
              />
              <Select
                value={usagePerPage}
                onChange={v => { setUsagePerPage(v); setUsagePage(1) }}
                style={{ width: 130 }}
                options={[
                  { label: '10 / page', value: 10 },
                  { label: '25 / page', value: 25 },
                  { label: '50 / page', value: 50 },
                  { label: '100 / page', value: 100 },
                ]}
              />
            </Space>

            <Table
              size="small"
              loading={usageFetching}
              rowKey="id"
              dataSource={usageData?.logs || []}
              pagination={false}
              locale={{ emptyText: <Empty description="No requests recorded for this key" /> }}
              columns={[
                {
                  title: 'When', dataIndex: 'created_at', key: 'created_at', width: 170,
                  render: (v: string) => (
                    <Tooltip title={new Date(v).toLocaleString()}>
                      <Text style={{ fontSize: 12 }}>{relativeTime(v)}</Text>
                    </Tooltip>
                  ),
                },
                {
                  title: 'Method', dataIndex: 'method', key: 'method', width: 90,
                  render: (m: string) => <Tag color={methodColor(m)}>{m}</Tag>,
                },
                {
                  title: 'Path', dataIndex: 'path', key: 'path', ellipsis: true,
                  render: (p: string) => <Text code style={{ fontSize: 12 }}>{p}</Text>,
                },
                {
                  title: 'Status', dataIndex: 'status_code', key: 'status_code', width: 90,
                  render: (s: number) => (
                    <Badge
                      status={statusBadge(s)}
                      text={<Text style={{ fontSize: 12 }}>{s}</Text>}
                    />
                  ),
                },
                {
                  title: 'Duration', dataIndex: 'duration_ms', key: 'duration_ms', width: 100,
                  render: (d: number) => <Text style={{ fontSize: 12 }}>{d} ms</Text>,
                },
                {
                  title: 'IP', dataIndex: 'ip', key: 'ip', width: 140,
                  render: (ip: string) => <Text code style={{ fontSize: 12 }}>{ip || '—'}</Text>,
                },
              ]}
              scroll={{ y: 320 }}
            />

            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Pagination
                current={usagePage}
                onChange={setUsagePage}
                pageSize={usagePerPage}
                total={usageData?.total || 0}
                showSizeChanger={false}
                showTotal={(total) => `${total.toLocaleString()} request${total === 1 ? '' : 's'}`}
                size="small"
              />
            </div>
          </>
        )}
      </Drawer>

      <Modal title={editing ? 'Edit API Key' : 'Create API Key'} open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={() => form.submit()} confirmLoading={createMut.isPending || updateMut.isPending}>
        <Form form={form} layout="vertical"
          onFinish={v => editing ? updateMut.mutate({ id: editing.id, data: v }) : createMut.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Frontend App" />
          </Form.Item>
          <Form.Item name="allowed_origins" label="Allowed Origins" extra="Comma-separated. Leave empty for all.">
            <Input placeholder="https://example.com, https://app.example.com" />
          </Form.Item>
          <Form.Item name="allowed_ips" label="IP Allowlist"
            extra="Comma-separated IPs or CIDRs. Leave empty to allow all IPs. Example: 203.0.113.45, 192.168.1.0/24">
            <Input placeholder="203.0.113.45, 10.0.0.0/8" />
          </Form.Item>
          {editing && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default APIKeysPage
