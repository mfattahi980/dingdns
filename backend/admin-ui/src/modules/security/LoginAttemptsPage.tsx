import React, { useState } from 'react'
import { Card, Table, Tag, Typography, Button, Popconfirm, Space, message } from 'antd'
import { ClearOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getLoginAttempts, clearLoginAttempts } from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title } = Typography

const LoginAttemptsPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const { isSuperAdmin } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['loginAttempts', page],
    queryFn: () => getLoginAttempts(page).then(r => r.data),
  })

  const clearMut = useMutation({
    mutationFn: () => clearLoginAttempts(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['loginAttempts'] })
      message.success(`Cleared ${res.data.deleted} login attempt records`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to clear'),
  })

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Username', dataIndex: 'username', key: 'username', width: 140 },
    {
      title: 'IP Address', dataIndex: 'ip', key: 'ip', width: 140,
      render: (v: string) => <code>{v}</code>,
    },
    {
      title: 'Status', dataIndex: 'success', key: 'success', width: 100,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? 'Success' : 'Failed'}</Tag>,
    },
    { title: 'User Agent', dataIndex: 'user_agent', key: 'ua', ellipsis: true },
    {
      title: 'Time', dataIndex: 'created_at', key: 'time', width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
  ]

  const attempts = data?.data || data?.attempts || []
  const total = data?.total || 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Login Attempts</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['loginAttempts'] })}
          >
            Refresh
          </Button>
          {isSuperAdmin && (
            <Popconfirm
              title="Clear ALL login attempts?"
              description="This cannot be undone."
              onConfirm={() => clearMut.mutate()}
              okType="danger"
              okText="Yes, clear all"
            >
              <Button danger icon={<ClearOutlined />} loading={clearMut.isPending}>
                Clear All
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={attempts}
          loading={isLoading}
          rowKey="id"
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `Total ${t} attempts`,
          }}
          scroll={{ x: 800 }}
          size="small"
        />
      </Card>
    </div>
  )
}

export default LoginAttemptsPage
