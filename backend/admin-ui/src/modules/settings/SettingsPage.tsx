import React from 'react'
import { Card, Form, Input, Switch, Button, Typography, message, Divider, Alert, Space, Tag, Tooltip, InputNumber } from 'antd'
import {
  SaveOutlined, CheckCircleOutlined, GlobalOutlined,
  CloudServerOutlined, SyncOutlined, LinkOutlined, LockOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, detectServerIP, getServerInfo } from '../../core/api'

const { Title, Text } = Typography

const SettingsGeneralPage: React.FC = () => {
  const [form] = Form.useForm()
  const [saved, setSaved] = React.useState(false)
  const queryClient = useQueryClient()

  const { isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => {
      const s = r.data
      form.setFieldsValue({
        base_url: s.base_url,
        api_domain: s.api_domain,
        maintenance_mode: s.maintenance_mode === 'true',
        server_domain: s.server_domain,
        server_ip: s.server_ip,
        ns1_hostname: s.ns1_hostname,
        ns2_hostname: s.ns2_hostname,
        ssl_redirect_http:  s.ssl_redirect_http  !== 'false',
        ssl_allow_http_port: s.ssl_allow_http_port !== 'false',
        ssl_auto_renew: s.ssl_auto_renew === 'true',
        ssl_renew_days_before: s.ssl_renew_days_before ? Number(s.ssl_renew_days_before) : 30,
      })
      return s
    }),
  })

  // Server info for showing current detected IP
  const { data: serverInfo } = useQuery({
    queryKey: ['serverInfo'],
    queryFn: () => getServerInfo().then(r => r.data),
  })

  const saveMut = useMutation({
    mutationFn: (data: any) => updateSettings({
      base_url:             data.base_url || '',
      api_domain:           data.api_domain || '',
      maintenance_mode:     String(!!data.maintenance_mode),
      server_domain:        data.server_domain || '',
      server_ip:            data.server_ip || '',
      ns1_hostname:         data.ns1_hostname || '',
      ns2_hostname:         data.ns2_hostname || '',
      ssl_redirect_http:    String(!!data.ssl_redirect_http),
      ssl_allow_http_port:  String(!!data.ssl_allow_http_port),
      ssl_auto_renew:       String(!!data.ssl_auto_renew),
      ssl_renew_days_before: String(data.ssl_renew_days_before || 30),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['serverInfo'] })
      message.success('Settings saved successfully')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to save settings'),
  })

  const detectIPMut = useMutation({
    mutationFn: () => detectServerIP(),
    onSuccess: (res) => {
      form.setFieldValue('server_ip', res.data.ip)
      message.success(`Detected IP: ${res.data.ip}`)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => message.error('Could not detect public IP'),
  })

  const testBaseURL = () => {
    const url = form.getFieldValue('base_url')
    if (!url) { message.warning('Enter a Base URL first'); return }
    window.open(url, '_blank')
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>General Settings</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Configure your server identity and general behavior
      </Text>

      <Card loading={isLoading}>
        <Form form={form} layout="vertical" onFinish={v => saveMut.mutate(v)}>

          {saved && (
            <Alert message="Settings saved successfully" type="success"
              showIcon icon={<CheckCircleOutlined />} style={{ marginBottom: 24 }} closable />
          )}

          {/* Server Identity */}
          <Divider orientation="left">
            <span><CloudServerOutlined style={{ marginRight: 8 }} />Server Identity</span>
          </Divider>

          <div style={{ background: 'rgba(22, 104, 220, 0.06)', border: '1px solid #1668dc44', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              These settings define how your DNS server identifies itself. The domain and IP are used in NS records, emails, and DNS tests.
            </Text>
          </div>

          <Form.Item name="server_domain" label="Primary Server Domain"
            extra="Your main domain (e.g. dingdns.com). Used for NS records, SSL, and emails.">
            <Input
              prefix={<GlobalOutlined style={{ color: '#1668dc' }} />}
              placeholder="dingdns.com"
              style={{ maxWidth: 400 }}
            />
          </Form.Item>

          <Form.Item label="Server Public IP"
            extra="Your server's public IP address. Used for DNS zone testing.">
            <Space>
              <Form.Item name="server_ip" style={{ margin: 0 }}>
                <Input
                  prefix={<CloudServerOutlined style={{ color: '#52c41a' }} />}
                  placeholder="1.2.3.4"
                  style={{ width: 220 }}
                />
              </Form.Item>
              <Button
                icon={<SyncOutlined />}
                onClick={() => detectIPMut.mutate()}
                loading={detectIPMut.isPending}
              >
                Auto Detect
              </Button>
              {serverInfo?.server_ip && (
                <Tag color="blue">Current: {serverInfo.server_ip}</Tag>
              )}
            </Space>
          </Form.Item>

          <Form.Item name="ns1_hostname" label="NS1 Hostname"
            extra="First nameserver hostname (e.g. ns1.dingdns.com). Leave blank to auto-generate from server domain.">
            <Input placeholder="ns1.dingdns.com" style={{ maxWidth: 400 }} />
          </Form.Item>

          <Form.Item name="ns2_hostname" label="NS2 Hostname"
            extra="Second nameserver hostname (e.g. ns2.dingdns.com).">
            <Input placeholder="ns2.dingdns.com" style={{ maxWidth: 400 }} />
          </Form.Item>

          {/* Base URL */}
          <Divider orientation="left">
            <span><LinkOutlined style={{ marginRight: 8 }} />Public URL</span>
          </Divider>

          <Form.Item name="base_url" label="Base URL"
            extra="Full public URL of this admin panel / main site. Used in email links (password reset, verification, etc.)">
            <Space>
              <Form.Item name="base_url" noStyle>
                <Input placeholder="https://dingdns.com" style={{ width: 360 }} />
              </Form.Item>
              <Tooltip title="Open URL in new tab to test">
                <Button icon={<LinkOutlined />} onClick={testBaseURL}>Test</Button>
              </Tooltip>
            </Space>
          </Form.Item>

          <Form.Item name="api_domain" label="API Domain"
            extra="Separate domain for the DDNS/API endpoint (e.g. api.dingdns.com). If set, DDNS update URLs will use https://api_domain instead of Base URL. Leave blank to use Base URL.">
            <Input
              prefix={<CloudServerOutlined style={{ color: '#722ed1' }} />}
              placeholder="api.dingdns.com"
              style={{ maxWidth: 400 }}
            />
          </Form.Item>

          {/* SSL Behavior */}
          <Divider orientation="left">
            <span><LockOutlined style={{ marginRight: 8 }} />SSL &amp; Access</span>
          </Divider>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', border: '1px solid #303030', borderRadius: 8,
              borderLeft: '3px solid #52c41a', background: 'rgba(255,255,255,0.02)',
            }}>
              <div>
                <Text strong>Redirect HTTP → HTTPS</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Requests to port 80 automatically redirect to HTTPS (443). Recommended when SSL is active.
                  </Text>
                </div>
              </div>
              <Form.Item name="ssl_redirect_http" valuePropName="checked" style={{ margin: 0 }}>
                <Switch />
              </Form.Item>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', border: '1px solid #303030', borderRadius: 8,
              borderLeft: '3px solid #1668dc', background: 'rgba(255,255,255,0.02)',
            }}>
              <div>
                <Text strong>Allow Access via Port 8080</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Keep port 8080 accessible over plain HTTP. Disable to force HTTPS-only access.
                  </Text>
                </div>
              </div>
              <Form.Item name="ssl_allow_http_port" valuePropName="checked" style={{ margin: 0 }}>
                <Switch />
              </Form.Item>
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 16px', border: '1px solid #303030', borderRadius: 8,
              borderLeft: '3px solid #722ed1', background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ flex: 1, marginRight: 16 }}>
                <Text strong>Auto-Renew SSL Certificate</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Automatically renew the SSL certificate when it's about to expire. Checked every 12 hours.
                  </Text>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Space>
                    <Text type="secondary" style={{ fontSize: 13 }}>Renew when</Text>
                    <Form.Item name="ssl_renew_days_before" style={{ margin: 0 }}>
                      <InputNumber min={1} max={89} style={{ width: 70 }} />
                    </Form.Item>
                    <Text type="secondary" style={{ fontSize: 13 }}>days remaining</Text>
                  </Space>
                </div>
              </div>
              <Form.Item name="ssl_auto_renew" valuePropName="checked" style={{ margin: 0 }}>
                <Switch />
              </Form.Item>
            </div>
          </div>

          {/* Maintenance */}
          <Divider orientation="left">System</Divider>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 16px', border: '1px solid #303030', borderRadius: 8,
            borderLeft: '3px solid #faad14', background: 'rgba(255,255,255,0.02)',
          }}>
            <div>
              <Text strong>Maintenance Mode</Text>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Disables all public API access. Admin panel remains accessible.
                </Text>
              </div>
            </div>
            <Form.Item name="maintenance_mode" valuePropName="checked" style={{ margin: 0 }}>
              <Switch />
            </Form.Item>
          </div>

          <div style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
              loading={saveMut.isPending}
              size="large"
            >
              {saved ? 'Saved!' : 'Save Settings'}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default SettingsGeneralPage
