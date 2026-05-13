import React, { useState } from 'react'
import {
  Card, Input, Button, Typography, Alert, Tag, Space,
  Descriptions, Spin, Divider, Row, Col, Statistic,
} from 'antd'
import {
  SearchOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, GlobalOutlined, CloudServerOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { testDNS } from '../../core/api'

const { Title, Text } = Typography

interface TestResult {
  domain: string
  server_ip: string
  resolved_ips: string[]
  resolved_ips_cf: string[]
  ns_records: string[]
  ns_points_to_us: boolean
  a_record_matches: boolean
  zone_in_db: boolean
  zone_id?: number
  status: 'ok' | 'warning' | 'error'
  issues: string[]
  tested_at: string
  server_domain: string
}

const StatusTag: React.FC<{ ok: boolean; label?: string; okLabel?: string; failLabel?: string }> = ({
  ok, label, okLabel = 'Yes', failLabel = 'No'
}) => (
  <Tag
    color={ok ? 'green' : 'red'}
    icon={ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
  >
    {label || (ok ? okLabel : failLabel)}
  </Tag>
)

const DNSTestPage: React.FC = () => {
  const [domain, setDomain] = useState('')
  const [result, setResult] = useState<TestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runTest = async (d?: string) => {
    const target = d || domain
    if (!target.trim()) { return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await testDNS(target.trim().toLowerCase())
      setResult(res.data)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  const statusColor = result?.status === 'ok' ? 'success'
    : result?.status === 'warning' ? 'warning' : 'error'

  const statusIcon = result?.status === 'ok' ? <CheckCircleOutlined />
    : result?.status === 'warning' ? <WarningOutlined /> : <CloseCircleOutlined />

  const statusMsg = result?.status === 'ok'
    ? 'DNS is correctly configured!'
    : result?.status === 'warning'
    ? 'DNS has some issues or is partially configured'
    : 'DNS is not correctly configured'

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>DNS Test</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Check if a domain's DNS is correctly pointing to this server
      </Text>

      {/* Search Bar */}
      <Card style={{ marginBottom: 24 }}>
        <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
          <Input
            size="large"
            placeholder="example.com"
            prefix={<GlobalOutlined style={{ color: '#1668dc' }} />}
            value={domain}
            onChange={e => setDomain(e.target.value)}
            onPressEnter={() => runTest()}
            allowClear
          />
          <Button
            type="primary"
            size="large"
            icon={loading ? <ReloadOutlined spin /> : <SearchOutlined />}
            onClick={() => runTest()}
            loading={loading}
            disabled={!domain.trim()}
          >
            Test
          </Button>
        </Space.Compact>
      </Card>

      {error && (
        <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      {loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Querying DNS servers...</Text>
            </div>
          </div>
        </Card>
      )}

      {result && !loading && (
        <>
          {/* Overall Status */}
          <Alert
            type={statusColor}
            showIcon
            icon={statusIcon}
            message={
              <span style={{ fontWeight: 600, fontSize: 16 }}>
                {result.domain} — {statusMsg}
              </span>
            }
            description={
              result.issues.length > 0
                ? <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    {result.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                  </ul>
                : 'All checks passed. This domain is correctly configured.'
            }
            style={{ marginBottom: 16 }}
          />

          {/* Stats Row */}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="A Record"
                  value={result.a_record_matches ? 'Match ✓' : 'Mismatch ✗'}
                  valueStyle={{ fontSize: 16, color: result.a_record_matches ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="NS Records"
                  value={result.ns_points_to_us ? 'Points to us ✓' : 'Mismatch ✗'}
                  valueStyle={{ fontSize: 16, color: result.ns_points_to_us ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Zone in DB"
                  value={result.zone_in_db ? 'Configured ✓' : 'Not found ✗'}
                  valueStyle={{ fontSize: 16, color: result.zone_in_db ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="Resolved IPs"
                  value={result.resolved_ips.length}
                  suffix="records"
                  valueStyle={{ fontSize: 16 }}
                />
              </Card>
            </Col>
          </Row>

          {/* Details */}
          <Card title={<><SearchOutlined style={{ marginRight: 8 }} />Detailed Results</>}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Domain">
                <Text code>{result.domain}</Text>
              </Descriptions.Item>

              <Descriptions.Item label="Server IP">
                <Space>
                  <Tag icon={<CloudServerOutlined />} color="blue">{result.server_ip || 'Not configured'}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>Your server's public IP</Text>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="A Records (Google DNS)">
                {result.resolved_ips.length === 0
                  ? <Tag color="red">No A records found</Tag>
                  : result.resolved_ips.map(ip => (
                    <Tag key={ip} color={ip === result.server_ip ? 'green' : 'orange'}>
                      {ip === result.server_ip ? <CheckCircleOutlined /> : <WarningOutlined />} {ip}
                    </Tag>
                  ))
                }
              </Descriptions.Item>

              <Descriptions.Item label="A Records (Cloudflare DNS)">
                {result.resolved_ips_cf.length === 0
                  ? <Tag color="default">No records</Tag>
                  : result.resolved_ips_cf.map(ip => (
                    <Tag key={ip} color={ip === result.server_ip ? 'green' : 'orange'}>{ip}</Tag>
                  ))
                }
              </Descriptions.Item>

              <Descriptions.Item label="NS Records">
                {result.ns_records.length === 0
                  ? <Tag color="red">No NS records found</Tag>
                  : result.ns_records.map(ns => (
                    <Tag key={ns} color={result.ns_points_to_us ? 'green' : 'orange'}>{ns}</Tag>
                  ))
                }
              </Descriptions.Item>

              <Descriptions.Item label="NS Points to Us">
                <StatusTag ok={result.ns_points_to_us}
                  okLabel={`Yes — via ${result.server_domain}`}
                  failLabel="No — NS records point elsewhere" />
              </Descriptions.Item>

              <Descriptions.Item label="Zone Configured">
                <Space>
                  <StatusTag ok={result.zone_in_db} okLabel="Yes — found in DingDns" failLabel="No — zone not in DB" />
                  {result.zone_in_db && result.zone_id && (
                    <Text type="secondary" style={{ fontSize: 12 }}>Zone ID: {result.zone_id}</Text>
                  )}
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="Overall Status">
                {result.status === 'ok' && <Tag color="green" icon={<CheckCircleOutlined />}>All Good</Tag>}
                {result.status === 'warning' && <Tag color="orange" icon={<WarningOutlined />}>Issues Found</Tag>}
                {result.status === 'error' && <Tag color="red" icon={<CloseCircleOutlined />}>Misconfigured</Tag>}
              </Descriptions.Item>

              <Descriptions.Item label="Tested At">
                <Text type="secondary">{new Date(result.tested_at).toLocaleString()}</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* Issues */}
            {result.issues.length > 0 && (
              <>
                <Divider />
                <Title level={5} style={{ color: '#faad14' }}>
                  <WarningOutlined style={{ marginRight: 8 }} />What to Fix
                </Title>
                {result.issues.map((issue, i) => (
                  <Alert key={i} type="warning" message={issue} showIcon style={{ marginBottom: 8 }} />
                ))}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export default DNSTestPage
