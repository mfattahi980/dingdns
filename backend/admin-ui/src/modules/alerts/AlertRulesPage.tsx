import React, { useState } from 'react'
import { Card, Table, Button, Modal, Form, Select, InputNumber, Switch, Tag, Typography, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAlertRules, updateAlertRule } from '../../core/api'

const { Title } = Typography

const severityColors: Record<string, string> = {
  critical: 'red', high: 'volcano', medium: 'orange', low: 'blue', info: 'default',
}

const AlertRulesPage: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alertRules'],
    queryFn: () => getAlertRules().then(r => r.data.rules),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => updateAlertRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] })
      setModalOpen(false)
      message.success('Rule updated')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 140,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Severity', dataIndex: 'severity', key: 'severity', width: 100,
      render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v}</Tag> },
    { title: 'Threshold', dataIndex: 'threshold', key: 'threshold', width: 100 },
    { title: 'Enabled', dataIndex: 'is_enabled', key: 'enabled', width: 90,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'Notify', dataIndex: 'notify_email', key: 'notify', width: 90,
      render: (v: boolean) => <Tag color={v ? 'blue' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
    { title: 'Actions', key: 'actions', width: 80,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => {
          setEditing(record); form.setFieldsValue(record); setModalOpen(true)
        }} />
      ),
    },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Alert Rules</Title>

      <Card>
        <Table columns={columns} dataSource={rules || []} loading={isLoading} rowKey="id"
          pagination={false} scroll={{ x: 700 }} />
      </Card>

      <Modal title="Edit Alert Rule" open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        onOk={() => form.submit()} confirmLoading={updateMut.isPending}>
        <Form form={form} layout="vertical"
          onFinish={v => updateMut.mutate({ id: editing.id, data: v })}>
          <Form.Item name="severity" label="Severity">
            <Select options={['critical', 'high', 'medium', 'low', 'info'].map(s => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="threshold" label="Threshold">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="is_enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notify_email" label="Email Notification" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AlertRulesPage
