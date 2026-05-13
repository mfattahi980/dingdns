import React, { useState } from 'react'
import {
  Card, Button, Typography, Alert, Table, Space, Tag, Popconfirm,
  message, Modal, Statistic, Row, Col, Tabs, Form, Input, InputNumber,
  Badge,
} from 'antd'
import {
  DownloadOutlined, DatabaseOutlined, PlusOutlined, DeleteOutlined,
  ReloadOutlined, UploadOutlined, WarningOutlined, SafetyOutlined,
  CheckCircleOutlined, SyncOutlined, ApiOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDatabaseInfo, listBackups, createBackup, deleteBackup, restoreBackup,
  getDBEngines, testDBConnection, startDBMigration, getMigrationJob,
} from '../../core/api'
import api from '../../core/api'

const { Title, Text } = Typography


// ─── Backup Tab ───────────────────────────────

const BackupTab: React.FC = () => {
  const queryClient = useQueryClient()
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data: dbInfo, refetch: refetchInfo } = useQuery({
    queryKey: ['dbInfo'],
    queryFn: () => getDatabaseInfo().then(r => r.data),
  })

  const { data: backupsData, isLoading: backupsLoading, refetch: refetchBackups } = useQuery({
    queryKey: ['backupsList'],
    queryFn: () => listBackups().then(r => r.data),
  })

  const backups: any[] = backupsData?.backups ?? []

  const createMut = useMutation({
    mutationFn: () => createBackup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupsList'] })
      message.success('Backup created successfully')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Backup failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteBackup(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupsList'] })
      message.success('Backup deleted')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Delete failed'),
  })

  const restoreMut = useMutation({
    mutationFn: (name: string) => restoreBackup(name),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backupsList', 'dbInfo'] })
      setRestoreTarget(null)
      Modal.success({
        title: 'Database Restored',
        content: (
          <div>
            <p>{res.data.message}</p>
            <p><Text type="secondary" style={{ fontSize: 12 }}>Safety backup: {res.data.safety_backup}</Text></p>
            <Alert type="warning" message="Restart the service to load the restored database." showIcon />
          </div>
        ),
      })
    },
    onError: (e: any) => {
      setRestoreTarget(null)
      message.error(e.response?.data?.error || 'Restore failed')
    },
  })

  const downloadFile = async (name?: string) => {
    const key = name || 'current'
    setDownloading(key)
    try {
      const url = name ? `/server/backups/${encodeURIComponent(name)}` : '/server/backup'
      const res = await api.get(url, { responseType: 'blob' })
      const link = document.createElement('a')
      link.href = window.URL.createObjectURL(new Blob([res.data]))
      link.setAttribute('download', name || `dingdns-${new Date().toISOString().slice(0, 10)}.db`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      message.error('Download failed')
    } finally {
      setDownloading(null)
    }
  }

  const columns = [
    {
      title: 'Filename', dataIndex: 'name', key: 'name',
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Size', dataIndex: 'size_mb', key: 'size', width: 90,
      render: (v: string) => `${v} MB`,
    },
    {
      title: 'Created', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Actions', key: 'actions', width: 220,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Button
            size="small" icon={<DownloadOutlined />}
            loading={downloading === record.name}
            onClick={() => downloadFile(record.name)}
          >
            Download
          </Button>
          <Popconfirm
            title={
              <Space direction="vertical" size={2}>
                <Text strong>Restore "{record.name}"?</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>Current DB is backed up first.</Text>
              </Space>
            }
            onConfirm={() => setRestoreTarget(record.name)}
            okText="Restore" okType="danger"
          >
            <Button size="small" type="primary" danger icon={<UploadOutlined />}>Restore</Button>
          </Popconfirm>
          <Popconfirm title="Delete this backup?" onConfirm={() => deleteMut.mutate(record.name)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { title: 'DB Size', value: dbInfo?.size_mb || '—', suffix: 'MB' },
          { title: 'Total Records', value: dbInfo?.tables ? Object.values(dbInfo.tables as Record<string, number>).reduce((a, b) => a + b, 0) : '—', suffix: '' },
          { title: 'Tables', value: dbInfo?.tables ? Object.keys(dbInfo.tables).length : '—', suffix: '' },
          { title: 'Saved Backups', value: backups.length, suffix: '' },
        ].map(s => (
          <Col key={s.title} span={6}>
            <Card size="small"><Statistic title={s.title} value={s.value} suffix={s.suffix} /></Card>
          </Col>
        ))}
      </Row>

      <Alert
        type="info" showIcon icon={<SafetyOutlined />}
        message="Auto-safety backup is created before every restore."
        description="Store backups offsite for disaster recovery."
        style={{ marginBottom: 16, borderRadius: 8 }}
        closable
      />

      {/* Table counts */}
      {dbInfo?.tables && (
        <Card size="small" style={{ marginBottom: 16 }}
          title={<Space><DatabaseOutlined /><span>Table Record Counts</span></Space>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(dbInfo.tables as Record<string, number>).map(([t, count]) => (
              <Tag key={t} style={{ margin: 0 }}>{t}: <strong>{count}</strong></Tag>
            ))}
          </div>
        </Card>
      )}

      <Card
        title={<Space><DownloadOutlined /><span>Saved Backups</span></Space>}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={() => { refetchInfo(); refetchBackups() }}>Refresh</Button>
            <Button size="small" icon={<DownloadOutlined />} loading={downloading === 'current'} onClick={() => downloadFile()}>Quick Download</Button>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => createMut.mutate()} loading={createMut.isPending}>Create Backup</Button>
          </Space>
        }
      >
        <Table
          columns={columns} dataSource={backups} loading={backupsLoading}
          rowKey="name" size="small" pagination={false}
          locale={{ emptyText: 'No backups yet. Click "Create Backup" to create one.' }}
        />
      </Card>

      <Modal
        title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} /><span>Confirm Restore</span></Space>}
        open={!!restoreTarget}
        onCancel={() => setRestoreTarget(null)}
        onOk={() => restoreTarget && restoreMut.mutate(restoreTarget)}
        confirmLoading={restoreMut.isPending}
        okText="Yes, Restore Database" okType="danger"
      >
        <Alert type="warning" showIcon
          message="This will replace the current database!"
          description={
            <ul style={{ paddingLeft: 16, marginTop: 8 }}>
              <li>Restoring: <Text code>{restoreTarget}</Text></li>
              <li>Current DB will be auto-backed up first</li>
              <li>All changes after this backup will be lost</li>
              <li>Restart service after restore to apply</li>
            </ul>
          }
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  )
}

// ─── DB Engine Tab ─────────────────────────────

const DBEngineTab: React.FC = () => {
  const [form] = Form.useForm()
  const [selectedEngine, setSelectedEngine] = useState('sqlite')
  const [jobId, setJobId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data: enginesData } = useQuery({
    queryKey: ['dbEngines'],
    queryFn: () => getDBEngines().then(r => r.data),
  })
  const engines: any[] = enginesData?.engines ?? []

  const { data: jobData } = useQuery({
    queryKey: ['migrationJob', jobId],
    queryFn: () => getMigrationJob(jobId!).then(r => r.data),
    enabled: !!jobId,
    refetchInterval: jobId ? 2000 : false,
  })

  const migrateMut = useMutation({
    mutationFn: (data: any) => startDBMigration(data),
    onSuccess: (res) => {
      setJobId(res.data.job_id)
      message.info('Migration started. Watching progress...')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Migration failed to start'),
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const values = form.getFieldsValue()
      const res = await testDBConnection({ ...values, engine: selectedEngine })
      setTestResult({ ok: true, msg: res.data.message })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.response?.data?.error || 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleMigrate = () => {
    form.validateFields().then(values => {
      migrateMut.mutate({ ...values, engine: selectedEngine })
    })
  }

  const jobOutput: string[] = jobData?.output ?? []
  const jobStatus: string = jobData?.status ?? 'idle'

  return (
    <div>
      <Alert
        type="warning" showIcon
        message="Database Engine Switching"
        description="Switching engines requires service downtime and manual data migration. SQLite is recommended for most installs. Only switch if you have specific scaling needs."
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      {/* Engine cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {engines.map(eng => (
          <Col key={eng.id} xs={24} sm={12} lg={6}>
            <Card
              size="small"
              hoverable
              onClick={() => setSelectedEngine(eng.id)}
              style={{
                border: selectedEngine === eng.id ? '2px solid #1890ff' : '1px solid #303030',
                cursor: 'pointer',
                background: selectedEngine === eng.id ? 'rgba(24,144,255,0.08)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Text strong style={{ fontSize: 14 }}>{eng.name}</Text>
                  {eng.id === 'sqlite' && <Tag color="green" style={{ marginLeft: 6, fontSize: 10 }}>Current</Tag>}
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>{eng.description}</Text>
                  </div>
                </div>
                <Badge
                  status={eng.installed ? 'success' : 'default'}
                  text={<span style={{ fontSize: 10 }}>{eng.installed ? 'Installed' : 'Not installed'}</span>}
                />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {selectedEngine !== 'sqlite' && (
        <Card
          title={<Space><ApiOutlined /><span>Connection Settings for {selectedEngine}</span></Space>}
          style={{ marginBottom: 16 }}
        >
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="host" label="Host" rules={[{ required: true }]} initialValue="localhost">
                  <Input placeholder="localhost" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="port" label="Port" initialValue={selectedEngine === 'postgresql' ? 5432 : 3306}>
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="database" label="Database" rules={[{ required: true }]}>
                  <Input placeholder="dingdns" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                  <Input placeholder="dingdns_user" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="password" label="Password">
                  <Input.Password placeholder="Database password" />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {testResult && (
            <Alert
              type={testResult.ok ? 'success' : 'error'}
              message={testResult.msg}
              showIcon
              style={{ marginBottom: 12 }}
            />
          )}

          <Space>
            <Button icon={<CheckCircleOutlined />} loading={testing} onClick={handleTest}>
              Test Connection
            </Button>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleMigrate}
              loading={migrateMut.isPending}
            >
              Start Migration Preparation
            </Button>
          </Space>
        </Card>
      )}

      {/* Migration job output */}
      {jobId && (
        <Card
          title={
            <Space>
              <SyncOutlined spin={jobStatus === 'running'} />
              <span>Migration Job</span>
              <Tag color={jobStatus === 'running' ? 'processing' : jobStatus === 'done' ? 'success' : 'error'}>
                {jobStatus}
              </Tag>
            </Space>
          }
        >
          <div
            style={{
              background: '#0d1117',
              color: '#c9d1d9',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: 12,
              overflowY: 'auto',
              maxHeight: 400,
              border: '1px solid #30363d',
              fontFamily: "'Courier New', monospace",
              lineHeight: '1.6',
            }}
          >
            {jobOutput.map((line, i) => {
              let color = '#c9d1d9'
              if (line.startsWith('[ERROR]')) color = '#ff4d4f'
              else if (line.startsWith('[OK]') || line.startsWith('[DONE]')) color = '#52c41a'
              else if (line.startsWith('[INFO]')) color = '#58a6ff'
              else if (line.startsWith('[APT]')) color = '#faad14'
              return <div key={i} style={{ color }}>{line}</div>
            })}
            {jobStatus === 'running' && (
              <div style={{ color: '#58a6ff' }}>
                <SyncOutlined spin /> Running...
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────

const BackupPage: React.FC = () => {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <DatabaseOutlined style={{ fontSize: 22 }} />
        <Title level={3} style={{ margin: 0 }}>Database</Title>
      </div>

      <Tabs
        defaultActiveKey="backup"
        items={[
          {
            key: 'backup',
            label: <Space><DownloadOutlined />Backup & Restore</Space>,
            children: <BackupTab />,
          },
          {
            key: 'engine',
            label: <Space><DatabaseOutlined />Database Engine</Space>,
            children: <DBEngineTab />,
          },
        ]}
      />
    </div>
  )
}

export default BackupPage
