import React from 'react'
import { Card, Row, Col, Progress, Descriptions, Typography, Statistic } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { getServerStatus, getDatabaseInfo } from '../../core/api'

const { Title } = Typography

// Parse "6%" → 6
const parsePct = (s: string) => parseInt(s?.replace('%', '') || '0', 10)

const ServerStatusPage: React.FC = () => {
  const { data: status } = useQuery({
    queryKey: ['serverStatus'],
    queryFn: () => getServerStatus().then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: dbInfo } = useQuery({
    queryKey: ['dbInfo'],
    queryFn: () => getDatabaseInfo().then(r => r.data),
  })

  // Extract values from actual backend response format
  const cpuPercent = status?.cpu?.percent ?? parsePct(status?.cpu?.raw?.match(/(\d+\.?\d*)\s*us/)?.[1] || '0')
  const memUsed = Number(status?.memory?.used_mb || 0)
  const memTotal = Number(status?.memory?.total_mb || 1)
  const memPercent = Math.round((memUsed / memTotal) * 100)
  const diskPercent = parsePct(status?.disk?.percent)
  const loadAvg = status?.load?.['1min'] || '0'
  const tableCount = dbInfo?.tables ? Object.keys(dbInfo.tables).length : 0
  const tableTotal = dbInfo?.tables ? Object.values(dbInfo.tables as Record<string,number>).reduce((a,b) => a+b, 0) : 0

  return (
    <div>
      <Title level={3} style={{ marginBottom: 24 }}>Server Status</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Progress type="dashboard" percent={Math.round(cpuPercent)}
                status={cpuPercent > 80 ? 'exception' : 'normal'} />
              <div style={{ marginTop: 8 }}><strong>CPU Usage</strong></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{status?.num_cpu} cores</div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Progress type="dashboard" percent={memPercent}
                status={memPercent > 80 ? 'exception' : 'normal'} />
              <div style={{ marginTop: 8 }}><strong>Memory Usage</strong></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                {memUsed} MB / {memTotal} MB
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Progress type="dashboard" percent={diskPercent}
                status={diskPercent > 90 ? 'exception' : 'normal'} />
              <div style={{ marginTop: 8 }}><strong>Disk Usage</strong></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                {status?.disk?.used} / {status?.disk?.total}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Load Average (1m)" value={loadAvg} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Goroutines" value={status?.goroutines || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Uptime" value={status?.uptime || '-'} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="System Info">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Hostname">{status?.hostname || '-'}</Descriptions.Item>
              <Descriptions.Item label="OS">{status?.os || '-'} ({status?.arch || '-'})</Descriptions.Item>
              <Descriptions.Item label="CPUs">{status?.num_cpu || '-'}</Descriptions.Item>
              <Descriptions.Item label="Load (1/5/15m)">
                {status?.load?.['1min']} / {status?.load?.['5min']} / {status?.load?.['15min']}
              </Descriptions.Item>
              <Descriptions.Item label="Go Version">{status?.go_version || '-'}</Descriptions.Item>
              <Descriptions.Item label="Started">
                {status?.started_at ? new Date(status.started_at).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Database Info">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Type">SQLite</Descriptions.Item>
              <Descriptions.Item label="Size">{dbInfo?.size_mb ? `${dbInfo.size_mb} MB` : '-'}</Descriptions.Item>
              <Descriptions.Item label="Tables">{tableCount} tables</Descriptions.Item>
              <Descriptions.Item label="Total Records">{tableTotal}</Descriptions.Item>
              <Descriptions.Item label="Path">
                <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{dbInfo?.path || '-'}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default ServerStatusPage
