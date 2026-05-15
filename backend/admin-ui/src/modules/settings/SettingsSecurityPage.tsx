import React from 'react'
import { Card, Form, Switch, InputNumber, Button, Typography, message, Divider, Alert, Row, Col, Statistic, Select, Space, Tag } from 'antd'
import {
  SaveOutlined, CheckCircleOutlined, LockOutlined, SafetyOutlined,
  FieldTimeOutlined, AlertOutlined, RobotOutlined, ArrowRightOutlined,
  StopOutlined, FireOutlined, ThunderboltOutlined,
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
        // Auto-Ban engine
        auto_ban_enabled:               s.auto_ban_enabled === 'true',
        auto_ban_threshold:             parseInt(s.auto_ban_threshold || '5', 10),
        auto_ban_window_minutes:        parseInt(s.auto_ban_window_minutes || '10', 10),
        auto_ban_duration:              s.auto_ban_duration || '1h',
        auto_ban_firewall_mode:         s.auto_ban_firewall_mode || 'app_only',
        auto_ban_trigger_bad_api_key:   s.auto_ban_trigger_bad_api_key !== 'false',
        auto_ban_trigger_bad_origin:    s.auto_ban_trigger_bad_origin !== 'false',
        auto_ban_trigger_bad_ip:        s.auto_ban_trigger_bad_ip !== 'false',
        auto_ban_trigger_rate_limit:    s.auto_ban_trigger_rate_limit !== 'false',
        auto_ban_trigger_bad_login:     s.auto_ban_trigger_bad_login !== 'false',
        auto_ban_trigger_bad_token:     s.auto_ban_trigger_bad_token !== 'false',
        auto_ban_trigger_bad_path:      s.auto_ban_trigger_bad_path === 'true',
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
      // Auto-Ban engine
      auto_ban_enabled:              String(!!data.auto_ban_enabled),
      auto_ban_threshold:            String(data.auto_ban_threshold || 5),
      auto_ban_window_minutes:       String(data.auto_ban_window_minutes || 10),
      auto_ban_duration:             String(data.auto_ban_duration || '1h'),
      auto_ban_firewall_mode:        String(data.auto_ban_firewall_mode || 'app_only'),
      auto_ban_trigger_bad_api_key:  String(!!data.auto_ban_trigger_bad_api_key),
      auto_ban_trigger_bad_origin:   String(!!data.auto_ban_trigger_bad_origin),
      auto_ban_trigger_bad_ip:       String(!!data.auto_ban_trigger_bad_ip),
      auto_ban_trigger_rate_limit:   String(!!data.auto_ban_trigger_rate_limit),
      auto_ban_trigger_bad_login:    String(!!data.auto_ban_trigger_bad_login),
      auto_ban_trigger_bad_token:    String(!!data.auto_ban_trigger_bad_token),
      auto_ban_trigger_bad_path:     String(!!data.auto_ban_trigger_bad_path),
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

          {/* Auto-Ban Engine */}
          <Divider orientation="left">
            <span><ThunderboltOutlined style={{ marginRight: 8 }} />Auto-Ban Engine</span>
          </Divider>

          <Alert
            type="info"
            showIcon
            icon={<StopOutlined />}
            style={{ marginBottom: 16 }}
            message="Automatic IP blacklisting for suspicious API traffic"
            description={
              <div style={{ fontSize: 12 }}>
                When an IP triggers too many suspicious events (bad API key, bad origin, rate-limit,
                bad login, bad DDNS token, etc.) within the configured time window, it gets banned
                automatically. Banned IPs and per-event records are visible under{' '}
                <strong>Security → Suspicious Activity</strong> and <strong>Security → IP Bans</strong>{' '}
                — you can always un-ban an IP from there.
              </div>
            }
          />

          <SettingToggleRow row={{
            name: 'auto_ban_enabled',
            label: 'Enable Auto-Ban',
            description: 'Master switch. When OFF, suspicious events are still logged but no IP is banned automatically.',
            icon: <ThunderboltOutlined />,
            type: 'switch',
          }} />

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #faad14', background: 'rgba(255,255,255,0.02)' }}>
                <Text strong style={{ fontSize: 14 }}>Threshold</Text>
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Number of suspicious events from a single IP before banning.
                  </Text>
                </div>
                <Form.Item name="auto_ban_threshold" style={{ margin: 0 }}>
                  <InputNumber min={1} max={1000} style={{ width: '100%' }} addonAfter="events" placeholder="5" />
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #faad14', background: 'rgba(255,255,255,0.02)' }}>
                <Text strong style={{ fontSize: 14 }}>Time Window</Text>
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Sliding window for counting suspicious events.
                  </Text>
                </div>
                <Form.Item name="auto_ban_window_minutes" style={{ margin: 0 }}>
                  <InputNumber min={1} max={1440} style={{ width: '100%' }} addonAfter="minutes" placeholder="10" />
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #ff4d4f', background: 'rgba(255,255,255,0.02)' }}>
                <Text strong style={{ fontSize: 14 }}>Ban Duration</Text>
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    How long a ban lasts. Progressive grows on repeat offenders.
                  </Text>
                </div>
                <Form.Item name="auto_ban_duration" style={{ margin: 0 }}>
                  <Select style={{ width: '100%' }}
                    options={[
                      { value: '1h',          label: '1 hour' },
                      { value: '24h',         label: '24 hours' },
                      { value: 'permanent',   label: 'Permanent (until you remove it)' },
                      { value: 'progressive', label: 'Progressive (1h → 24h → permanent)' },
                    ]} />
                </Form.Item>
              </div>
            </Col>
          </Row>

          <div style={{ padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12, borderLeft: '3px solid #1668dc', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ fontSize: 20, color: '#1668dc', marginTop: 2, minWidth: 24, textAlign: 'center' }}>
                <FireOutlined />
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 14 }}>Firewall Mode</Text>
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Choose whether the auto-ban also pushes an iptables/ufw DROP rule onto the host firewall.
                  </Text>
                </div>
                <Form.Item name="auto_ban_firewall_mode" style={{ margin: 0 }}>
                  <Select style={{ width: '100%', maxWidth: 460 }}
                    options={[
                      { value: 'app_only',           label: 'App-level ban only (recommended)' },
                      { value: 'app_and_firewall',   label: 'App + iptables DROP rule' },
                      { value: 'firewall_only',      label: 'Only iptables DROP rule (skip app ban)' },
                    ]} />
                </Form.Item>
              </div>
            </div>
          </div>

          <Divider orientation="left" plain>
            <Tag color="orange">Triggers</Tag>
          </Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            Decide which suspicious events count toward the threshold. Disabled events are still
            logged in <strong>Suspicious Activity</strong>, they just don't cause auto-bans.
          </Text>

          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_api_key',
            label: 'Bad / missing API key',
            description: 'Request to /api/* without X-API-Key header, or with an unknown/inactive key.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_origin',
            label: 'Disallowed Origin',
            description: 'API key found, but the Origin header is not in its allowed-origins list.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_ip',
            label: 'Disallowed source IP',
            description: 'API key found, but the client IP is not in the key\'s allowed-IPs list.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_rate_limit',
            label: 'Rate-limit exceeded',
            description: 'Hammering the API past 120 requests/minute is a strong flooding signal.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_login',
            label: 'Bad admin login',
            description: 'Wrong username, password, or 2FA code on the admin panel.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_token',
            label: 'Bad DDNS token',
            description: '/api/ddns/update or /nic/update called with an invalid token / basic-auth.',
            icon: <StopOutlined />, type: 'switch',
          }} />
          <SettingToggleRow row={{
            name: 'auto_ban_trigger_bad_path',
            label: 'Unknown / scanning paths',
            description: 'Reserved for future use — currently a no-op until path-scan detection lands.',
            icon: <StopOutlined />, type: 'switch',
          }} />

          <div style={{ marginTop: 24 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
                loading={saveMut.isPending}
                size="large"
              >
                {saved ? 'Saved!' : 'Save Security Settings'}
              </Button>
              <Button
                size="large"
                icon={<StopOutlined />}
                onClick={() => navigate('/security/suspicious-activity')}
              >
                View Suspicious Activity →
              </Button>
            </Space>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default SettingsSecurityPage
