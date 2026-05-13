import React from 'react'
import {
  Card, Form, Switch, InputNumber, Button, Typography, message,
  Divider, Alert, Row, Col, Statistic, Space, Tag, Tooltip,
} from 'antd'
import {
  SaveOutlined, CheckCircleOutlined, ReloadOutlined,
  ThunderboltOutlined, FieldTimeOutlined, DatabaseOutlined,
  QuestionCircleOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, getDNSCacheStatus, manualDNSReload } from '../../core/api'

const { Title, Text } = Typography

const HelpTip: React.FC<{ tip: string }> = ({ tip }) => (
  <Tooltip title={tip}>
    <QuestionCircleOutlined style={{ color: '#8c8c8c', cursor: 'help', marginLeft: 4 }} />
  </Tooltip>
)

const DNSCachePage: React.FC = () => {
  const [form] = Form.useForm()
  const [saved, setSaved] = React.useState(false)
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings().then(r => {
      const s = r.data
      form.setFieldsValue({
        dns_auto_reload:     s.dns_auto_reload !== 'false',
        dns_reload_interval: parseInt(s.dns_reload_interval || '30', 10),
        dns_reload_debounce: parseInt(s.dns_reload_debounce || '500', 10),
      })
      return s
    }),
  })

  const { data: cacheStatus, isLoading: cacheLoading } = useQuery({
    queryKey: ['dns-cache-status'],
    queryFn: () => getDNSCacheStatus().then(r => r.data),
    refetchInterval: 10000, // refresh every 10s
  })

  const saveMut = useMutation({
    mutationFn: (data: any) => updateSettings({
      dns_auto_reload:     String(!!data.dns_auto_reload),
      dns_reload_interval: String(data.dns_reload_interval || 30),
      dns_reload_debounce: String(data.dns_reload_debounce || 500),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      message.success('DNS cache settings saved')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to save'),
  })

  const reloadMut = useMutation({
    mutationFn: () => manualDNSReload(),
    onSuccess: () => {
      message.success('DNS cache reloaded successfully')
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['dns-cache-status'] }), 600)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Reload failed'),
  })

  const autoReloadOn = settings?.dns_auto_reload !== 'false'
  const lastReload = cacheStatus?.last_reload ? new Date(cacheStatus.last_reload) : null
  const secondsSinceReload = lastReload ? Math.round((Date.now() - lastReload.getTime()) / 1000) : null

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>
        <DatabaseOutlined style={{ marginRight: 10, color: '#1668dc' }} />
        DNS Cache Settings
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Control when and how the DNS server reloads records from the database
      </Text>

      {/* Status Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" loading={cacheLoading}>
            <Statistic
              title="Loaded Zones"
              value={cacheStatus?.zones ?? '—'}
              valueStyle={{ fontSize: 20, color: '#1668dc' }}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" loading={cacheLoading}>
            <Statistic
              title="Record Keys"
              value={cacheStatus?.record_keys ?? '—'}
              valueStyle={{ fontSize: 20, color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" loading={cacheLoading}>
            <Statistic
              title="Last Reload"
              value={secondsSinceReload !== null ? `${secondsSinceReload}s ago` : '—'}
              valueStyle={{ fontSize: 16, color: secondsSinceReload !== null && secondsSinceReload < 5 ? '#52c41a' : '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" loading={cacheLoading}>
            <Statistic
              title="Auto Reload"
              value={autoReloadOn ? 'ON' : 'OFF'}
              valueStyle={{ fontSize: 20, color: autoReloadOn ? '#52c41a' : '#ff4d4f' }}
              prefix={autoReloadOn ? <ThunderboltOutlined /> : <WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Manual Reload Card */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text strong style={{ fontSize: 15 }}>
              <ReloadOutlined style={{ marginRight: 8, color: '#1668dc' }} />
              Manual Cache Reload
            </Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Force the DNS server to immediately re-read all zones and records from the database.
                Useful after bulk changes or when auto-reload is disabled.
              </Text>
            </div>
            {lastReload && (
              <div style={{ marginTop: 8 }}>
                <Tag color="default">
                  Last reload: {lastReload.toLocaleTimeString()}
                </Tag>
              </div>
            )}
          </div>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={reloadMut.isPending}
            onClick={() => reloadMut.mutate()}
            size="large"
          >
            Reload Now
          </Button>
        </div>
      </Card>

      {/* Settings Form */}
      <Card loading={isLoading} title={<><DatabaseOutlined style={{ marginRight: 8 }} />Cache Behavior</>}>
        <Form form={form} layout="vertical" onFinish={v => saveMut.mutate(v)}>

          {saved && (
            <Alert
              message="Settings saved"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 24 }}
              closable
            />
          )}

          {/* Auto Reload toggle */}
          <Divider orientation="left">
            <span><ThunderboltOutlined style={{ marginRight: 8 }} />Auto Reload on Change</span>
          </Divider>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 16,
            borderLeft: '3px solid #1668dc', background: 'rgba(255,255,255,0.02)',
          }}>
            <div>
              <Text strong>Auto Reload on Record Change</Text>
              <HelpTip tip="When enabled, the DNS server reloads its cache immediately after any record is created, updated, or deleted — no need to wait for the periodic interval." />
              <div style={{ marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Recommended ON. Turn OFF if you have very high write volume and prefer only periodic reloads.
                </Text>
              </div>
            </div>
            <Form.Item name="dns_auto_reload" valuePropName="checked" style={{ margin: 0 }}>
              <Switch checkedChildren="ON" unCheckedChildren="OFF" />
            </Form.Item>
          </div>

          {/* Debounce */}
          <Divider orientation="left">
            <span><FieldTimeOutlined style={{ marginRight: 8 }} />Debounce &amp; Interval</span>
          </Divider>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <div style={{
                padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12,
                borderLeft: '3px solid #722ed1', background: 'rgba(255,255,255,0.02)',
              }}>
                <Text strong>Debounce Delay</Text>
                <HelpTip tip="After a record changes, wait this many milliseconds before reloading. If more changes arrive in this window, they all get batched into a single reload. Prevents reload storms when saving many records at once." />
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Example: 500ms means if you save 10 records within 500ms, only 1 reload happens.
                  </Text>
                </div>
                <Form.Item name="dns_reload_debounce" style={{ margin: 0 }}>
                  <InputNumber
                    min={100} max={10000}
                    style={{ width: '100%' }}
                    addonAfter="ms"
                    placeholder="500"
                  />
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{
                padding: '16px', border: '1px solid #303030', borderRadius: 8, marginBottom: 12,
                borderLeft: '3px solid #faad14', background: 'rgba(255,255,255,0.02)',
              }}>
                <Text strong>Periodic Reload Interval</Text>
                <HelpTip tip="Even when auto-reload is ON, the DNS server also does a full periodic reload at this interval as a safety net. Set higher to reduce DB queries on busy servers." />
                <div style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Recommended: 30s normal, 300s+ for high-traffic servers.
                  </Text>
                </div>
                <Form.Item name="dns_reload_interval" style={{ margin: 0 }}>
                  <InputNumber
                    min={5} max={3600}
                    style={{ width: '100%' }}
                    addonAfter="sec"
                    placeholder="30"
                  />
                </Form.Item>
              </div>
            </Col>
          </Row>

          <Space style={{ marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
              loading={saveMut.isPending}
              size="large"
            >
              {saved ? 'Saved!' : 'Save Settings'}
            </Button>
          </Space>

        </Form>
      </Card>
    </div>
  )
}

export default DNSCachePage
