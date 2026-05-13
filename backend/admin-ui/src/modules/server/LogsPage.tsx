import React, { useState, useRef, useEffect } from 'react'
import {
  Card, Select, InputNumber, Button, Space, Typography, Input, Switch, Badge, Tag,
} from 'antd'
import { ReloadOutlined, SearchOutlined, PauseOutlined, CaretRightOutlined, ClearOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { getServerLogs } from '../../core/api'

const { Title } = Typography

const LOG_COLORS: Record<string, string> = {
  error:   '#ff4d4f',
  warn:    '#faad14',
  warning: '#faad14',
  info:    '#1890ff',
  debug:   '#52c41a',
  notice:  '#722ed1',
}

function colorLine(line: string): React.ReactNode {
  const lower = line.toLowerCase()
  let color = '#a8b4c8'
  for (const [key, val] of Object.entries(LOG_COLORS)) {
    if (lower.includes(key)) { color = val; break }
  }
  return <span style={{ color }}>{line}</span>
}

const LogsPage: React.FC = () => {
  const [service, setService] = useState('dingdns')
  const [lines, setLines] = useState(200)
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['serverLogs', service, lines, search],
    queryFn: () => getServerLogs(service, lines, search).then(r => r.data),
    refetchInterval: autoRefresh ? 5000 : false,
  })

  const logLines: string[] = data?.lines ?? []
  const output: string = data?.output ?? ''

  useEffect(() => {
    if (autoRefresh) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output, autoRefresh])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>Server Logs</Title>
        <Space>
          <Tag color={autoRefresh ? 'green' : 'default'}>
            {autoRefresh ? 'Live' : 'Paused'}
          </Tag>
          <Switch
            checkedChildren={<CaretRightOutlined />}
            unCheckedChildren={<PauseOutlined />}
            checked={autoRefresh}
            onChange={setAutoRefresh}
          />
        </Space>
      </div>

      <Card>
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            value={service}
            onChange={v => setService(v)}
            style={{ width: 180 }}
            options={[
              { value: 'dingdns', label: '🔵 DingDns' },
              { value: 'nginx', label: '🟢 Nginx' },
              { value: 'sshd', label: '🟡 SSH' },
              { value: 'system', label: '⚙️ System' },
            ]}
          />
          <InputNumber
            value={lines}
            onChange={v => setLines(v || 200)}
            min={10} max={2000}
            addonBefore="Lines"
            style={{ width: 160 }}
          />
          <Input
            prefix={<SearchOutlined />}
            placeholder="Filter logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
            Refresh
          </Button>
          <Button
            icon={<ClearOutlined />}
            onClick={() => setSearch('')}
            disabled={!search}
          >
            Clear filter
          </Button>
        </Space>

        {search && (
          <div style={{ marginBottom: 8 }}>
            <Badge count={logLines.length} style={{ backgroundColor: '#1890ff' }} />
            <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
              matching lines for "{search}"
            </span>
          </div>
        )}

        <div
          style={{
            background: '#0d1117',
            color: '#c9d1d9',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 12,
            overflowY: 'auto',
            maxHeight: 600,
            border: '1px solid #30363d',
            fontFamily: "'Courier New', 'Consolas', monospace",
            lineHeight: '1.6',
          }}
        >
          {isLoading ? (
            <span style={{ color: '#58a6ff' }}>Loading logs...</span>
          ) : logLines.length === 0 ? (
            <span style={{ color: '#6e7681' }}>
              {search ? `No lines matching "${search}"` : 'No log output available. Ensure journalctl sudoers is configured.'}
            </span>
          ) : (
            logLines.map((line, i) => (
              <div key={i} style={{ minHeight: 18, borderBottom: '1px solid rgba(255,255,255,0.03)', padding: '1px 0' }}>
                {colorLine(line)}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {logLines.length} lines · service: {data?.service || service}
          {autoRefresh && ' · auto-refresh every 5s'}
        </div>
      </Card>
    </div>
  )
}

export default LogsPage
