import React, { useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, Typography, message, Popconfirm, Switch } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getZones, createZone, updateZone, deleteZone } from '../../core/api'

const { Title } = Typography

const ZonesPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: zones, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: () => getZones().then(r => r.data.zones),
  })

  const createMut = useMutation({
    mutationFn: (data: any) => createZone(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zones'] }); setModalOpen(false); message.success('Zone created') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => updateZone(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zones'] }); setModalOpen(false); setEditing(null); message.success('Zone updated') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteZone(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['zones'] }); message.success('Zone deleted') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ zone_type: 'primary' })
    setModalOpen(true)
  }

  const openEdit = (record: any) => {
    setEditing(record)
    form.setFieldsValue(record)
    setModalOpen(true)
  }

  const handleSubmit = (values: any) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, data: values })
    } else {
      createMut.mutate(values)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Domain', dataIndex: 'name', key: 'name',
      render: (v: string) => <strong>{v}</strong> },
    { title: 'Type', dataIndex: 'zone_type', key: 'zone_type', width: 100,
      render: (v: string) => <Tag color={v === 'primary' ? 'blue' : 'green'}>{v}</Tag> },
    { title: 'Active', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'SOA Serial', dataIndex: 'soa_serial', key: 'soa_serial', width: 120 },
    { title: 'Created', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Actions', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<FileTextOutlined />}
            onClick={() => navigate(`/dns/zones/${record.id}/records`)}>
            Records
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Delete this zone?" onConfirm={() => deleteMut.mutate(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>DNS Zones</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Zone</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={zones || []} loading={isLoading} rowKey="id"
          pagination={{ pageSize: 20 }} scroll={{ x: 800 }} />
      </Card>

      <Modal
        title={editing ? 'Edit Zone' : 'Create Zone'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={() => form.submit()}
        confirmLoading={createMut.isPending || updateMut.isPending}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Domain Name" rules={[{ required: true }]}>
            <Input placeholder="example.com" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="zone_type" label="Zone Type">
            <Select options={[
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
            ]} />
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

export default ZonesPage
