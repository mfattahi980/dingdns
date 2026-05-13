import React, { useState, useRef, useCallback } from 'react'
import {
  Card, Table, Button, Modal, Form, Select, Input, Tag, Typography,
  message, Popconfirm, Space, Descriptions, Switch, Divider, Alert, Tooltip,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, EditOutlined,
  CopyOutlined, LinkOutlined, CheckCircleOutlined, CloseCircleOutlined,
  GlobalOutlined, ClockCircleOutlined, WifiOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDDNSTokens, createDDNSToken, updateDDNSToken, deleteDDNSToken,
  getZones, getRecords, getServerInfo,
} from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title, Text } = Typography

const maskToken = (token: string) =>
  token ? `${token.substring(0, 8)}••••••••${token.substring(token.length - 8)}` : ''

// ── main component ────────────────────────────────────────────────────────────

const DDNSTokensPage: React.FC = () => {
  const { admin } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewToken, setViewToken] = useState<any>(null)
  const [editToken, setEditToken] = useState<any>(null)
  const [newTokenData, setNewTokenData] = useState<any>(null)
  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  const [copyFallback, setCopyFallback] = useState<string | null>(null)
  const fallbackRef = useRef<any>(null)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const queryClient = useQueryClient()

  // copy that works on both HTTP and HTTPS
  const copyText = useCallback((text: string, label = 'Copied') => {
    // HTTPS: modern clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => message.success(label))
        .catch(() => setCopyFallback(text))
      return
    }
    // HTTP: try execCommand
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
      document.body.appendChild(el)
      el.focus()
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) { message.success(label); return }
    } catch {}
    // Last resort: show manual-copy modal
    setCopyFallback(text)
  }, [])

  const canManage = admin?.role === 'super_admin' ||
    (admin as any)?.permissions?.includes('ddns.manage') ||
    (admin as any)?.permissions === '*'

  // ── data ──
  const { data: tokens, isLoading } = useQuery({
    queryKey: ['ddnsTokens'],
    queryFn: () => getDDNSTokens().then(r => r.data.tokens),
  })

  const { data: zones } = useQuery({
    queryKey: ['zones'],
    queryFn: () => getZones().then(r => r.data.zones),
  })

  const { data: records } = useQuery({
    queryKey: ['records', selectedZone],
    queryFn: () => selectedZone ? getRecords(selectedZone).then(r => r.data.records) : Promise.resolve([]),
    enabled: !!selectedZone,
  })

  const { data: serverInfo } = useQuery({
    queryKey: ['serverInfo'],
    queryFn: () => getServerInfo().then(r => r.data),
  })

  // base URL for DDNS update URL — prefer api_base_url from server (respects api_domain setting)
  const baseUrl = serverInfo?.api_base_url
    || (serverInfo?.server_domain ? `https://${serverInfo.server_domain}` : '')
    || window.location.origin.replace('/admin', '')

  const ddnsUpdateUrl = (token: string) =>
    `${baseUrl}/api/ddns/update?token=${token}`

  // ── mutations ──
  const createMut = useMutation({
    mutationFn: (data: any) => createDDNSToken(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ddnsTokens'] })
      setCreateOpen(false)
      createForm.resetFields()
      setSelectedZone(null)
      setNewTokenData(res.data)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to create token'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => updateDDNSToken(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ddnsTokens'] })
      setEditToken(null)
      message.success('Token updated')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to update'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDDNSToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ddnsTokens'] })
      message.success('Token deleted')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  // ── table columns ──
  const columns = [
    {
      title: 'Label', dataIndex: 'label', key: 'label',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Record', key: 'record',
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tag color="blue">{r.record?.type || 'A'}</Tag>
          <Text code style={{ fontSize: 12 }}>{r.record?.name || `#${r.record_id}`}</Text>
        </Space>
      ),
    },
    {
      title: 'Token', dataIndex: 'token', key: 'token',
      render: (v: string) => (
        <Space size={4}>
          <Text code style={{ fontSize: 11, color: '#8c8c8c' }}>{maskToken(v)}</Text>
          <Tooltip title="Copy full token">
            <Button
              size="small" type="text" icon={<CopyOutlined />}
              onClick={() => copyText(v, 'Token copied!')}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Status', dataIndex: 'is_active', key: 'active', width: 90,
      render: (v: boolean) => v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>
        : <Tag color="red" icon={<CloseCircleOutlined />}>Inactive</Tag>,
    },
    {
      title: 'Last Used', dataIndex: 'last_used', key: 'last_used', width: 150,
      render: (v: string) => v
        ? <Text type="secondary" style={{ fontSize: 12 }}>{new Date(v).toLocaleString()}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>,
    },
    {
      title: 'Last IP', dataIndex: 'last_ip', key: 'last_ip', width: 120,
      render: (v: string) => v
        ? <Tag icon={<WifiOutlined />}>{v}</Tag>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 130,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="View details & URL">
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewToken(record)} />
          </Tooltip>
          {canManage && (
            <>
              <Tooltip title="Edit">
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditToken(record)
                    editForm.setFieldsValue({ label: record.label, is_active: record.is_active })
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="Delete this token?"
                description="The device using this token will no longer be able to update DNS."
                onConfirm={() => deleteMut.mutate(record.id)}
                okText="Delete"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>DDNS Tokens</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Dynamic DNS — lets devices automatically update their DNS record when their IP changes
          </Text>
        </div>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { createForm.resetFields(); setSelectedZone(null); setCreateOpen(true) }}>
            Create Token
          </Button>
        )}
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={tokens || []}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* ── Manual Copy Fallback Modal (HTTP fallback) ── */}
      <Modal
        title={<Space><CopyOutlined />Copy to Clipboard</Space>}
        open={!!copyFallback}
        onOk={() => setCopyFallback(null)}
        onCancel={() => setCopyFallback(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Done"
        width={520}
        afterOpenChange={(open) => {
          if (open && fallbackRef.current) {
            setTimeout(() => {
              fallbackRef.current?.focus()
              fallbackRef.current?.select()
            }, 50)
          }
        }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          متن زیر را انتخاب کنید و <strong>Ctrl+C</strong> بزنید:
        </Text>
        <Input.TextArea
          ref={fallbackRef}
          value={copyFallback || ''}
          readOnly
          rows={3}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
          onClick={e => (e.target as HTMLTextAreaElement).select()}
        />
      </Modal>

      {/* ── New Token Created Modal ── */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} />Token Created Successfully</Space>}
        open={!!newTokenData}
        onOk={() => setNewTokenData(null)}
        onCancel={() => setNewTokenData(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Done"
        width={600}
      >
        <Alert
          type="warning"
          showIcon
          message="Save this token now — it cannot be shown again!"
          style={{ marginBottom: 16 }}
        />

        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Label">
            <Text strong>{newTokenData?.label}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Full Token">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                value={newTokenData?.token}
                readOnly
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <Button
                icon={<CopyOutlined />}
                onClick={() => copyText(newTokenData?.token, 'Token copied!')}
              >
                Copy Token
              </Button>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="DDNS Update URL">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Input.TextArea
                value={newTokenData?.token ? ddnsUpdateUrl(newTokenData.token) : ''}
                readOnly
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 11 }}
              />
              <Button
                icon={<LinkOutlined />}
                onClick={() => copyText(ddnsUpdateUrl(newTokenData?.token), 'URL copied!')}
              >
                Copy URL
              </Button>
            </Space>
          </Descriptions.Item>
        </Descriptions>

        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="How to use"
          description={
            <div style={{ fontSize: 12 }}>
              <div>Call this URL from your router/device when IP changes:</div>
              <code style={{ fontSize: 11 }}>{newTokenData?.token ? ddnsUpdateUrl(newTokenData.token) : ''}</code>
              <div style={{ marginTop: 8 }}>Or specify IP manually: append <code>&amp;ip=1.2.3.4</code></div>
            </div>
          }
        />
      </Modal>

      {/* ── View Token Details Modal ── */}
      <Modal
        title={<Space><EyeOutlined />Token Details — {viewToken?.label}</Space>}
        open={!!viewToken}
        onOk={() => setViewToken(null)}
        onCancel={() => setViewToken(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Close"
        width={620}
      >
        {viewToken && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Label">
                <Text strong>{viewToken.label}</Text>
              </Descriptions.Item>

              <Descriptions.Item label="Status">
                {viewToken.is_active
                  ? <Tag color="green" icon={<CheckCircleOutlined />}>Active</Tag>
                  : <Tag color="red" icon={<CloseCircleOutlined />}>Inactive</Tag>
                }
              </Descriptions.Item>

              <Descriptions.Item label="Record">
                <Space>
                  <Tag color="blue">{viewToken.record?.type || 'A'}</Tag>
                  <Text code>{viewToken.record?.name}</Text>
                  <Text type="secondary">→ {viewToken.record?.content}</Text>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="Token (masked)">
                <Space>
                  <Text code style={{ fontSize: 12 }}>{maskToken(viewToken.token)}</Text>
                  <Tooltip title="Copy full token">
                    <Button size="small" icon={<CopyOutlined />}
                      onClick={() => copyText(viewToken.token, 'Full token copied!')} />
                  </Tooltip>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="DDNS Update URL">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space wrap>
                    <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>
                      {ddnsUpdateUrl(viewToken.token)}
                    </Text>
                    <Tooltip title="Copy URL">
                      <Button size="small" icon={<CopyOutlined />}
                        onClick={() => copyText(ddnsUpdateUrl(viewToken.token), 'URL copied!')} />
                    </Tooltip>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Append <code>&amp;ip=1.2.3.4</code> to set IP manually, or omit to auto-detect caller IP
                  </Text>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label={<Space><ClockCircleOutlined />Created</Space>}>
                <Text>{new Date(viewToken.created_at).toLocaleString()}</Text>
              </Descriptions.Item>

              <Descriptions.Item label={<Space><ClockCircleOutlined />Last Used</Space>}>
                {viewToken.last_used
                  ? <Text>{new Date(viewToken.last_used).toLocaleString()}</Text>
                  : <Text type="secondary">Never used</Text>
                }
              </Descriptions.Item>

              <Descriptions.Item label={<Space><WifiOutlined />Last IP Updated</Space>}>
                {viewToken.last_ip
                  ? <Tag icon={<WifiOutlined />} color="blue">{viewToken.last_ip}</Tag>
                  : <Text type="secondary">—</Text>
                }
              </Descriptions.Item>

              <Descriptions.Item label={<Space><GlobalOutlined />Token ID</Space>}>
                <Text type="secondary">#{viewToken.id}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider />
            <Title level={5} style={{ margin: '0 0 8px 0' }}>Usage Examples</Title>
            <div style={{ background: '#141414', padding: 12, borderRadius: 6, fontSize: 12 }}>
              {/* Auto-detect IP */}
              <div style={{ color: '#8c8c8c', marginBottom: 4 }}>// Auto-detect IP (call from the device itself)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Text code style={{ fontSize: 11, color: '#52c41a', flex: 1, wordBreak: 'break-all' }}>
                  GET {ddnsUpdateUrl(viewToken.token)}
                </Text>
                <Tooltip title="Copy">
                  <Button size="small" icon={<CopyOutlined />}
                    onClick={() => copyText(ddnsUpdateUrl(viewToken.token), 'URL copied!')} />
                </Tooltip>
              </div>

              {/* Manual IP */}
              <div style={{ color: '#8c8c8c', marginBottom: 4 }}>// Specify IP manually</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Text code style={{ fontSize: 11, color: '#52c41a', flex: 1, wordBreak: 'break-all' }}>
                  GET {ddnsUpdateUrl(viewToken.token)}&amp;ip=1.2.3.4
                </Text>
                <Tooltip title="Copy">
                  <Button size="small" icon={<CopyOutlined />}
                    onClick={() => copyText(`${ddnsUpdateUrl(viewToken.token)}&ip=1.2.3.4`, 'URL copied!')} />
                </Tooltip>
              </div>

              {/* DynDNS compatible */}
              <div style={{ color: '#8c8c8c', marginBottom: 4 }}>// DynDNS compatible (Basic Auth)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text code style={{ fontSize: 11, color: '#faad14', flex: 1, wordBreak: 'break-all' }}>
                  GET {baseUrl}/api/ddns/update?hostname={viewToken.record?.name}
                </Text>
                <Tooltip title="Copy">
                  <Button size="small" icon={<CopyOutlined />}
                    onClick={() => copyText(`${baseUrl}/api/ddns/update?hostname=${viewToken.record?.name}`, 'URL copied!')} />
                </Tooltip>
              </div>
              <div style={{ color: '#8c8c8c', fontSize: 11, marginTop: 4 }}>
                with Basic Auth: username=any, password=&lt;full token&gt;
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ── Edit Token Modal ── */}
      {canManage && (
        <Modal
          title={<Space><EditOutlined />Edit Token — {editToken?.label}</Space>}
          open={!!editToken}
          onCancel={() => setEditToken(null)}
          onOk={() => editForm.submit()}
          confirmLoading={updateMut.isPending}
          okText="Save Changes"
        >
          <Form
            form={editForm}
            layout="vertical"
            onFinish={v => updateMut.mutate({
              id: editToken.id,
              data: { label: v.label, is_active: v.is_active },
            })}
            style={{ marginTop: 16 }}
          >
            <Form.Item name="label" label="Label" rules={[{ required: true }]}>
              <Input placeholder="e.g. Home Server, Office Router" />
            </Form.Item>
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>
          </Form>
        </Modal>
      )}

      {/* ── Create Token Modal ── */}
      {canManage && (
        <Modal
          title={<Space><PlusOutlined />Create DDNS Token</Space>}
          open={createOpen}
          onCancel={() => setCreateOpen(false)}
          onOk={() => createForm.submit()}
          confirmLoading={createMut.isPending}
          okText="Create Token"
        >
          <Form form={createForm} layout="vertical" onFinish={v => createMut.mutate(v)} style={{ marginTop: 8 }}>
            <Form.Item name="label" label="Label" rules={[{ required: true, message: 'Label is required' }]}
              extra="A name to identify this token (e.g. Home Router, Office PC)">
              <Input placeholder="Home Server" />
            </Form.Item>
            <Form.Item label="Zone" extra="Select which DNS zone this record belongs to">
              <Select
                placeholder="Select zone first"
                onChange={(v: number) => { setSelectedZone(v); createForm.setFieldValue('record_id', undefined) }}
                options={(zones || []).map((z: any) => ({ value: z.id, label: z.name }))}
              />
            </Form.Item>
            <Form.Item name="record_id" label="Record" rules={[{ required: true, message: 'Select a record' }]}
              extra="Only A and AAAA records can be updated via DDNS">
              <Select
                placeholder={selectedZone ? 'Select A/AAAA record' : 'Select a zone first'}
                disabled={!selectedZone}
                options={(records || [])
                  .filter((r: any) => ['A', 'AAAA'].includes(r.type))
                  .map((r: any) => ({
                    value: r.id,
                    label: `${r.name} (${r.type}: ${r.content})`,
                  }))}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  )
}

export default DDNSTokensPage
