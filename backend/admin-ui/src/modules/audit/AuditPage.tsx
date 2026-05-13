import React, { useState } from 'react'
import {
  Card, Table, Tag, Typography, Select, Space, Button, Popconfirm, Input, message,
} from 'antd'
import {
  DeleteOutlined, ClearOutlined, SearchOutlined, ReloadOutlined, AuditOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuditLogs, deleteAuditLog, clearAllAuditLogs } from '../../core/api'
import { useAuth } from '../../core/auth'

const { Title, Text } = Typography

const actionColors: Record<string, string> = {
  create:  'green',
  update:  'blue',
  delete:  'red',
  login:   'cyan',
  logout:  'orange',
  enable:  'lime',
  disable: 'volcano',
  start:   'geekblue',
  stop:    'red',
  restart: 'purple',
  sync:    'blue',
  add:     'green',
  clear:   'red',
}

function getActionColor(action: string) {
  const prefix = action?.split('_')[0]
  return actionColors[prefix] || 'default'
}

const AuditPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string>()
  const [resource, setResource] = useState<string>()
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const { isSuperAdmin } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['auditLogs', page, action, resource, search],
    queryFn: () => getAuditLogs({ page, action, resource, search }).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAuditLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      message.success('Log entry deleted')
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to delete'),
  })

  const clearMut = useMutation({
    mutationFn: () => clearAllAuditLogs(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['auditLogs'] })
      message.success(`Cleared ${res.data.deleted} log entries`)
    },
    onError: (e: any) => message.error(e.response?.data?.error || 'Failed to clear'),
  })

  const columns = [
    {
      title: 'ID', dataIndex: 'id', key: 'id', width: 60,
    },
    {
      title: 'Time', dataIndex: 'created_at', key: 'time', width: 160,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: 'Admin', dataIndex: 'user_id', key: 'admin', width: 80,
      render: (v: number) => v ? <Tag>#{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Action', dataIndex: 'action', key: 'action', width: 180,
      render: (v: string) => <Tag color={getActionColor(v)}>{v}</Tag>,
    },
    {
      title: 'Resource', dataIndex: 'resource', key: 'resource', width: 110,
      render: (v: string) => v ? <Tag>{v}</Tag> : null,
    },
    {
      title: 'Resource ID', dataIndex: 'resource_id', key: 'rid', width: 90,
      render: (v: number) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Details', dataIndex: 'details', key: 'details', ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'IP', dataIndex: 'ip', key: 'ip', width: 130,
      render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : null,
    },
    ...(isSuperAdmin ? [{
      title: '', key: 'del', width: 50,
      render: (_: any, record: any) => (
        <Popconfirm title="Delete this log entry?" onConfirm={() => deleteMut.mutate(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }] : []),
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AuditOutlined style={{ fontSize: 22 }} />
          <Title level={3} style={{ margin: 0 }}>Audit Logs</Title>
          {data?.total != null && (
            <Tag>{data.total.toLocaleString()} total</Tag>
          )}
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => queryClient.invalidateQueries({ queryKey: ['auditLogs'] })}
            loading={isLoading}
          >
            Refresh
          </Button>
          {isSuperAdmin && (
            <Popconfirm
              title="Clear ALL audit logs?"
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
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search details, IP..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            placeholder="Filter by action"
            allowClear
            value={action}
            onChange={v => { setAction(v); setPage(1) }}
            style={{ width: 180 }}
            options={[
              'create', 'update', 'delete', 'login', 'logout',
              'start', 'stop', 'restart', 'sync', 'add',
            ].map(a => ({ value: a, label: a }))}
          />
          <Select
            placeholder="Filter by resource"
            allowClear
            value={resource}
            onChange={v => { setResource(v); setPage(1) }}
            style={{ width: 160 }}
            options={[
              'zone', 'record', 'admin', 'api_key', 'ddns_token',
              'ip_ban', 'setting', 'alert_rule', 'service', 'server', 'firewall',
            ].map(r => ({ value: r, label: r }))}
          />
        </Space>

        <Table
          columns={columns}
          dataSource={data?.logs || []}
          loading={isLoading}
          rowKey="id"
          size="small"
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            total: data?.total || 0,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `Total ${t} entries`,
            showSizeChanger: false,
          }}
        />
      </Card>
    </div>
  )
}

export default AuditPage
