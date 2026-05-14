import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, message, Alert, Space, Switch, Table, Tag, Modal, QRCode } from 'antd'
import { LockOutlined, SafetyOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { changePassword, setup2FA, verify2FA, disable2FA, getIPAllowlist, addIPAllowlist, deleteIPAllowlist, toggleIPRestriction, getProfile } from '../../core/api'

const { Title, Text } = Typography

const SecurityPage: React.FC = () => {
  const [pwForm] = Form.useForm()
  const [totpData, setTotpData] = useState<any>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [ipForm] = Form.useForm()
  const [ipModalOpen, setIpModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then(r => r.data), // flat object, no 'admin' wrapper
  })

  const { data: ipList, isLoading: ipLoading } = useQuery({
    queryKey: ['ipAllowlist'],
    queryFn: () => getIPAllowlist().then(r => {
      // backend returns plain array
      return Array.isArray(r.data) ? r.data : (r.data.ips || [])
    }),
  })

  const changePwMut = useMutation({
    mutationFn: (data: any) => changePassword(data),
    onSuccess: () => { pwForm.resetFields(); message.success('Password changed') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const setup2FAMut = useMutation({
    mutationFn: () => setup2FA(),
    onSuccess: (res) => setTotpData(res.data),
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const verify2FAMut = useMutation({
    mutationFn: (code: string) => verify2FA(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setTotpData(null)
      message.success('2FA enabled!')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const disable2FAMut = useMutation({
    mutationFn: (password: string) => disable2FA(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      setDisablePassword('')
      message.success('2FA disabled')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const addIpMut = useMutation({
    mutationFn: (data: any) => addIPAllowlist(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ipAllowlist'] }); setIpModalOpen(false); message.success('IP added') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const deleteIpMut = useMutation({
    mutationFn: (id: number) => deleteIPAllowlist(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ipAllowlist'] }); message.success('IP removed') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const toggleIpMut = useMutation({
    mutationFn: (enabled: boolean) => toggleIPRestriction(enabled),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['ipAllowlist'] }); queryClient.invalidateQueries({ queryKey: ['profile'] }) },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Security</Title>

      {/* Change Password */}
      <Card title={<><LockOutlined /> Change Password</>} style={{ marginBottom: 16 }}>
        <Form form={pwForm} layout="vertical" onFinish={v => changePwMut.mutate(v)} style={{ maxWidth: 400 }}>
          <Form.Item name="old_password" label="Current Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="new_password" label="New Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={changePwMut.isPending}>Change Password</Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 2FA */}
      <Card title={<><SafetyOutlined /> Two-Factor Authentication</>} style={{ marginBottom: 16 }}>
        {profile?.two_factor_enabled ? (
          <div>
            <Alert message="2FA is enabled" type="success" showIcon style={{ marginBottom: 16 }} />
            <Space>
              <Input.Password placeholder="Enter password to disable" value={disablePassword}
                onChange={e => setDisablePassword(e.target.value)} style={{ width: 250 }} />
              <Button danger onClick={() => disable2FAMut.mutate(disablePassword)}
                loading={disable2FAMut.isPending} disabled={!disablePassword}>
                Disable 2FA
              </Button>
            </Space>
          </div>
        ) : totpData ? (
          <div>
            <Alert message="Scan this QR code with your authenticator app" type="info" showIcon style={{ marginBottom: 16 }} />
            {/* Render the QR client-side from the otpauth:// URI. The backend
                returns `uri` directly (no base64 PNG), and antd's QRCode is
                a built-in component, so no extra dependency is needed. */}
            {(totpData.uri || totpData.qr_code) && (
              <div style={{ marginBottom: 16 }}>
                {totpData.uri ? (
                  <QRCode value={totpData.uri} size={200} bordered={false} />
                ) : (
                  <img src={`data:image/png;base64,${totpData.qr_code}`} alt="QR Code" style={{ width: 200 }} />
                )}
              </div>
            )}
            <Text code copyable style={{ display: 'block', marginBottom: 16 }}>{totpData.secret}</Text>
            {totpData.backup_codes && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>Backup Codes (save these!):</Text>
                <div style={{ marginTop: 8 }}>
                  {totpData.backup_codes.map((c: string, i: number) => (
                    <Tag key={i} style={{ marginBottom: 4 }}>{c}</Tag>
                  ))}
                </div>
              </div>
            )}
            <Space>
              <Input placeholder="Enter 6-digit code" value={verifyCode} maxLength={6}
                onChange={e => setVerifyCode(e.target.value)} style={{ width: 200 }} />
              <Button type="primary" onClick={() => verify2FAMut.mutate(verifyCode)}
                loading={verify2FAMut.isPending} disabled={verifyCode.length !== 6}>
                Verify & Enable
              </Button>
            </Space>
          </div>
        ) : (
          <Button type="primary" onClick={() => setup2FAMut.mutate()} loading={setup2FAMut.isPending}>
            Setup 2FA
          </Button>
        )}
      </Card>

      {/* IP Allowlist */}
      <Card title="IP Allowlist" extra={
        <Space>
          <Switch checked={profile?.ip_restricted} onChange={v => toggleIpMut.mutate(v)}
            checkedChildren="Enabled" unCheckedChildren="Disabled" />
          <Button size="small" icon={<PlusOutlined />} onClick={() => { ipForm.resetFields(); setIpModalOpen(true) }}>Add IP</Button>
        </Space>
      }>
        <Table
          dataSource={Array.isArray(ipList) ? ipList : []}
          loading={ipLoading}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            { title: 'IP', dataIndex: 'ip', key: 'ip' },
            { title: 'Label', dataIndex: 'label', key: 'label' },
            { title: 'Added', dataIndex: 'created_at', key: 'created', width: 160,
              render: (v: string) => new Date(v).toLocaleString() },
            { title: '', key: 'del', width: 60,
              render: (_: any, r: any) => (
                <Button size="small" danger icon={<DeleteOutlined />}
                  onClick={() => deleteIpMut.mutate(r.id)} />
              ),
            },
          ]}
        />
      </Card>

      <Modal title="Add IP to Allowlist" open={ipModalOpen}
        onCancel={() => setIpModalOpen(false)} onOk={() => ipForm.submit()}
        confirmLoading={addIpMut.isPending}>
        <Form form={ipForm} layout="vertical" onFinish={v => addIpMut.mutate(v)}>
          <Form.Item name="ip" label="IP Address" rules={[{ required: true }]}>
            <Input placeholder="1.2.3.4" />
          </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder="Office" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SecurityPage
