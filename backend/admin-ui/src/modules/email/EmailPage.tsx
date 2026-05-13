import React, { useState } from 'react'
import { Card, Form, Input, InputNumber, Switch, Button, Typography, message, Space, Divider } from 'antd'
import { SaveOutlined, SendOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getEmailSettings, updateEmailSettings, sendTestEmail } from '../../core/api'

const { Title } = Typography

const EmailPage: React.FC = () => {
  const [testEmail, setTestEmail] = useState('')
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

  const { isLoading } = useQuery({
    queryKey: ['emailSettings'],
    queryFn: () => getEmailSettings().then(r => {
      const s = r.data
      // backend returns all values as strings; convert for form controls
      form.setFieldsValue({
        smtp_host: s.smtp_host,
        smtp_port: parseInt(s.smtp_port || '587', 10),
        smtp_username: s.smtp_username,
        smtp_password: s.smtp_password,
        smtp_from: s.smtp_from,
        smtp_tls: s.smtp_tls === 'true',
      })
      return s
    }),
  })

  const saveMut = useMutation({
    mutationFn: (data: any) => {
      // backend expects all values as strings
      const payload: Record<string, string> = {
        smtp_host: data.smtp_host || '',
        smtp_port: String(data.smtp_port || 587),
        smtp_username: data.smtp_username || '',
        smtp_password: data.smtp_password || '',
        smtp_from: data.smtp_from || '',
        smtp_tls: String(!!data.smtp_tls),
      }
      return updateEmailSettings(payload)
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['emailSettings'] }); message.success('Settings saved') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const testMut = useMutation({
    mutationFn: (email: string) => sendTestEmail(email),
    onSuccess: () => message.success('Test email sent'),
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Email Settings</Title>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" onFinish={v => saveMut.mutate(v)}>
          <Form.Item name="smtp_host" label="SMTP Host" rules={[{ required: true }]}>
            <Input placeholder="smtp.gmail.com" />
          </Form.Item>
          <Form.Item name="smtp_port" label="SMTP Port">
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="587" />
          </Form.Item>
          <Form.Item name="smtp_username" label="Username">
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="smtp_password" label="Password">
            <Input.Password placeholder="App password" />
          </Form.Item>
          <Form.Item name="smtp_from" label="From Email">
            <Input placeholder="noreply@example.com" />
          </Form.Item>
          <Form.Item name="smtp_tls" label="Use TLS" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Button type="primary" htmlType="submit" icon={<SaveOutlined />}
            loading={saveMut.isPending}>Save Settings</Button>
        </Form>

        <Divider />

        <Title level={5}>Send Test Email</Title>
        <Space>
          <Input placeholder="test@example.com" value={testEmail}
            onChange={e => setTestEmail(e.target.value)} style={{ width: 300 }} />
          <Button icon={<SendOutlined />} onClick={() => testMut.mutate(testEmail)}
            loading={testMut.isPending} disabled={!testEmail}>
            Send Test
          </Button>
        </Space>
      </Card>
    </div>
  )
}

export default EmailPage
