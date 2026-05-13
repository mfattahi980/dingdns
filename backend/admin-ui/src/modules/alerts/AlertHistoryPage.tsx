import React, { useState } from 'react'
import { Card, Table, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { getAlertHistory } from '../../core/api'

const { Title } = Typography

const severityColors: Record<string, string> = {
  critical: 'red', high: 'volcano', medium: 'orange', low: 'blue', info: 'default',
}

const AlertHistoryPage: React.FC = () => {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['alertHistory', page],
    queryFn: () => getAlertHistory(page).then(r => r.data),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'Severity', dataIndex: 'severity', key: 'severity', width: 100,
      render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v?.toUpperCase()}</Tag> },
    { title: 'Rule ID', dataIndex: 'rule_id', key: 'rule', width: 80 },
    { title: 'Message', dataIndex: 'message', key: 'message', ellipsis: true },
    { title: 'Status', dataIndex: 'is_active', key: 'status', width: 100,
      render: (v: boolean) => <Tag color={v ? 'orange' : 'green'}>{v ? 'Active' : 'Resolved'}</Tag> },
    { title: 'Triggered', dataIndex: 'created_at', key: 'triggered', width: 160,
      render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Resolved At', dataIndex: 'resolved_at', key: 'resolved_at', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Alert History</Title>
      <Card>
        <Table columns={columns} dataSource={data?.alerts || []} loading={isLoading} rowKey="id"
          pagination={{
            current: page, total: data?.total || 0, pageSize: 50, onChange: setPage,
            showTotal: (t) => `Total ${t} alerts`,
          }}
          scroll={{ x: 800 }} size="small" />
      </Card>
    </div>
  )
}

export default AlertHistoryPage
