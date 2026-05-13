import React from 'react'
import { Card, Table, Button, Typography, message, Popconfirm } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSessions, revokeSession } from '../../core/api'

const { Title } = Typography

const SessionsPage: React.FC = () => {
  const queryClient = useQueryClient()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => getSessions().then(r => r.data.sessions),
  })

  const revokeMut = useMutation({
    mutationFn: (id: number) => revokeSession(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sessions'] }); message.success('Session revoked') },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed'),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
    { title: 'IP Address', dataIndex: 'ip', key: 'ip', width: 140 },
    { title: 'User Agent', dataIndex: 'user_agent', key: 'ua', ellipsis: true },
    { title: 'Last Used', dataIndex: 'last_used', key: 'last_used', width: 170,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: 'Expires', dataIndex: 'expires_at', key: 'expires', width: 170,
      render: (v: string) => new Date(v).toLocaleString() },
    { title: 'Actions', key: 'actions', width: 90,
      render: (_: any, record: any) => (
        <Popconfirm title="Revoke this session?" onConfirm={() => revokeMut.mutate(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />}>Revoke</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Active Sessions</Title>
      <Card>
        <Table columns={columns} dataSource={sessions || []} loading={isLoading} rowKey="id"
          pagination={false} scroll={{ x: 800 }} />
      </Card>
    </div>
  )
}

export default SessionsPage
