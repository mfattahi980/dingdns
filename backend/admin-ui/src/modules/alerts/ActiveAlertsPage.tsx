import React from 'react'
import { Card, Table, Button, Tag, Typography, message, Popconfirm, Empty } from 'antd'
import { CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getActiveAlerts, resolveAlert } from '../../core/api'

const { Title } = Typography

const severityColors: Record<string, string> = {
  critical: 'red', high: 'volcano', medium: 'orange', low: 'blue', info: 'default',
}

const ActiveAlertsPage: React.FC = () => {
  const queryClient = useQueryClient()

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['activeAlerts'],
    queryFn: () => getActiveAlerts().then(r => r.data.alerts),
    refetchInterval: 30000,
  })

  const resolveMut = useMutation({
    mutationFn: (id: number) => resolveAlert(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['activeAlerts'] }); message.success('Alert resolved') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'Severity', dataIndex: 'severity', key: 'severity', width: 100,
      render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Rule ID', dataIndex: 'rule_id', key: 'rule', width: 80 },
    { title: 'Message', dataIndex: 'message', key: 'message', ellipsis: true },
    { title: 'Triggered', dataIndex: 'created_at', key: 'time', width: 180,
      render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Actions', key: 'actions', width: 120,
      render: (_: any, record: any) => (
        <Popconfirm title="Resolve this alert?" onConfirm={() => resolveMut.mutate(record.id)}>
          <Button size="small" type="primary" icon={<CheckCircleOutlined />}>Resolve</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Active Alerts</Title>
        <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['activeAlerts'] })}>
          Refresh
        </Button>
      </div>

      <Card>
        {alerts?.length === 0 ? (
          <Empty description="No active alerts" />
        ) : (
          <Table columns={columns} dataSource={alerts || []} loading={isLoading} rowKey="id"
            pagination={false} scroll={{ x: 700 }} />
        )}
      </Card>
    </div>
  )
}

export default ActiveAlertsPage
