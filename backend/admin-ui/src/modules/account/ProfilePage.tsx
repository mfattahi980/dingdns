import React from 'react'
import { Card, Form, Input, Button, Typography, message, Descriptions, Tag } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfile, updateProfile } from '../../core/api'
// Profile uses API data directly

const { Title } = Typography

const ProfilePage: React.FC = () => {
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then(r => {
      // backend returns flat object (no 'admin' wrapper)
      form.setFieldsValue({ email: r.data.email })
      return r.data
    }),
  })

  const updateMut = useMutation({
    mutationFn: (data: any) => updateProfile(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); message.success('Profile updated') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>My Account</Title>

      <Card title="Profile Info" style={{ marginBottom: 16 }} loading={isLoading}>
        <Descriptions column={1}>
          <Descriptions.Item label="Username">{profile?.username}</Descriptions.Item>
          <Descriptions.Item label="Role">
            <Tag color={profile?.role === 'super_admin' ? 'gold' : 'blue'}>{profile?.role}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="2FA">
            <Tag color={profile?.two_factor_enabled ? 'green' : 'orange'}>
              {profile?.two_factor_enabled ? 'Enabled' : 'Disabled'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Last Login">
            {profile?.last_login ? new Date(profile.last_login).toLocaleString() : 'Unknown'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Update Email">
        <Form form={form} layout="vertical" onFinish={v => updateMut.mutate(v)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={updateMut.isPending}>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default ProfilePage
