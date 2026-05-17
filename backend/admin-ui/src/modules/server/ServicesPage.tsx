import React, { useState } from 'react'
import {
  App, Card, Button, Tag, Typography, Popconfirm, Space, Badge, Modal,
  Row, Col, Statistic, Tooltip, InputNumber, Divider, Alert,
} from 'antd'
import {
  ReloadOutlined, PlayCircleOutlined, StopOutlined,
  FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined,
  AppstoreOutlined, DownloadOutlined, InfoCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getServices, startService, stopService, restartService, installService, getServiceLogs,
} from '../../core/api'

const { Title, Text, Paragraph } = Typography

type AntdBadge = 'success' | 'error' | 'warning' | 'processing' | 'default'
const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; badge: AntdBadge; label: string }> = {
  active:           { color: 'green',   icon: <CheckCircleOutlined />, badge: 'success',    label: 'Active' },
  activating:       { color: 'blue',    icon: <SyncOutlined spin />,   badge: 'processing', label: 'Activating' },
  inactive:         { color: 'default', icon: <CloseCircleOutlined />, badge: 'default',    label: 'Inactive' },
  failed:           { color: 'red',     icon: <CloseCircleOutlined />, badge: 'error',      label: 'Failed' },
  unknown:          { color: 'orange',  icon: <CloseCircleOutlined />, badge: 'warning',    label: 'Unknown' },
  'not-installed':  { color: 'default', icon: <MinusCircleOutlined />, badge: 'default',    label: 'Not installed' },
}

interface Service {
  name: string
  status: string
  sub_state: string
  active: boolean
  description: string
  since?: string
  memory_mb?: string
  pid?: string
  installed?: boolean
  installable?: boolean
  enabled?: boolean
  unit_file_state?: string
  hint?: string
  // synthetic rows are aggregated status indicators (e.g. "firewall")
  // that aren't real systemd units — no start/stop/logs buttons apply.
  synthetic?: boolean
}

const LogsModal: React.FC<{ service: string; open: boolean; onClose: () => void }> = ({ service, open, onClose }) => {
  const [lines, setLines] = useState(200)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['svcLogs', service, lines],
    queryFn: () => getServiceLogs(service, lines).then(r => r.data),
    enabled: open && !!service,
    refetchInterval: open ? 5000 : false,
  })

  const logLines: string[] = data?.lines ?? []

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          <span>Logs — {service}</span>
          <Tag color="blue">live</Tag>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={
        <Space>
          <InputNumber
            value={lines}
            onChange={v => setLines(v || 200)}
            min={50} max={2000}
            addonBefore="Lines"
            style={{ width: 150 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
            Refresh
          </Button>
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
      width={900}
      styles={{ body: { padding: 0 } }}
    >
      <div
        style={{
          background: '#0d1117',
          color: '#c9d1d9',
          padding: '12px 16px',
          fontSize: 12,
          overflowY: 'auto',
          maxHeight: 500,
          fontFamily: "'Courier New', monospace",
          lineHeight: '1.6',
        }}
      >
        {isLoading ? (
          <span style={{ color: '#58a6ff' }}>Loading...</span>
        ) : logLines.length === 0 ? (
          <span style={{ color: '#6e7681' }}>No log output</span>
        ) : (
          logLines.map((line, i) => {
            const lower = line.toLowerCase()
            let color = '#a8b4c8'
            if (lower.includes('error') || lower.includes('fail')) color = '#ff4d4f'
            else if (lower.includes('warn')) color = '#faad14'
            else if (lower.includes('info') || lower.includes('start')) color = '#58a6ff'
            return (
              <div key={i} style={{ color, borderBottom: '1px solid rgba(255,255,255,0.03)', padding: '1px 0' }}>
                {line}
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}

const ServicesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const [logsService, setLogsService] = useState<string | null>(null)
  const [installOutput, setInstallOutput] = useState<{ name: string; output: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => getServices().then(r => r.data.services || []),
    refetchInterval: 15000,
  })

  const services: Service[] = data || []

  const startMut = useMutation({
    mutationFn: (name: string) => startService(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      message.success(`${name} started`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to start'),
  })

  const stopMut = useMutation({
    mutationFn: (name: string) => stopService(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      message.success(`${name} stopped`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to stop'),
  })

  const restartMut = useMutation({
    mutationFn: (name: string) => restartService(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      message.success(`${name} restarted`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to restart'),
  })

  // Per-row install state — antd's useMutation alone would lose track of
  // which row is installing when multiple rows are visible. We track the
  // currently-installing service name and gate the spinner on that.
  const [installingName, setInstallingName] = useState<string | null>(null)
  const installMut = useMutation({
    mutationFn: (name: string) => {
      setInstallingName(name)
      return installService(name)
    },
    onSuccess: (res, name) => {
      setInstallingName(null)
      queryClient.invalidateQueries({ queryKey: ['services'] })
      message.success(`${name} installed`)
      const output = res?.data?.output
      if (output) setInstallOutput({ name, output })
    },
    onError: (e: any, name) => {
      setInstallingName(null)
      const data = e.response?.data
      modal.error({
        title: `Failed to install ${name}`,
        content: (
          <div>
            <Paragraph>{data?.error || 'Install failed'}</Paragraph>
            {data?.output && (
              <pre style={{ background: '#0d1117', color: '#c9d1d9', padding: 12, borderRadius: 4, maxHeight: 320, overflow: 'auto', fontSize: 11 }}>
                {data.output}
              </pre>
            )}
          </div>
        ),
        width: 720,
      })
    },
  })

  // Headline counts ignore synthetic rows (aggregated indicators like the
  // "firewall" row aren't real services) and "not installed" rows so the
  // X/Y active ratio matches user intuition.
  const realServices = services.filter(s => !s.synthetic)
  const installedServices = realServices.filter(s => s.installed !== false)
  const activeCount = installedServices.filter(s => s.active).length
  const total = installedServices.length
  const notInstalledCount = realServices.length - total

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AppstoreOutlined style={{ fontSize: 22, color: '#1890ff' }} />
          <Title level={3} style={{ margin: 0 }}>Services</Title>
          <Tag color="blue">{activeCount}/{total} active</Tag>
          {notInstalledCount > 0 && (
            <Tag color="default">{notInstalledCount} not installed</Tag>
          )}
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => queryClient.invalidateQueries({ queryKey: ['services'] })}
          loading={isLoading}
        >
          Refresh
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {services.map(svc => {
          const cfg = STATUS_CONFIG[svc.status] || STATUS_CONFIG.unknown
          const notInstalled = svc.installed === false || svc.status === 'not-installed'
          const isInstalling = installingName === svc.name
          const isSynthetic = svc.synthetic === true
          const isPending =
            startMut.isPending || stopMut.isPending || restartMut.isPending

          return (
            <Col key={svc.name} xs={24} sm={12} lg={8} xl={6}>
              <Card
                size="small"
                style={{
                  border: `1px solid ${
                    svc.active ? '#177ddc33' :
                    notInstalled ? '#3a3a3a' :
                    '#303030'
                  }`,
                  background: svc.active ? 'rgba(23, 125, 220, 0.05)' :
                    notInstalled ? 'rgba(255, 255, 255, 0.02)' : undefined,
                  opacity: notInstalled ? 0.85 : 1,
                }}
                title={
                  <Space>
                    <Badge status={cfg.badge} />
                    <Text strong style={{ fontSize: 13 }}>{svc.name}</Text>
                  </Space>
                }
                extra={
                  <Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0, fontSize: 11 }}>
                    {notInstalled
                      ? cfg.label
                      : <>
                          {cfg.label}
                          {svc.sub_state && svc.sub_state !== svc.status ? ` (${svc.sub_state})` : ''}
                        </>}
                  </Tag>
                }
              >
                {svc.description && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }} ellipsis>
                    {svc.description}
                  </Text>
                )}

                {svc.hint && (
                  <Alert
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                    message={<span style={{ fontSize: 11 }}>{svc.hint}</span>}
                    style={{ marginBottom: 8, padding: '4px 8px' }}
                  />
                )}

                {!notInstalled && (
                  <>
                    {svc.unit_file_state && svc.unit_file_state !== 'enabled' && (
                      <Tag color="orange" style={{ fontSize: 10, marginBottom: 8 }}>
                        unit-file: {svc.unit_file_state}
                      </Tag>
                    )}
                    <Row gutter={8} style={{ marginBottom: 8 }}>
                      {svc.memory_mb && (
                        <Col span={12}>
                          <Statistic
                            title={<span style={{ fontSize: 10 }}>Memory</span>}
                            value={svc.memory_mb}
                            suffix="MB"
                            valueStyle={{ fontSize: 13 }}
                          />
                        </Col>
                      )}
                      {svc.pid && svc.pid !== '0' && (
                        <Col span={12}>
                          <Statistic
                            title={<span style={{ fontSize: 10 }}>PID</span>}
                            value={svc.pid}
                            valueStyle={{ fontSize: 13 }}
                          />
                        </Col>
                      )}
                    </Row>
                    {svc.since && (
                      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 8 }}>
                        Since: {svc.since}
                      </Text>
                    )}
                  </>
                )}

                <Divider style={{ margin: '8px 0' }} />

                <Space size={4} wrap>
                  {isSynthetic ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Aggregated status — manage rules under Security → Firewall
                    </Text>
                  ) : notInstalled ? (
                    svc.installable ? (
                      <Popconfirm
                        title={`Install ${svc.name}?`}
                        description="This will run apt-get install and enable the service. May take 10–30 seconds."
                        onConfirm={() => installMut.mutate(svc.name)}
                      >
                        <Button
                          size="small"
                          type="primary"
                          icon={<DownloadOutlined />}
                          loading={isInstalling}
                        >
                          Install
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Not installed (cannot install from panel)
                      </Text>
                    )
                  ) : (
                    <>
                      {!svc.active && (
                        <Tooltip title="Start">
                          <Button
                            size="small" type="primary" ghost
                            icon={<PlayCircleOutlined />}
                            onClick={() => startMut.mutate(svc.name)}
                            loading={isPending}
                          >
                            Start
                          </Button>
                        </Tooltip>
                      )}
                      {svc.active && svc.name !== 'dingdns' && (
                        <Tooltip title="Stop">
                          <Popconfirm
                            title={`Stop ${svc.name}?`}
                            onConfirm={() => stopMut.mutate(svc.name)}
                          >
                            <Button size="small" danger icon={<StopOutlined />} loading={isPending}>
                              Stop
                            </Button>
                          </Popconfirm>
                        </Tooltip>
                      )}
                      <Tooltip title="Restart">
                        <Popconfirm
                          title={`Restart ${svc.name}?`}
                          onConfirm={() => restartMut.mutate(svc.name)}
                        >
                          <Button size="small" icon={<ReloadOutlined />} loading={isPending}>
                            Restart
                          </Button>
                        </Popconfirm>
                      </Tooltip>
                      <Tooltip title="View logs">
                        <Button
                          size="small"
                          icon={<FileTextOutlined />}
                          onClick={() => setLogsService(svc.name)}
                        >
                          Logs
                        </Button>
                      </Tooltip>
                    </>
                  )}
                </Space>
              </Card>
            </Col>
          )
        })}
      </Row>

      {/* Install output modal — shown after a successful install with apt output */}
      <Modal
        open={!!installOutput}
        onCancel={() => setInstallOutput(null)}
        onOk={() => setInstallOutput(null)}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText="Close"
        width={780}
        title={
          installOutput
            ? <Space><CheckCircleOutlined style={{ color: '#52c41a' }} />Installed {installOutput.name}</Space>
            : 'Install output'
        }
      >
        {installOutput && (
          <pre style={{
            background: '#0d1117',
            color: '#c9d1d9',
            padding: 12,
            borderRadius: 4,
            maxHeight: 420,
            overflow: 'auto',
            fontSize: 11,
            lineHeight: 1.5,
          }}>
            {installOutput.output}
          </pre>
        )}
      </Modal>

      {logsService && (
        <LogsModal
          service={logsService}
          open={!!logsService}
          onClose={() => setLogsService(null)}
        />
      )}
    </div>
  )
}

export default ServicesPage
