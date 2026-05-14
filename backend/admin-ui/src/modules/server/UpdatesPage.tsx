import React, { useState } from 'react'
import { Card, Typography, Button, Descriptions, Tag, Alert, Space, message } from 'antd'
import { ReloadOutlined, CloudDownloadOutlined, CheckCircleOutlined, GithubOutlined } from '@ant-design/icons'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getUpdateInfo, triggerUpdate } from '../../core/api'

const { Title, Text, Paragraph } = Typography

const short = (sha?: string) => (sha ? sha.slice(0, 7) : '—')

const UpdatesPage: React.FC = () => {
  const [updating, setUpdating] = useState(false)

  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['updateInfo'],
    queryFn: () => getUpdateInfo().then(r => r.data),
    refetchOnWindowFocus: false,
  })

  const updateMut = useMutation({
    mutationFn: () => triggerUpdate(),
    onSuccess: () => {
      setUpdating(true)
      message.info(
        'Update started. The service will restart in ~1 minute. The panel may briefly go offline.',
        6,
      )
    },
    onError: (e: any) => {
      message.error(e.response?.data?.error || 'Failed to start update')
    },
  })

  const updateAvailable = !!data?.update_available
  const checkError = data?.check_error

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>
        <GithubOutlined style={{ marginRight: 8 }} />
        System Updates
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Check GitHub for new commits on the <Text code>main</Text> branch of{' '}
        <Text code>mfattahi980/dingdns</Text> and apply them with one click.
      </Paragraph>

      <Card loading={isLoading} style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Running version">
            <Space>
              <Tag color="blue">v{data?.current_version || '—'}</Tag>
              <Text code copyable={!!data?.current_commit}>
                {short(data?.current_commit) || 'unknown'}
              </Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Latest on GitHub">
            {checkError ? (
              <Tag color="red">Check failed</Tag>
            ) : (
              <Space>
                <Text code copyable={!!data?.latest_commit}>
                  {short(data?.latest_commit) || '—'}
                </Text>
                {data?.latest_committed_at && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(data.latest_committed_at).toLocaleString()}
                  </Text>
                )}
              </Space>
            )}
          </Descriptions.Item>
          {data?.latest_message && (
            <Descriptions.Item label="Latest commit">
              <Text>{data.latest_message}</Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Status">
            {checkError ? (
              <Tag color="red">{checkError}</Tag>
            ) : updateAvailable ? (
              <Tag color="orange">Update available</Tag>
            ) : (
              <Tag color="green" icon={<CheckCircleOutlined />}>
                Up to date
              </Tag>
            )}
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 16 }}>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={isFetching}
            >
              Check Again
            </Button>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              onClick={() => updateMut.mutate()}
              loading={updateMut.isPending}
              disabled={!updateAvailable || updating}
            >
              {updating ? 'Updating…' : 'Update Now'}
            </Button>
          </Space>
        </div>
      </Card>

      {updating && (
        <Alert
          type="info"
          showIcon
          message="Update in progress"
          description={
            <>
              The installer is downloading and rebuilding from{' '}
              <Text code>mfattahi980/dingdns@main</Text>. The service will
              restart on its own. Reload this page after ~1 minute to verify
              the new commit is live. Logs are at{' '}
              <Text code>/var/log/dingdns/update.log</Text>.
            </>
          }
        />
      )}

      {checkError && !updating && (
        <Alert
          type="warning"
          showIcon
          message="Could not check GitHub"
          description={
            <>
              The server failed to reach the GitHub API: <Text code>{checkError}</Text>.
              This usually means no outbound network or a transient rate limit. The
              installed binary still runs fine — try again in a minute.
            </>
          }
        />
      )}
    </div>
  )
}

export default UpdatesPage
