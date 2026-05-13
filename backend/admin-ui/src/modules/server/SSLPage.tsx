import React, { useState, useEffect, useRef } from 'react'
import {
  Card, Button, Typography, Alert, Tag, Space, Descriptions,
  Divider, Row, Col, Statistic, Progress, Modal, message,
} from 'antd'
import {
  SafetyCertificateOutlined, CheckCircleOutlined, CloseCircleOutlined,
  WarningOutlined, ReloadOutlined, LockOutlined, GlobalOutlined,
  ExclamationCircleOutlined, ApiOutlined, LoadingOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSSLStatus, issueSSLCert, getSSLJob, renewSSLCert, getServerInfo, getSSLAutoRenew } from '../../core/api'

const { Title, Text } = Typography

interface DomainSSL {
  domain: string
  status: 'valid' | 'expiring_soon' | 'expired' | 'not_issued'
  cert_exists: boolean
  cert_path?: string
  key_path?: string
  expires_at?: string
  issuer?: string
  days_remaining?: number
}

interface SSLResponse {
  status?: 'not_configured'
  server?: DomainSSL
  api?: DomainSSL
}

// ── small domain status card ──────────────────────────────────────────────────
const DomainCard: React.FC<{
  info: DomainSSL
  label: string
  icon: React.ReactNode
  onIssue: () => void
  onRenew: () => void
  renewing: boolean
}> = ({ info, label, icon, onIssue, onRenew, renewing }) => {
  const daysLeft = info.days_remaining ?? 0
  const progressPercent = info.cert_exists
    ? Math.min(100, Math.max(0, Math.round((daysLeft / 90) * 100))) : 0
  const progressStatus = daysLeft < 0 ? 'exception' : daysLeft < 30 ? 'active' : 'success'
  const statusColor = info.status === 'valid' ? '#52c41a'
    : info.status === 'expiring_soon' ? '#faad14' : '#ff4d4f'

  const statusTag = info.status === 'valid'
    ? <Tag color="green" icon={<CheckCircleOutlined />}>Valid</Tag>
    : info.status === 'expiring_soon'
    ? <Tag color="orange" icon={<WarningOutlined />}>Expiring Soon</Tag>
    : info.status === 'expired'
    ? <Tag color="red" icon={<CloseCircleOutlined />}>Expired</Tag>
    : <Tag icon={<SafetyCertificateOutlined />}>Not Issued</Tag>

  return (
    <Card
      title={<Space>{icon}<span>{label}</span><Text code style={{ fontSize: 12 }}>{info.domain}</Text></Space>}
      extra={
        <Space>
          {info.cert_exists && (
            <Button size="small" icon={<ReloadOutlined />} loading={renewing}
              onClick={() => Modal.confirm({
                title: 'Renew SSL',
                content: 'Runs certbot renew on all due certificates. Continue?',
                onOk: onRenew, okText: 'Renew',
              })}>
              Renew
            </Button>
          )}
          {info.status === 'not_issued' && (
            <Button type="primary" size="small" icon={<LockOutlined />} onClick={onIssue}>
              Issue Certificate
            </Button>
          )}
          {info.status === 'expired' && (
            <Button danger size="small" icon={<LockOutlined />} onClick={onIssue}>
              Re-Issue Certificate
            </Button>
          )}
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={[16, 12]} style={{ marginBottom: info.cert_exists ? 16 : 0 }}>
        <Col xs={24} sm={8}>
          <Statistic title="Status"
            value={info.status === 'valid' ? 'Valid' : info.status === 'expiring_soon' ? 'Expiring Soon' : info.status === 'expired' ? 'Expired' : 'Not Issued'}
            valueStyle={{ fontSize: 15, color: statusColor }}
            prefix={info.status === 'valid' ? <CheckCircleOutlined /> : info.status === 'not_issued' ? <SafetyCertificateOutlined /> : <WarningOutlined />}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="Days Remaining"
            value={info.cert_exists ? (daysLeft < 0 ? 'Expired' : daysLeft) : '—'}
            suffix={info.cert_exists && daysLeft >= 0 ? 'days' : ''}
            valueStyle={{ fontSize: 15, color: daysLeft < 0 ? '#ff4d4f' : daysLeft < 30 ? '#faad14' : '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="Domain" value={info.domain} valueStyle={{ fontSize: 13 }} prefix={<GlobalOutlined />} />
        </Col>
      </Row>

      {info.cert_exists && (
        <>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            Validity ({daysLeft} days of ~90)
          </Text>
          <Progress percent={progressPercent} status={progressStatus}
            format={() => `${daysLeft}d`} strokeColor={daysLeft < 30 ? '#faad14' : '#52c41a'}
            style={{ marginBottom: 12 }} />
          <Divider style={{ margin: '0 0 12px' }} />
        </>
      )}

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Status">{statusTag}</Descriptions.Item>
        {info.cert_exists && <>
          <Descriptions.Item label="Expires">{info.expires_at ? new Date(info.expires_at).toLocaleString() : '—'}</Descriptions.Item>
          <Descriptions.Item label="Issuer"><Text type="secondary" style={{ fontSize: 12 }}>{info.issuer || '—'}</Text></Descriptions.Item>
          <Descriptions.Item label="Cert Path"><Text code style={{ fontSize: 11 }}>{info.cert_path}</Text></Descriptions.Item>
          <Descriptions.Item label="Key Path"><Text code style={{ fontSize: 11 }}>{info.key_path}</Text></Descriptions.Item>
        </>}
        {!info.cert_exists && (
          <Descriptions.Item label="Certificate">
            <Tag icon={<CloseCircleOutlined />}>Not issued yet</Tag>
          </Descriptions.Item>
        )}
      </Descriptions>

      {info.status === 'not_issued' && (
        <Alert type="info" showIcon icon={<SafetyCertificateOutlined />} style={{ marginTop: 12 }}
          message="Requirements before issuing:"
          description={
            <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 13 }}>
              <li>Domain <strong>{info.domain}</strong> must point to this server's IP in DNS</li>
              <li>Port <strong>80</strong> must be open and reachable from the internet</li>
              <li><code>certbot</code> must be installed: <code>apt install certbot</code></li>
            </ul>
          }
        />
      )}
      {info.status === 'expiring_soon' && (
        <Alert type="warning" showIcon style={{ marginTop: 12 }}
          message={`Expires in ${daysLeft} days — renew soon`} />
      )}
      {info.status === 'expired' && (
        <Alert type="error" showIcon style={{ marginTop: 12 }}
          message="Certificate expired — HTTPS will show security warnings!" />
      )}
    </Card>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
const SSLPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [issueModal, setIssueModal] = useState<{ open: boolean; domain: string }>({ open: false, domain: '' })
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobLogs, setJobLogs] = useState<string[]>([])
  const [jobDone, setJobDone] = useState(false)
  const [jobError, setJobError] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  const { data: ssl, isLoading } = useQuery<SSLResponse>({
    queryKey: ['ssl-status'],
    queryFn: () => getSSLStatus().then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: serverInfo } = useQuery({
    queryKey: ['serverInfo'],
    queryFn: () => getServerInfo().then(r => r.data),
  })

  const { data: autoRenew } = useQuery({
    queryKey: ['ssl-auto-renew'],
    queryFn: () => getSSLAutoRenew().then(r => r.data),
    refetchInterval: 60000,
  })

  const renewMut = useMutation({
    mutationFn: () => renewSSLCert(),
    onSuccess: () => {
      message.success('Certificates renewed')
      queryClient.invalidateQueries({ queryKey: ['ssl-status'] })
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Renewal failed'),
  })

  const issueMut = useMutation({
    mutationFn: (domain: string) => issueSSLCert(domain),
    onSuccess: (res) => {
      setJobId(res.data.job_id)
      setJobLogs([])
      setJobDone(false)
      setJobError(false)
    },
    onError: (e: any) => {
      setJobLogs([`❌ ${e.response?.data?.error || 'Failed to start certbot'}`])
      setJobDone(true)
      setJobError(true)
    },
  })

  // Poll job status every 1s while job is running
  useEffect(() => {
    if (!jobId || jobDone) return
    const timer = setInterval(async () => {
      try {
        const res = await getSSLJob(jobId)
        setJobLogs(res.data.lines || [])
        if (res.data.done) {
          setJobDone(true)
          setJobError(res.data.error)
          clearInterval(timer)
          if (!res.data.error) {
            queryClient.invalidateQueries({ queryKey: ['ssl-status'] })
          }
        }
      } catch {
        // job may have expired
        setJobDone(true)
        setJobError(true)
        clearInterval(timer)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [jobId, jobDone])

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [jobLogs])

  const handleIssue = (domain: string) => {
    setIssueModal({ open: true, domain })
    setJobId(null)
    setJobLogs([])
    setJobDone(false)
    setJobError(false)
  }

  const startIssue = () => {
    issueMut.mutate(issueModal.domain)
  }

  const closeIssueModal = () => {
    if (!jobDone && jobId) return // don't close while running
    setIssueModal({ open: false, domain: '' })
    setJobId(null)
    setJobLogs([])
    setJobDone(false)
    setJobError(false)
  }

  const isRunning = !!jobId && !jobDone

  const notConfigured = ssl?.status === 'not_configured'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            <LockOutlined style={{ marginRight: 10, color: '#52c41a' }} />
            SSL Certificates
          </Title>
          <Text type="secondary">
            Manage Let's Encrypt SSL certificates for domains running on this server
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={isLoading}
          onClick={() => queryClient.invalidateQueries({ queryKey: ['ssl-status'] })}>
          Refresh
        </Button>
      </div>

      {notConfigured && (
        <Alert type="warning" showIcon icon={<ExclamationCircleOutlined />}
          message="API Domain Not Configured"
          description={
            <span>
              Go to <strong>Settings → General</strong> and set your <strong>API Domain</strong>
              (e.g. <code>api.dingdns.com</code>) — the subdomain whose A record points to this server's IP.
            </span>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {!notConfigured && !isLoading && (
        <>
          {ssl?.api && (
            <DomainCard info={ssl.api} label="API Domain" icon={<ApiOutlined style={{ color: '#722ed1' }} />}
              onIssue={() => handleIssue(ssl.api!.domain)}
              onRenew={() => renewMut.mutate()} renewing={renewMut.isPending} />
          )}
          {!ssl?.api && (
            <Alert type="info" showIcon message="Set API Domain in Settings → General to manage SSL here." />
          )}
        </>
      )}

      {/* Auto-renew status card */}
      {autoRenew && (
        <Card
          title={<Space><ReloadOutlined style={{ color: '#722ed1' }} /><span>Auto-Renew Status</span></Space>}
          style={{ marginTop: 8 }}
          size="small"
        >
          <Space wrap size={[24, 12]}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Status</Text><br />
              {autoRenew.auto_renew
                ? <Tag color="green" icon={<CheckCircleOutlined />}>Enabled</Tag>
                : <Tag icon={<CloseCircleOutlined />}>Disabled</Tag>}
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Renews When</Text><br />
              <Text strong>{autoRenew.renew_days_before} days remaining</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Last Run</Text><br />
              <Text>{autoRenew.last_renew_at ? new Date(autoRenew.last_renew_at).toLocaleString() : '—'}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Last Result</Text><br />
              {!autoRenew.last_renew_result ? <Text type="secondary">—</Text>
                : autoRenew.last_renew_result === 'success'
                  ? <Tag color="green" icon={<CheckCircleOutlined />}>Success</Tag>
                  : <Tag color="red" icon={<CloseCircleOutlined />}>{autoRenew.last_renew_result}</Tag>}
            </div>
          </Space>
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Checked every 12 hours. Configure in <strong>Settings → General → SSL &amp; Access</strong>.
            </Text>
          </div>
        </Card>
      )}

      {isLoading && <Card loading />}

      {/* ── Issue Certificate Modal with live log ── */}
      <Modal
        title={<Space><LockOutlined style={{ color: '#52c41a' }} />Issue SSL — {issueModal.domain}</Space>}
        open={issueModal.open}
        onCancel={closeIssueModal}
        closable={jobDone || !jobId}
        maskClosable={false}
        footer={
          jobDone ? (
            <Button type="primary" onClick={closeIssueModal}>Close</Button>
          ) : !jobId ? (
            <Space>
              <Button onClick={closeIssueModal}>Cancel</Button>
              <Button type="primary" icon={<LockOutlined />}
                loading={issueMut.isPending} onClick={startIssue}>
                Start
              </Button>
            </Space>
          ) : null
        }
        width={640}
      >
        {/* Pre-flight checklist — shown before start */}
        {!jobId && (
          <Alert type="info" showIcon style={{ marginBottom: 16 }}
            message="Before issuing, make sure:"
            description={
              <ul style={{ paddingLeft: 18, margin: '4px 0', fontSize: 13 }}>
                <li><strong>{issueModal.domain}</strong> DNS A record → this server's IP ({serverInfo?.server_ip || '?'})</li>
                <li>Port <strong>80</strong> open and not blocked by firewall</li>
                <li><code>certbot</code> installed: <code>apt install certbot</code></li>
              </ul>
            }
          />
        )}

        {/* Live log output */}
        {(jobId || jobLogs.length > 0) && (
          <div style={{
            background: '#0d0d0d', border: '1px solid #303030', borderRadius: 6,
            padding: 12, fontFamily: 'monospace', fontSize: 12,
            maxHeight: 340, overflowY: 'auto', lineHeight: 1.7,
          }}>
            {jobLogs.map((line, i) => (
              <div key={i} style={{
                color: line.startsWith('❌') ? '#ff4d4f'
                  : line.startsWith('✅') ? '#52c41a'
                  : line.startsWith('🔐') || line.startsWith('📧') || line.startsWith('⏳') ? '#1668dc'
                  : '#d9d9d9',
              }}>
                {line || ' '}
              </div>
            ))}
            {isRunning && (
              <div style={{ color: '#faad14', marginTop: 4 }}>
                <LoadingOutlined spin style={{ marginRight: 6 }} />
                Running...
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Result banner */}
        {jobDone && !jobError && (
          <Alert type="success" showIcon icon={<CheckCircleOutlined />}
            style={{ marginTop: 12 }}
            message="Certificate issued successfully! Reload page to see the updated status." />
        )}
        {jobDone && jobError && (
          <Alert type="error" showIcon style={{ marginTop: 12 }}
            message="Certificate issuance failed. Check the log above for details." />
        )}
      </Modal>
    </div>
  )
}

export default SSLPage
