import React, { useEffect, useRef, useState } from 'react'
import {
  Card, Typography, Button, Descriptions, Tag, Alert, Space, message,
  Steps, Progress, Modal,
} from 'antd'
import {
  ReloadOutlined, CloudDownloadOutlined, CheckCircleOutlined,
  GithubOutlined, CloseCircleOutlined, LoadingOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUpdateInfo, triggerUpdate, getUpdateJob } from '../../core/api'

const { Title, Text, Paragraph } = Typography

const short = (sha?: string) => (sha ? sha.slice(0, 7) : '—')

interface JobStep {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
  started_at?: string
  finished_at?: string
  detail?: string
}

interface JobSnapshot {
  id: string
  status: 'running' | 'success' | 'failed'
  started_at: string
  finished_at?: string
  exit_code?: number
  steps: JobStep[]
  progress: number
  current_detail: string
  log: string
  log_total_bytes: number
  next_offset: number
}

const stepStatusToAntd = (s: JobStep['status']): 'wait' | 'process' | 'finish' | 'error' => {
  switch (s) {
    case 'running': return 'process'
    case 'done':    return 'finish'
    case 'failed':  return 'error'
    default:        return 'wait'
  }
}

const stepIcon = (s: JobStep['status']) => {
  switch (s) {
    case 'running': return <LoadingOutlined />
    case 'done':    return <CheckCircleOutlined />
    case 'failed':  return <CloseCircleOutlined />
    default:        return <ClockCircleOutlined />
  }
}

const UpdatesPage: React.FC = () => {
  // Job state
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobSnapshot | null>(null)
  const [logBuffer, setLogBuffer] = useState('')
  const [pollOffset, setPollOffset] = useState(0)
  const [pollError, setPollError] = useState<string | null>(null)
  const [restartInProgress, setRestartInProgress] = useState(false)
  const [showFinishedModal, setShowFinishedModal] = useState(false)
  const logEndRef = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()

  // ── Version info (independent of any running job) ──────────────────────
  const {
    data: info,
    isLoading: infoLoading,
    refetch: refetchInfo,
    isFetching: infoFetching,
  } = useQuery({
    queryKey: ['updateInfo'],
    queryFn: () => getUpdateInfo().then(r => r.data),
    refetchOnWindowFocus: false,
  })

  const updateAvailable = !!info?.update_available
  const checkError      = info?.check_error

  // ── Polling loop while a job is active ────────────────────────────────
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let consecutiveErrors = 0

    const tick = async () => {
      try {
        const res = await getUpdateJob(jobId, pollOffset)
        if (cancelled) return
        const data = res.data as JobSnapshot
        setJob(data)
        if (data.log) {
          setLogBuffer(prev => prev + data.log)
        }
        setPollOffset(data.next_offset)
        consecutiveErrors = 0
        setPollError(null)
        setRestartInProgress(false)

        if (data.status === 'success' || data.status === 'failed') {
          // Final state — stop polling and refresh version info.
          setShowFinishedModal(true)
          queryClient.invalidateQueries({ queryKey: ['updateInfo'] })
          return // don't schedule next tick
        }
      } catch (e: any) {
        if (cancelled) return
        consecutiveErrors++
        // 404 from the *new* binary that doesn't know about an old job ID
        // means the update finished + restarted. Stop polling.
        if (e.response?.status === 404 && consecutiveErrors > 2) {
          setPollError('Job no longer tracked by the server. The update may have finished — reload the version info.')
          queryClient.invalidateQueries({ queryKey: ['updateInfo'] })
          return
        }
        // Network error / 502 / 503 = service restarting. Keep trying.
        setRestartInProgress(true)
        setPollError(e?.message || 'connection lost')
      }
      if (!cancelled) {
        setTimeout(tick, 1500)
      }
    }
    tick()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logBuffer])

  // ── Mutation: start the update ────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: () => triggerUpdate(),
    onSuccess: (res) => {
      const id = res.data.job_id || res.data.id
      setJobId(id)
      setJob(null)
      setLogBuffer('')
      setPollOffset(0)
      setPollError(null)
      setShowFinishedModal(false)
      setRestartInProgress(false)
      message.info('Update started — watching live progress below.', 4)
    },
    onError: (e: any) => {
      const status = e.response?.status
      const data   = e.response?.data
      if (status === 409 && data?.job_id) {
        // Another update is already running — adopt its ID and start watching.
        setJobId(data.job_id)
        setJob(null)
        setLogBuffer('')
        setPollOffset(0)
        message.warning('An update was already running — attaching to it.', 4)
        return
      }
      message.error(data?.error || 'Failed to start update')
    },
  })

  // ── UI helpers ────────────────────────────────────────────────────────
  const isFinal     = job?.status === 'success' || job?.status === 'failed'
  const isRunning   = !!jobId && !isFinal

  const overallTag =
    job?.status === 'success' ? <Tag color="green"  icon={<CheckCircleOutlined />}>Success</Tag> :
    job?.status === 'failed'  ? <Tag color="red"    icon={<CloseCircleOutlined />}>Failed</Tag> :
    isRunning                 ? <Tag color="blue"   icon={<LoadingOutlined />}>Running</Tag> :
                                <Tag>Idle</Tag>

  return (
    <div>
      <Title level={3} style={{ marginBottom: 8 }}>
        <GithubOutlined style={{ marginRight: 8 }} />
        System Updates
      </Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        Check GitHub for new commits on the <Text code>main</Text> branch of{' '}
        <Text code>mfattahi980/dingdns</Text> and apply them with one click.
        Live progress is shown below while the installer runs.
      </Paragraph>

      {/* ── Version info card ─────────────────────────────────────── */}
      <Card loading={infoLoading} style={{ marginBottom: 16 }}>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="Running version">
            <Space>
              <Tag color="blue">v{info?.current_version || '—'}</Tag>
              <Text code copyable={!!info?.current_commit}>
                {short(info?.current_commit) || 'unknown'}
              </Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Latest on GitHub">
            {checkError ? (
              <Tag color="red">Check failed</Tag>
            ) : (
              <Space>
                <Text code copyable={!!info?.latest_commit}>
                  {short(info?.latest_commit) || '—'}
                </Text>
                {info?.latest_committed_at && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(info.latest_committed_at).toLocaleString()}
                  </Text>
                )}
              </Space>
            )}
          </Descriptions.Item>
          {info?.latest_message && (
            <Descriptions.Item label="Latest commit">
              <Text>{info.latest_message}</Text>
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
              onClick={() => refetchInfo()}
              loading={infoFetching}
              disabled={isRunning}
            >
              Check Again
            </Button>
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              onClick={() => updateMut.mutate()}
              loading={updateMut.isPending}
              disabled={(!updateAvailable && !isFinal) || isRunning}
            >
              {isRunning ? 'Updating…' : updateAvailable ? 'Update Now' : 'Up to date'}
            </Button>
          </Space>
        </div>
      </Card>

      {checkError && !jobId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Could not check GitHub"
          description={
            <>
              The server failed to reach the GitHub API: <Text code>{checkError}</Text>.
              The installed binary still runs fine — try again in a minute.
            </>
          }
        />
      )}

      {/* ── Active job UI ─────────────────────────────────────────── */}
      {jobId && (
        <Card
          title={
            <Space>
              <span>Update Progress</span>
              {overallTag}
              <Text type="secondary" style={{ fontSize: 12 }}>
                job <code>{jobId}</code>
              </Text>
            </Space>
          }
          style={{ marginBottom: 16 }}
          extra={
            job && (
              <Space size={16}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Started {new Date(job.started_at).toLocaleTimeString()}
                </Text>
                {job.finished_at && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Finished {new Date(job.finished_at).toLocaleTimeString()}
                  </Text>
                )}
              </Space>
            )
          }
        >
          <Progress
            percent={job?.progress ?? 0}
            status={
              job?.status === 'failed'  ? 'exception' :
              job?.status === 'success' ? 'success'   :
                                          'active'
            }
            style={{ marginBottom: 16 }}
          />

          {restartInProgress && (
            <Alert
              type="info"
              showIcon
              icon={<LoadingOutlined />}
              style={{ marginBottom: 16 }}
              message="Service restarting…"
              description="The new binary is coming up. The polling will resume automatically as soon as the API is reachable again."
            />
          )}

          {pollError && !restartInProgress && (
            <Alert
              type="warning" showIcon style={{ marginBottom: 16 }}
              message="Polling issue"
              description={pollError}
            />
          )}

          <Steps
            direction="vertical"
            size="small"
            current={job?.steps?.findIndex(s => s.status === 'running') ?? -1}
            items={(job?.steps || []).map(s => ({
              title: s.name,
              status: stepStatusToAntd(s.status),
              icon: stepIcon(s.status),
              description: s.detail
                ? <Text type={s.status === 'failed' ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>{s.detail}</Text>
                : s.status === 'done' && s.started_at && s.finished_at
                  ? <Text type="secondary" style={{ fontSize: 12 }}>
                      {Math.max(1, Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 1000))}s
                    </Text>
                  : null,
            }))}
          />

          {job?.current_detail && job.status === 'running' && (
            <Alert
              type="info" showIcon icon={<LoadingOutlined />}
              style={{ marginTop: 16 }}
              message={<Text style={{ fontSize: 13 }}>{job.current_detail}</Text>}
            />
          )}
        </Card>
      )}

      {/* ── Live log terminal ─────────────────────────────────────── */}
      {jobId && (
        <Card
          title={<Space><span>Installer Output</span>
            <Tag>{logBuffer.length.toLocaleString()} bytes</Tag>
          </Space>}
          size="small"
        >
          <div
            style={{
              backgroundColor: '#1f1f1f',
              color: '#d4d4d4',
              fontFamily: 'Menlo, Consolas, "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.4,
              padding: 12,
              borderRadius: 4,
              maxHeight: 420,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logBuffer || <Text type="secondary" style={{ color: '#888' }}>Waiting for output…</Text>}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      <Modal
        open={showFinishedModal}
        onCancel={() => setShowFinishedModal(false)}
        onOk={() => { setShowFinishedModal(false); refetchInfo() }}
        title={
          job?.status === 'success'
            ? <Space><CheckCircleOutlined style={{ color: '#52c41a' }} />Update complete</Space>
            : <Space><CloseCircleOutlined style={{ color: '#ff4d4f' }} />Update failed</Space>
        }
        okText="Refresh version info"
        cancelText="Close"
      >
        {job?.status === 'success' ? (
          <>
            <Paragraph>The installer finished and DingDns restarted successfully.</Paragraph>
            <Paragraph>Reload the page to make sure you're seeing the new admin UI.</Paragraph>
          </>
        ) : (
          <>
            <Paragraph>
              The installer exited with code <Text code>{job?.exit_code ?? 'unknown'}</Text>.
              Scroll through the installer output above for the full error message.
            </Paragraph>
            <Paragraph type="secondary">
              The previous binary may still be running — check Server → Services to confirm.
            </Paragraph>
          </>
        )}
      </Modal>
    </div>
  )
}

export default UpdatesPage
