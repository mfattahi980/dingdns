import React, { useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Tag, Space, Typography, message, Popconfirm, Switch, Checkbox } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAdmins, createAdmin, updateAdmin, deleteAdmin, getPermissions } from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title } = Typography

const AdminsPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { admin: currentAdmin } = useAuth()

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: () => getAdmins().then(r => r.data.admins),
  })

  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => getPermissions().then(r => r.data.permissions),
  })

  const createMut = useMutation({
    mutationFn: (data: any) => createAdmin(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admins'] }); setModalOpen(false); message.success('Admin created') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => updateAdmin(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admins'] }); setModalOpen(false); setEditing(null); message.success('Updated') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAdmin(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admins'] }); message.success('Deleted') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ role: 'admin', is_active: true })
    setModalOpen(true)
  }

  const parsePermsString = (raw: string): string[] => {
    if (!raw || raw === '*') return []
    try { return JSON.parse(raw) } catch { return raw.split(',').map(s => s.trim()).filter(Boolean) }
  }

  const openEdit = (record: any) => {
    setEditing(record)
    const perms = record.role === 'super_admin' ? [] : parsePermsString(record.permissions)
    form.setFieldsValue({ ...record, permissions: perms })
    setModalOpen(true)
  }

  const handleSubmit = (values: any) => {
    const data = { ...values }
    // backend expects permissions as []string (not encoded) — let backend handle encoding
    if (data.role === 'super_admin') {
      data.permissions = ['*']
    }
    if (editing) {
      if (!data.password) delete data.password
      updateMut.mutate({ id: editing.id, data })
    } else {
      createMut.mutate(data)
    }
  }

  const roleWatch = Form.useWatch('role', form)

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => <strong>{v}</strong> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Role', dataIndex: 'role', key: 'role', width: 120,
      render: (v: string) => <Tag color={v === 'super_admin' ? 'gold' : 'blue'}>{v}</Tag> },
    { title: 'Active', dataIndex: 'is_active', key: 'active', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: '2FA', dataIndex: 'two_factor_enabled', key: '2fa', width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'On' : 'Off'}</Tag> },
    { title: 'Last Login', dataIndex: 'last_login', key: 'last_login', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString() : 'Never' },
    { title: 'Actions', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          {record.id !== currentAdmin?.id && (
            <Popconfirm title="Delete this admin?" onConfirm={() => deleteMut.mutate(record.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Admin Management</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Admin</Button>
      </div>

      <Card>
        <Table columns={columns} dataSource={admins || []} loading={isLoading} rowKey="id" scroll={{ x: 800 }} />
      </Card>

      <Modal title={editing ? 'Edit Admin' : 'Create Admin'} open={modalOpen} width={600}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={() => form.submit()} confirmLoading={createMut.isPending || updateMut.isPending}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input disabled={!!editing} />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={editing ? 'New Password (leave empty to keep)' : 'Password'}
            rules={editing ? [] : [{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={[
              { value: 'admin', label: 'Admin' },
              { value: 'super_admin', label: 'Super Admin' },
            ]} />
          </Form.Item>
          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
          {roleWatch !== 'super_admin' && (
            <Form.Item name="permissions" label="Permissions">
              <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(permissions || []).map((p: any) => (
                  <Checkbox key={p.key} value={p.key}>{p.label}</Checkbox>
                ))}
              </Checkbox.Group>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}

export default AdminsPage
