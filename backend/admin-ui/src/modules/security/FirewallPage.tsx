import React, { useState } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  Typography, message, Popconfirm, Tabs, Alert, Badge, Tooltip,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, FireOutlined,
  CheckCircleOutlined, StopOutlined, WarningOutlined, CodeOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getFirewallRules, addFirewallRule, deleteFirewallRule, getSystemFirewallRules, syncFirewallRules } from '../../core/api'

const { Title, Text } = Typography
const { Option } = Select

const chainColors: Record<string, string> = {
  INPUT: 'blue',
  OUTPUT: 'purple',
  FORWARD: 'cyan',
}
const actionColors: Record<string, string> = {
  ACCEPT: 'green',
  DROP: 'red',
  REJECT: 'orange',
}
const actionIcons: Record<string, React.ReactNode> = {
  ACCEPT: <CheckCircleOutlined />,
  DROP: <StopOutlined />,
  REJECT: <WarningOutlined />,
}

const FirewallPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [systemChain, setSystemChain] = useState('INPUT')
  const [form] = Form.useForm()
  const protocol = Form.useWatch('protocol', form)
  const queryClient = useQueryClient()

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['firewallRules'],
    queryFn: () => getFirewallRules().then(r => r.data),
  })
  const rules: any[] = rulesData?.rules ?? (Array.isArray(rulesData) ? rulesData : [])
  const toolType: string = rulesData?.tool ?? 'unknown'
  const hasSudo: boolean = rulesData?.has_sudo ?? false

  const { data: systemData, isLoading: sysLoading, refetch: refetchSystem } = useQuery({
    queryKey: ['systemFirewall', systemChain],
    queryFn: () => getSystemFirewallRules(systemChain).then(r => r.data),
    staleTime: 10000,
  })

  const addMut = useMutation({
    mutationFn: (data: any) => addFirewallRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewallRules'] })
      setModalOpen(false)
      form.resetFields()
      message.success('Rule added and applied')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to add rule'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFirewallRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewallRules'] })
      message.success('Rule removed')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const syncMut = useMutation({
    mutationFn: () => syncFirewallRules(),
    onSuccess: () => message.success('Rules synced to iptables'),
    onError: (e: any) => message.error(e.response?.data?.error || 'Sync failed'),
  })

  // Filter rules by chain for the tab view
  const chains = ['INPUT', 'OUTPUT', 'FORWARD']

  const columns = [
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: 100,
      render: (v: string) => (
        <Tag color={actionColors[v] || 'default'} icon={actionIcons[v]}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Protocol', dataIndex: 'protocol', key: 'protocol', width: 90,
      render: (v: string) => v ? <Tag>{v.toUpperCase()}</Tag> : <Text type="secondary">ALL</Text>,
    },
    {
      title: 'Source IP', dataIndex: 'src_ip', key: 'src_ip',
      render: (v: string) => v ? <Text code>{v}</Text> : <Text type="secondary">Any</Text>,
    },
    {
      title: 'Dest IP', dataIndex: 'dst_ip', key: 'dst_ip',
      render: (v: string) => v ? <Text code>{v}</Text> : <Text type="secondary">Any</Text>,
    },
    {
      title: 'Port', dataIndex: 'dst_port', key: 'dst_port', width: 90,
      render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Comment', dataIndex: 'comment', key: 'comment', ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Added', dataIndex: 'created_at', key: 'created_at', width: 140,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '', key: 'actions', width: 60,
      render: (_: any, record: any) => (
        <Popconfirm title="Remove this rule?" onConfirm={() => deleteMut.mutate(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const chainTabs = chains.map(chain => {
    const chainRules = rules.filter((r: any) => r.chain === chain)
    return {
      key: chain,
      label: (
        <span>
          <Tag color={chainColors[chain]} style={{ marginRight: 4 }}>{chain}</Tag>
          <Badge count={chainRules.length} size="small" style={{ backgroundColor: '#555' }} />
        </span>
      ),
      children: (
        <Table
          columns={columns}
          dataSource={chainRules}
          loading={isLoading}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 800 }}
          locale={{ emptyText: `No ${chain} rules defined` }}
        />
      ),
    }
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FireOutlined style={{ fontSize: 22, color: '#ff6b35' }} />
          <Title level={3} style={{ margin: 0 }}>Firewall</Title>
        </div>
        <Space>
          <Tooltip title="Re-apply all saved rules to iptables (useful after reboot)">
            <Button icon={<ReloadOutlined />} onClick={() => syncMut.mutate()} loading={syncMut.isPending}>
              Sync Rules
            </Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true) }}>
            Add Rule
          </Button>
        </Space>
      </div>

      {toolType === 'none' && (
        <Alert type="error" showIcon
          message="No firewall tool detected"
          description={<span>Neither <code>iptables</code> nor <code>ufw</code> was found. Install one: <code>apt install iptables</code></span>}
          style={{ marginBottom: 16, borderRadius: 8 }} />
      )}
      {toolType !== 'none' && !hasSudo && (
        <Alert type="warning" showIcon
          message="Sudo access not configured"
          description={<span>Add sudoers rule: <code>echo "dingdns ALL=(root) NOPASSWD: /usr/sbin/iptables" &gt; /etc/sudoers.d/dingdns-firewall</code></span>}
          style={{ marginBottom: 16, borderRadius: 8 }} />
      )}
      {toolType !== 'none' && hasSudo && (
        <Alert type="info" showIcon
          message={<span>Firewall tool: <Tag color="blue">{toolType}</Tag> — Rules are stored in DB and applied on service start. DROP silently discards; REJECT sends an error back.</span>}
          style={{ marginBottom: 16, borderRadius: 8 }}
          closable />
      )}

      <Card>
        <Tabs items={chainTabs} />
      </Card>

      {/* System view tab */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <CodeOutlined />
            <span>Live iptables View</span>
            <Select value={systemChain} onChange={v => setSystemChain(v)} size="small" style={{ width: 120 }}>
              {chains.map(c => <Option key={c} value={c}>{c}</Option>)}
            </Select>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchSystem()} loading={sysLoading}>
              Refresh
            </Button>
          </Space>
        }
      >
        <pre style={{
          background: '#0d1117', color: '#c9d1d9', padding: 16,
          borderRadius: 8, fontSize: 12, overflowX: 'auto',
          maxHeight: 400, overflowY: 'auto', margin: 0,
          border: '1px solid #30363d', fontFamily: "'Courier New', monospace",
        }}>
          {sysLoading ? 'Loading...' : (systemData?.output || systemData?.error || 'No output')}
        </pre>
      </Card>

      {/* Add rule modal */}
      <Modal
        title={<Space><FireOutlined style={{ color: '#ff6b35' }} />Add Firewall Rule</Space>}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        onOk={() => form.submit()}
        confirmLoading={addMut.isPending}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={v => addMut.mutate(v)}
          initialValues={{ chain: 'INPUT', action: 'DROP', protocol: 'all' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="chain" label="Chain" rules={[{ required: true }]}>
              <Select>
                <Option value="INPUT"><Tag color="blue">INPUT</Tag> — incoming traffic</Option>
                <Option value="OUTPUT"><Tag color="purple">OUTPUT</Tag> — outgoing traffic</Option>
                <Option value="FORWARD"><Tag color="cyan">FORWARD</Tag> — forwarded traffic</Option>
              </Select>
            </Form.Item>
            <Form.Item name="action" label="Action" rules={[{ required: true }]}>
              <Select>
                <Option value="ACCEPT"><Tag color="green" icon={<CheckCircleOutlined />}>ACCEPT</Tag></Option>
                <Option value="DROP"><Tag color="red" icon={<StopOutlined />}>DROP</Tag></Option>
                <Option value="REJECT"><Tag color="orange" icon={<WarningOutlined />}>REJECT</Tag></Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item name="protocol" label="Protocol">
            <Select>
              <Option value="all">All protocols</Option>
              <Option value="tcp">TCP</Option>
              <Option value="udp">UDP</Option>
              <Option value="icmp">ICMP</Option>
            </Select>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="src_ip" label="Source IP / CIDR"
              extra="Leave empty for any source">
              <Input placeholder="e.g. 203.0.113.0/24" />
            </Form.Item>
            <Form.Item name="dst_ip" label="Destination IP / CIDR"
              extra="Leave empty for any destination">
              <Input placeholder="e.g. 10.0.0.1" />
            </Form.Item>
          </div>

          {(protocol === 'tcp' || protocol === 'udp') && (
            <Form.Item name="dst_port" label="Destination Port"
              extra="Single port (80) or range (8000:9000)">
              <Input placeholder="e.g. 22 or 8000:9000" />
            </Form.Item>
          )}

          <Form.Item name="comment" label="Comment">
            <Input placeholder="e.g. Block suspicious range" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default FirewallPage
