import React, { useState, useEffect } from 'react'
import {
  Card, Form, Input, Switch, Button, Typography, Space, Alert, Tag, Divider,
  message, Spin, InputNumber,
} from 'antd'
import {
  ReloadOutlined, SaveOutlined, SettingOutlined, LockOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getServerConfig, updateServerConfig } from '../../core/api'

const { Title, Text } = Typography

// Fields that are always read-only (sensitive)
const LOCKED_FIELDS = new Set(['jwt_secret', 'db_path', 'db_password', 'db_engine'])

// Fields rendered as boolean switches
const BOOL_FIELDS = new Set([
  'ssl_enabled', 'debug', 'maintenance_mode', 'allow_registration',
  'email_verification', 'captcha_enabled',
])

// Fields rendered as numbers
const NUMBER_FIELDS = new Set([
  'port', 'dns_port', 'http_port', 'https_port', 'read_timeout', 'write_timeout',
  'max_upload_size', 'session_timeout',
])

function FieldLabel({ name }: { name: string }) {
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <Space size={4}>
      {LOCKED_FIELDS.has(name) && <LockOutlined style={{ color: '#faad14', fontSize: 11 }} />}
      <span>{label}</span>
    </Space>
  )
}

const ConfigPage: React.FC = () => {
  const [form] = Form.useForm()
  const [edited, setEdited] = useState(false)

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ['serverConfig'],
    queryFn: () => getServerConfig().then(r => r.data),
  })

  useEffect(() => {
    if (config) {
      form.setFieldsValue(config)
      setEdited(false)
    }
  }, [config, form])

  const saveMut = useMutation({
    mutationFn: (values: any) => updateServerConfig(values),
    onSuccess: () => {
      message.success('Configuration saved. Restart service to apply.')
      setEdited(false)
      refetch()
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to save config'),
  })

  const handleSave = () => {
    const values = form.getFieldsValue()
    // Remove locked fields
    LOCKED_FIELDS.forEach(k => delete values[k])
    saveMut.mutate(values)
  }

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
  }

  if (!config) {
    return <Alert type="error" message="Failed to load configuration" showIcon />
  }

  // Group fields
  const entries = Object.entries(config)
  const locked = entries.filter(([k]) => LOCKED_FIELDS.has(k))
  const editable = entries.filter(([k]) => !LOCKED_FIELDS.has(k))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SettingOutlined style={{ fontSize: 22 }} />
          <Title level={3} style={{ margin: 0 }}>Server Configuration</Title>
          {edited && <Tag color="orange">Unsaved changes</Tag>}
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
            Reload
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saveMut.isPending}
            disabled={!edited}
          >
            Save Changes
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="Changes require a service restart to take effect."
        description="Sensitive fields (JWT secret, DB path) are shown but cannot be changed here."
        style={{ marginBottom: 16, borderRadius: 8 }}
        closable
      />

      {/* Read-only sensitive fields */}
      {locked.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <LockOutlined style={{ color: '#faad14' }} />
              <span>Protected Fields</span>
              <Text type="secondary" style={{ fontSize: 12 }}>(read-only)</Text>
            </Space>
          }
        >
          {locked.map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 12 }}>
              <Text code style={{ minWidth: 160, fontSize: 12 }}>{key}</Text>
              <Input
                value={typeof value === 'string' ? value : JSON.stringify(value)}
                readOnly
                size="small"
                style={{ flex: 1, background: 'rgba(0,0,0,0.3)', cursor: 'not-allowed' }}
                suffix={<LockOutlined style={{ color: '#faad14' }} />}
              />
            </div>
          ))}
        </Card>
      )}

      {/* Editable fields */}
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>Editable Configuration</span>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setEdited(true)}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {editable.map(([key, value]) => (
              <Form.Item
                key={key}
                name={key}
                label={<FieldLabel name={key} />}
                valuePropName={BOOL_FIELDS.has(key) ? 'checked' : 'value'}
                style={{ marginBottom: 8 }}
              >
                {BOOL_FIELDS.has(key) ? (
                  <Switch />
                ) : NUMBER_FIELDS.has(key) ? (
                  <InputNumber style={{ width: '100%' }} />
                ) : (
                  <Input
                    placeholder={`Enter ${key}`}
                    style={typeof value === 'object' ? { fontFamily: 'monospace' } : undefined}
                  />
                )}
              </Form.Item>
            ))}
          </div>

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { form.setFieldsValue(config); setEdited(false) }}>
              Reset
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saveMut.isPending}
              disabled={!edited}
            >
              Save Configuration
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default ConfigPage
