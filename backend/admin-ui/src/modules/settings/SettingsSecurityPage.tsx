import React from 'react'
import { Card, Form, Switch, InputNumber, Button, Typography, message, Divider, Alert, Row, Col, Statistic } from 'antd'
import {
  SaveOutlined, CheckCircleOutlined, LockOutlined, SafetyOutlined,
  FieldTimeOutlined, AlertOutlined, RobotOutlined, ArrowRightOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getSettings, updateSettings, getProfile } from '../../core/api'

const { Title, Text } = Typography

interface SettingRow {
  name: string
  label: string
  description: string
  icon: React.ReactNode
  type: 'switch' | 'number'
  min?: number
  max?: number
  suffix?: string
  danger?: boolean
}

const SettingToggleRow: React.FC<{ row: SettingRow }> = ({ row }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12,
    borderLeft: row.danger ? '3px solid #ff4d4f' : '3px solid #1668dc',
    background: 'rgba(255,255,255,0.02)',
  }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
      <div style={{
        fontSize: 20, color: row.danger ? '#ff4d4f' : '#1668dc',
        marginTop: 2, minWidth: 24, textAlign: 'center',
      }}>
        {row.icon}
      </div>
      <div>
        <Text strong style={{ fontSize: 14 }}>{row.label}</Text>
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Text>
        </div>
      </div>
    </div>
    <Form.Item name={row.name} valuePropName="checked" style={{ margin: 0, marginLeft: 16 }}>
      <Switch />
    </Form.Item>
  </div>
)

const SettingsSecurityPage: React.FC = () => {
  const [form] = Form.useForm()
  const [saved, setSaved] = React.useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: myProfile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => getProfile().then(r => r.data),
  })

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => {
      const s = r.data
      form.setFieldsValue({
        admin_captcha_enabled: s.admin_captcha_enabled === 'true',
        admin_2fa_required: s.admin_2fa_required === 'true',
        admin_session_timeout: parseInt(s.admin_session_timeout || '1440', 10),
        admin_lockout_attempts: parseInt(s.admin_lockout_attempts || '5', 10),
        admin_lockout_duration: parseInt(s.admin_lockout_duration || '15', 10),
      })
      return s
    }),
  })

  const saveMut = useMutation({
    mutationFn: (data: any) => updateSettings({
      admin_captcha_enabled:  String(!!data.admin_captcha_enabled),
      admin_2fa_required:     String(!!data.admin_2fa_required),
      admin_session_timeout:  String(data.admin_session_timeout || 1440),
      admin_lockout_attempts: String(data.admin_lockout_attempts || 5),
      admin_lockout_duration: String(data.admin_lockout_duration || 15),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      message.success('Security settings saved')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to save'),
  })

  const sessionTimeoutHours = settings
    ? Math.round(parseInt(settings.admin_session_timeout || '1440', 10) / 60)
    : 24

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>Security Settings</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Configure authentication and access control for the admin panel
      </Text>

      {/* Stats row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Session Timeout"
              value={sessionTimeoutHours}
              suffix="h"
              valueStyle={{ fontSize: 20, color: '#1668dc' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Lockout After"
              value={settings ? parseInt(settings.admin_lockout_attempts || '5', 10) : 5}
              suffix="attempts"
              valueStyle={{ fontSize: 20, color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Lockout Duration"
              value={settings ? parseInt(settings.admin_lockout_duration || '15', 10) : 15}
              suffix="min"
              valueStyle={{ fontSize: 20, color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="2FA Required"
              value={settings?.admin_2fa_required === 'true' ? 'ON' : 'OFF'}
              valueStyle={{ fontSize: 20, color: settings?.admin_2fa_required === 'true' ? '#52c41a' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" onFinish={v => saveMut.mutate(v)}>

          {saved && (
            <Alert
              message="Security settings saved successfully"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 24 }}
              closable
            />
          )}

          {/* Authentication */}
          <Divider orientation="left">
            <span><LockOutlined style={{ marginRight: 8 }} />Authentication</span>
          </Divider>

          {/* 2FA Info Box */}
          <Alert
            type="info"
            showIcon
            icon={<SafetyOutlined />}
            style={{ marginBottom: 16 }}
            message="Two-Factor Authentication (2FA)"
            description={
              <div>
                <div style={{ marginBottom: 8 }}>
                  The toggle below is a <strong>server-wide policy</strong> — it forces <em>all</em> admin
                  accounts to have 2FA before they can log in.
                </div>
                <div style={{ marginBottom: 8 }}>
                  To <strong>set up 2FA for your own account</strong> (get QR code, scan with Google Authenticator, etc.)
                  go to <strong>Account → Security</strong>:
                </div>
                <Button
                  size="small"
                  type={myProfile?.two_factor_enabled ? 'default' : 'primary'}
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate('/account/security')}
                >
                  {myProfile?.two_factor_enabled ? '✓ My 2FA is enabled — manage it here' : 'Setup MY 2FA now →'}
                </Button>
              </div>
            }
          />

          {settings?.admin_2fa_required === 'true' && !myProfile?.two_factor_enabled && (
            <Alert
              type="warning"
              showIcon
              message="Warning: Your own account does NOT have 2FA enabled!"
              description="If you save with this policy ON and your account lacks 2FA, you will be locked out. Enable 2FA for your account first."
              style={{ marginBottom: 16 }}
            />
          )}

          <SettingToggleRow row={{
            name: 'admin_captcha_enabled',
            label: 'Login CAPTCHA',
            description: 'Show a math challenge on the admin login page to prevent automated attacks. Recommended for public-facing servers.',
            icon: <RobotOutlined />,
            type: 'switch',
          }} />

          <SettingToggleRow row={{
            name: 'admin_2fa_required',
            label: 'Require Two-Factor Authentication',
            description: 'All admin accounts must have 2FA enabled to log in. Admins without 2FA will be blocked until they set it up. ⚠️ Make sure your own account has 2FA enabled before activating this.',
            icon: <SafetyOutlined />,
            type: 'switch',
            danger: true,
          }} />

          {/* Sessions */}
          <Divider orientation="left">
            <span><FieldTimeOutlined style={{ marginRight: 8 }} />Sessions</span>
          </Divider>

          <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #722ed1', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 20, color: '#722ed1', marginTop: 2, minWidth: 24, textAlign: 'center' }}>
                <FieldTimeOutlined />
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 14 }}>Session Timeout</Text>
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Admin sessions expire after this many minutes of creation. Users will need to re-login. (1440 min = 24h)
                  </Text>
                </div>
                <Form.Item name="admin_session_timeout" style={{ margin: 0 }}>
                  <InputNumber
                    min={5} max={43200}
                    style={{ width: 200 }}
                    addonAfter="minutes"
                    placeholder="1440"
                  />
                </Form.Item>
              </div>
            </div>
          </div>

          {/* Brute Force */}
          <Divider orientation="left">
            <span><AlertOutlined style={{ marginRight: 8 }} />Brute Force Protection</span>
          </Divider>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #faad14', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 20, color: '#faad14', marginTop: 2, minWidth: 24, textAlign: 'center' }}>
                    <AlertOutlined />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 14 }}>Max Failed Attempts</Text>
                    <div style={{ marginTop: 4, marginBottom: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Lock account after this many failed login attempts. Applied per admin account.
                      </Text>
                    </div>
                    <Form.Item name="admin_lockout_attempts" style={{ margin: 0 }}>
                      <InputNumber min={3} max={20} style={{ width: '100%' }} addonAfter="attempts" placeholder="5" />
                    </Form.Item>
                  </div>
                </div>
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #ff4d4f', background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 20, color: '#ff4d4f', marginTop: 2, minWidth: 24, textAlign: 'center' }}>
                    <LockOutlined />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: 14 }}>Lockout Duration</Text>
                    <div style={{ marginTop: 4, marginBottom: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        How long accounts stay locked after exceeding failed attempts.
                      </Text>
                    </div>
                    <Form.Item name="admin_lockout_duration" style={{ margin: 0 }}>
                      <InputNumber min={1} max={1440} style={{ width: '100%' }} addonAfter="minutes" placeholder="15" />
                    </Form.Item>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          <div style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
              loading={saveMut.isPending}
              size="large"
            >
              {saved ? 'Saved!' : 'Save Security Settings'}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default SettingsSecurityPage
