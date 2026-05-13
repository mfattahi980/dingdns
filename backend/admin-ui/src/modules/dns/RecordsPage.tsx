import React, { useState } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, InputNumber,
  Tag, Space, Typography, message, Popconfirm, Breadcrumb, Tooltip,
  Divider,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined,
  QuestionCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getZone, getRecords, createRecord, updateRecord, deleteRecord } from '../../core/api'

const { Title, Text } = Typography

// ─── Per-type help config ───────────────────────────────────────────────────

interface TypeHelp {
  valueLabel: string
  placeholder: string
  example: string
  tip: string
  validate: (v: string) => string | null   // null = ok, string = error msg
  showPriority: boolean
}

const TYPE_HELP: Record<string, TypeHelp> = {
  A: {
    valueLabel: 'IPv4 Address',
    placeholder: '1.2.3.4',
    example: '192.168.1.1',
    tip: 'Must be a valid IPv4 address. Points a hostname to a server IP.',
    validate: (v) => {
      const parts = v.trim().split('.')
      if (parts.length !== 4) return 'Must be a valid IPv4 address (e.g. 1.2.3.4)'
      for (const p of parts) {
        const n = Number(p)
        if (p === '' || isNaN(n) || n < 0 || n > 255) return 'Each octet must be 0–255 (e.g. 1.2.3.4)'
      }
      return null
    },
    showPriority: false,
  },
  AAAA: {
    valueLabel: 'IPv6 Address',
    placeholder: '2001:db8::1',
    example: '2001:0db8:85a3::8a2e:0370:7334',
    tip: 'Must be a valid IPv6 address. Like A record but for IPv6.',
    validate: (v) => {
      // basic IPv6 check
      const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$|^::1$|^::$/.test(v.trim())
      return ipv6 ? null : 'Must be a valid IPv6 address (e.g. 2001:db8::1)'
    },
    showPriority: false,
  },
  CNAME: {
    valueLabel: 'Target Hostname',
    placeholder: 'target.example.com',
    example: 'www.example.com',
    tip: 'Points this name to another hostname (not an IP). Cannot be used on root (@). E.g. "www" → "example.com".',
    validate: (v) => {
      if (v.trim().match(/^\d+\.\d+\.\d+\.\d+$/)) return 'CNAME must point to a hostname, not an IP address'
      if (!v.trim().includes('.') && v.trim() !== '@') return 'Must be a valid hostname (e.g. target.example.com)'
      return null
    },
    showPriority: false,
  },
  MX: {
    valueLabel: 'Mail Server Hostname',
    placeholder: 'mail.example.com',
    example: 'mail.example.com',
    tip: 'Hostname of the mail server. Use the Priority field to set preference (lower = higher priority). E.g. Priority 10 is preferred over Priority 20.',
    validate: (v) => {
      if (!v.trim()) return 'Mail server hostname is required'
      return null
    },
    showPriority: true,
  },
  TXT: {
    valueLabel: 'Text Value',
    placeholder: 'v=spf1 include:example.com ~all',
    example: 'v=spf1 mx ~all',
    tip: 'Free-form text. Used for SPF, DKIM, domain verification, etc. Max 255 characters.',
    validate: (v) => {
      if (v.length > 255) return `Too long: ${v.length}/255 characters`
      return null
    },
    showPriority: false,
  },
  NS: {
    valueLabel: 'Nameserver Hostname',
    placeholder: 'ns1.example.com',
    example: 'ns1.example.com',
    tip: 'Nameserver for this zone or subdomain. Must be a hostname, not an IP.',
    validate: (v) => {
      if (!v.trim().includes('.')) return 'Must be a fully qualified hostname (e.g. ns1.example.com)'
      return null
    },
    showPriority: false,
  },
  SRV: {
    valueLabel: 'SRV Value (weight port target)',
    placeholder: '10 5060 sip.example.com',
    example: '10 443 app.example.com',
    tip: 'Format: "weight port target". Weight = load balancing (0–65535), Port = service port, Target = hostname. Use Name field like "_sip._tcp".',
    validate: (v) => {
      const parts = v.trim().split(/\s+/)
      if (parts.length < 3) return 'Format: weight port target (e.g. 10 5060 sip.example.com)'
      if (isNaN(Number(parts[0]))) return 'Weight must be a number (e.g. 10)'
      if (isNaN(Number(parts[1]))) return 'Port must be a number (e.g. 5060)'
      return null
    },
    showPriority: true,
  },
  CAA: {
    valueLabel: 'CAA Value (flag tag "value")',
    placeholder: '0 issue "letsencrypt.org"',
    example: '0 issue "letsencrypt.org"',
    tip: 'Format: "flag tag \\"value\\"". Flag is usually 0. Tag is: issue, issuewild, or iodef. Controls which CAs can issue SSL certs.',
    validate: (v) => {
      const parts = v.trim().split(/\s+/)
      if (parts.length < 3) return 'Format: flag tag "value" (e.g. 0 issue "letsencrypt.org")'
      if (isNaN(Number(parts[0]))) return 'Flag must be a number (usually 0)'
      return null
    },
    showPriority: false,
  },
  PTR: {
    valueLabel: 'Target Hostname',
    placeholder: 'hostname.example.com',
    example: 'myserver.example.com',
    tip: 'Reverse DNS. Maps an IP to a hostname. The Name should be the reverse IP notation (e.g. 4.3.2.1.in-addr.arpa).',
    validate: (v) => {
      if (!v.trim()) return 'Hostname is required'
      return null
    },
    showPriority: false,
  },
}

// ─── Helper tooltip label ────────────────────────────────────────────────────

const HelpLabel: React.FC<{ label: string; tip: string; example?: string }> = ({ label, tip, example }) => (
  <Space size={4}>
    {label}
    <Tooltip
      title={
        <div>
          <div>{tip}</div>
          {example && <div style={{ marginTop: 4, opacity: 0.8 }}>Example: <code>{example}</code></div>}
        </div>
      }
    >
      <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help' }} />
    </Tooltip>
  </Space>
)

// ─── Main component ──────────────────────────────────────────────────────────

const recordTypes = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR']

const typeColors: Record<string, string> = {
  A: 'blue', AAAA: 'geekblue', CNAME: 'cyan', MX: 'purple',
  TXT: 'orange', NS: 'green', SRV: 'magenta', CAA: 'volcano', PTR: 'lime',
}

const RecordsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const zoneId = Number(id)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [selectedType, setSelectedType] = useState('A')
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: zone } = useQuery({
    queryKey: ['zone', zoneId],
    queryFn: () => getZone(zoneId).then(r => r.data.zone ?? r.data),
  })

  const { data: records, isLoading } = useQuery({
    queryKey: ['records', zoneId],
    queryFn: () => getRecords(zoneId).then(r => r.data.records),
  })

  const createMut = useMutation({
    mutationFn: (data: any) => createRecord(zoneId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', zoneId] })
      setModalOpen(false)
      message.success('Record created successfully')
    },
    onError: (e: any) => {
      const errMsg = e.response?.data?.error || 'Failed to create record'
      message.error(errMsg, 5)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ rid, data }: any) => updateRecord(rid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', zoneId] })
      setModalOpen(false)
      setEditing(null)
      message.success('Record updated')
    },
    onError: (e: any) => {
      const errMsg = e.response?.data?.error || 'Failed to update record'
      message.error(errMsg, 5)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (rid: number) => deleteRecord(rid),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['records', zoneId] }); message.success('Record deleted') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to delete'),
  })

  const openCreate = () => {
    setEditing(null)
    setSelectedType('A')
    form.resetFields()
    form.setFieldsValue({ type: 'A', ttl: 300 })
    setModalOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    const type = record.type || 'A'
    setSelectedType(type)
    form.setFieldsValue({
      name: record.name,
      type,
      content: record.content ?? record.value,
      ttl: record.ttl,
      priority: record.priority,
    })
    setModalOpen(true)
  }

  const handleSubmit = (values: any) => {
    if (editing) {
      updateMut.mutate({ rid: editing.id, data: values })
    } else {
      createMut.mutate(values)
    }
  }

  const help = TYPE_HELP[selectedType] || TYPE_HELP['A']

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <strong>{v}</strong> },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 80,
      render: (v: string) => <Tag color={typeColors[v] || 'default'}>{v}</Tag>,
    },
    { title: 'Value', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: 'TTL', dataIndex: 'ttl', key: 'ttl', width: 80 },
    {
      title: 'Priority', dataIndex: 'priority', key: 'priority', width: 80,
      render: (v: number) => v ? v : <Text type="secondary">—</Text>,
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Delete this record?" onConfirm={() => deleteMut.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: <a onClick={() => navigate('/dns/zones')}>DNS Zones</a> },
        { title: zone?.name || '...' },
        { title: 'Records' },
      ]} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dns/zones')} />
          <Title level={3} style={{ margin: 0 }}>Records — {zone?.name}</Title>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Record</Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={records || []}
          loading={isLoading}
          rowKey="id"
          pagination={{ pageSize: 50 }}
          scroll={{ x: 700 }}
        />
      </Card>

      {/* ── Create / Edit Modal ── */}
      <Modal
        title={editing ? `Edit ${editing.type} Record` : 'Add DNS Record'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={() => form.submit()}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText={editing ? 'Save Changes' : 'Create Record'}
        width={560}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ marginTop: 8 }}
        >

          {/* Type selector first so help text updates */}
          <Form.Item
            name="type"
            label={<HelpLabel label="Record Type" tip="Choose the DNS record type. Each type has a different purpose." />}
            rules={[{ required: true, message: 'Select a record type' }]}
          >
            <Select
              options={recordTypes.map(t => ({
                value: t,
                label: (
                  <Space>
                    <Tag color={typeColors[t]} style={{ margin: 0 }}>{t}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t === 'A' && 'IPv4 address'}
                      {t === 'AAAA' && 'IPv6 address'}
                      {t === 'CNAME' && 'Alias / redirect'}
                      {t === 'MX' && 'Mail server'}
                      {t === 'TXT' && 'Text (SPF, DKIM...)'}
                      {t === 'NS' && 'Nameserver'}
                      {t === 'SRV' && 'Service locator'}
                      {t === 'CAA' && 'SSL cert authority'}
                      {t === 'PTR' && 'Reverse DNS'}
                    </Text>
                  </Space>
                ),
              }))}
              onChange={(v) => { setSelectedType(v); form.setFieldValue('content', '') }}
            />
          </Form.Item>

          {/* Contextual type info box */}
          <div style={{
            background: 'rgba(22, 104, 220, 0.06)', border: '1px solid #1668dc33',
            borderRadius: 6, padding: '8px 12px', marginBottom: 16,
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <InfoCircleOutlined style={{ color: '#1668dc', marginTop: 2 }} />
            <div>
              <Text style={{ fontSize: 12 }}>{help.tip}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Example: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>{help.example}</code>
              </Text>
            </div>
          </div>

          <Divider style={{ margin: '0 0 16px 0' }} />

          {/* Name */}
          <Form.Item
            name="name"
            label={
              <HelpLabel
                label="Name"
                tip='The subdomain or hostname. Use "@" for the root domain itself, "*" for wildcard, or a subdomain like "www" or "mail".'
                example="@ or www or mail or *"
              />
            }
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input
              placeholder='@ (root), www, mail, subdomain, *'
              addonBefore={zone?.name ? <Text type="secondary" style={{ fontSize: 11 }}>{zone.name}/</Text> : undefined}
            />
          </Form.Item>

          {/* Value / Content */}
          <Form.Item
            name="content"
            label={
              <HelpLabel
                label={help.valueLabel}
                tip={help.tip}
                example={help.example}
              />
            }
            rules={[
              { required: true, message: `${help.valueLabel} is required` },
              {
                validator: (_, v) => {
                  if (!v) return Promise.resolve()
                  const err = help.validate(v)
                  return err ? Promise.reject(new Error(err)) : Promise.resolve()
                },
              },
            ]}
            extra={
              <Text type="secondary" style={{ fontSize: 11 }}>
                Format: <code>{help.placeholder}</code>
              </Text>
            }
          >
            <Input placeholder={help.placeholder} />
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            {/* TTL */}
            <Form.Item
              name="ttl"
              label={
                <HelpLabel
                  label="TTL"
                  tip="Time To Live in seconds. How long DNS resolvers cache this record. Lower = changes propagate faster but more DNS queries. Common: 300 (5min) for testing, 3600 (1h) for normal, 86400 (24h) for stable records."
                  example="300"
                />
              }
              style={{ flex: 1, margin: 0 }}
            >
              <Select
                placeholder="300"
                options={[
                  { value: 60,    label: '60 sec (1 min) — fast updates' },
                  { value: 300,   label: '300 sec (5 min) — testing' },
                  { value: 900,   label: '900 sec (15 min)' },
                  { value: 3600,  label: '3600 sec (1 hour) — normal' },
                  { value: 21600, label: '21600 sec (6 hours)' },
                  { value: 86400, label: '86400 sec (24 hours) — stable' },
                ]}
                allowClear
              />
            </Form.Item>

            {/* Priority — only for MX and SRV */}
            {help.showPriority && (
              <Form.Item
                name="priority"
                label={
                  <HelpLabel
                    label="Priority"
                    tip="Lower number = higher priority. Used for MX (mail) and SRV records. If you have multiple MX records, the one with the lowest priority number is tried first."
                    example="10"
                  />
                }
                style={{ flex: 1, margin: 0 }}
                rules={[{ required: true, message: 'Priority is required for this record type' }]}
              >
                <InputNumber min={0} max={65535} placeholder="10" style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Space>

        </Form>
      </Modal>
    </div>
  )
}

export default RecordsPage
