import React, { useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, InputNumber, Tag, Typography, message, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getIPBans, addIPBan, deleteIPBan } from '../../core/api'

const { Title } = Typography

const IPBansPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  const { data: bans, isLoading } = useQuery({
    queryKey: ['ipBans'],
    queryFn: () => getIPBans().then(r => {
      // backend returns plain array
      return Array.isArray(r.data) ? r.data : (r.data.bans || [])
    }),
  })

  const addMut = useMutation({
    mutationFn: (data: any) => addIPBan(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ipBans'] }); setModalOpen(false); message.success('IP banned') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteIPBan(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ipBans'] }); message.success('Ban removed') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'IP / CIDR', dataIndex: 'ip', key: 'ip', render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: 'Auto', dataIndex: 'is_auto', key: 'auto', width: 90,
      render: (v: boolean) => <Tag color={v ? 'orange' : 'blue'}>{v ? 'Auto' : 'Manual'}</Tag> },
    { title: 'Expires', dataIndex: 'expires_at', key: 'expires', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString() : <Tag color="red">Never</Tag> },
    { title: 'Created', dataIndex: 'created_at', key: 'created', width: 180,
      render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Actions', key: 'actions', width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="Remove ban?" onConfirm={() => deleteMut.mutate(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>IP Bans</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true) }}>
          Ban IP
        </Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={bans || []} loading={isLoading} rowKey="id"
          pagination={{ pageSize: 20 }} scroll={{ x: 700 }}
          locale={{ emptyText: 'No active bans' }} />
      </Card>

      <Modal title="Ban IP Address" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} confirmLoading={addMut.isPending}>
        <Form form={form} layout="vertical" onFinish={v => addMut.mutate(v)}>
          <Form.Item name="ip" label="IP Address or CIDR" rules={[{ required: true }]}>
            <Input placeholder="192.168.1.1 or 10.0.0.0/8" />
          </Form.Item>
          <Form.Item name="reason" label="Reason">
            <Input placeholder="Optional reason" />
          </Form.Item>
          <Form.Item name="expires_in" label="Expires In (hours)" extra="Leave empty for permanent ban">
            <InputNumber min={1} max={8760} style={{ width: '100%' }} placeholder="e.g. 24" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default IPBansPage
