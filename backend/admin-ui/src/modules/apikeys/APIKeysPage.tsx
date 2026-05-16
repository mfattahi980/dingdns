import React, { useState } from 'react'
import { App, Card, Table, Button, Modal, Form, Input, Tag, Space, Typography, Popconfirm, Switch, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, CheckOutlined, SafetyOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAPIKeys, createAPIKey, updateAPIKey, deleteAPIKey } from '../../core/api'

const { Title, Text } = Typography

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

  const { data: keys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => getAPIKeys().then(r => {
      // backend returns plain array
      return Array.isArray(r.data) ? r.data : (r.data.keys || [])
    }),
  })

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
    { title: 'Actions', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />}
            onClick={() => { setEditing(record); form.setFieldsValue({ name: record.name, allowed_origins: record.allowed_origins, allowed_ips: record.allowed_ips, is_active: record.is_active }); setModalOpen(true) }} />
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
