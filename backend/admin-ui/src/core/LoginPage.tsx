import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Alert } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { login as apiLogin, getCaptcha } from './api'

const { Title, Text } = Typography

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [needs2FA, setNeeds2FA] = useState(false)
  const [captcha, setCaptcha] = useState<{ id: string; image: string } | null>(null)
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form] = Form.useForm()

  // Load captcha on mount — if enabled, show from the start
  useEffect(() => {
    loadCaptcha()
  }, [])

  const loadCaptcha = async () => {
    try {
      const res = await getCaptcha()
      if (res.data.enabled === false) {
        setCaptchaEnabled(false)
        setCaptcha(null)
        return
      }
      setCaptchaEnabled(true)
      setCaptcha({ id: res.data.captcha_id, image: res.data.captcha_image })
      form.setFieldValue('captcha_answer', '')
    } catch {
      // If captcha endpoint fails, proceed without it
      setCaptchaEnabled(false)
    }
  }

  const handleLogin = async (values: any) => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const payload: any = {
        username: credentials?.username ?? values.username,
        password: credentials?.password ?? values.password,
      }

      if (needs2FA) {
        payload.totp_code = values.totp_code
      }

      if (captcha && captchaEnabled) {
        payload.captcha_id = captcha.id
        payload.captcha_answer = values.captcha_answer
      }

      const res = await apiLogin(payload)
      login(res.data.token, res.data.admin)
      navigate('/dashboard')
    } catch (err: any) {
      const errData = err.response?.data

      if (errData?.requires_2fa) {
        setNeeds2FA(true)
        setCredentials({ username: values.username, password: values.password })
        setErrorMsg(null)
      } else if (errData?.requires_2fa_setup) {
        setErrorMsg('Two-factor authentication is required. Please enable 2FA first.')
      } else if (errData?.error === 'captcha is required') {
        // Captcha wasn't loaded yet — load it now and ask user to fill
        await loadCaptcha()
        setErrorMsg('Please solve the captcha to continue.')
      } else if (errData?.error === 'incorrect captcha answer') {
        await loadCaptcha()
        setErrorMsg('Captcha answer is incorrect. Please try again.')
      } else {
        setErrorMsg(errData?.error || 'Invalid username or password.')
        // Refresh captcha on any auth failure
        if (captchaEnabled) loadCaptcha()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #0d1117 50%, #0a0a14 100%)',
    }}>
      <Card
        style={{
          width: 420,
          borderRadius: 16,
          background: '#141414',
          border: '1px solid #303030',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #1668dc, #0958d9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 4px 14px rgba(22,104,220,0.4)',
          }}>
            <span style={{ fontSize: 26 }}>⚡</span>
          </div>
          <Title level={2} style={{ margin: 0, color: '#fff' }}>DingDns</Title>
          <Text type="secondary">Admin Control Panel</Text>
        </div>

        {errorMsg && (
          <Alert
            message={errorMsg}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMsg(null)}
            style={{ marginBottom: 20, borderRadius: 8 }}
          />
        )}

        {needs2FA ? (
          <Form form={form} onFinish={handleLogin} layout="vertical">
            <Alert
              message="Two-Factor Authentication"
              description="Enter the 6-digit code from your authenticator app"
              type="info"
              showIcon
              style={{ marginBottom: 24, borderRadius: 8 }}
            />
            <Form.Item name="totp_code" rules={[{ required: true, message: 'Enter 2FA code' }]}>
              <Input
                prefix={<SafetyOutlined style={{ color: '#1668dc' }} />}
                placeholder="6-digit code"
                size="large"
                maxLength={6}
                autoFocus
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block size="large"
                style={{ borderRadius: 8, height: 44, fontWeight: 600 }}>
                Verify Code
              </Button>
            </Form.Item>
            <Button type="link" block onClick={() => { setNeeds2FA(false); setCredentials(null); setErrorMsg(null) }}>
              ← Back to login
            </Button>
          </Form>
        ) : (
          <Form form={form} onFinish={handleLogin} layout="vertical">
            <Form.Item name="username" rules={[{ required: true, message: 'Enter your username' }]}>
              <Input
                prefix={<UserOutlined style={{ color: '#555' }} />}
                placeholder="Username or Email"
                size="large"
                autoFocus
                style={{ borderRadius: 8 }}
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Enter your password' }]}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#555' }} />}
                placeholder="Password"
                size="large"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            {captchaEnabled && captcha && (
              <>
                {/* Captcha image + refresh — outside Form.Item so it doesn't interfere with binding */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
                    Security Check — solve the equation:
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, borderRadius: 8, overflow: 'hidden',
                      border: '1px solid #303030', background: '#0d1117',
                    }}>
                      <img
                        src={captcha.image}
                        alt="captcha"
                        style={{ width: '100%', height: 72, display: 'block', userSelect: 'none' }}
                        draggable={false}
                      />
                    </div>
                    <Button
                      icon={<ReloadOutlined />}
                      size="large"
                      onClick={loadCaptcha}
                      title="New captcha"
                      style={{ borderRadius: 8, flexShrink: 0 }}
                    />
                  </div>
                </div>
                <Form.Item
                  name="captcha_answer"
                  rules={[{ required: true, message: 'Enter the answer' }]}
                >
                  <Input
                    placeholder="Your answer (numbers only)"
                    size="large"
                    inputMode="numeric"
                    style={{ borderRadius: 8 }}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item style={{ marginTop: captchaEnabled ? 4 : 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                style={{ borderRadius: 8, height: 44, fontWeight: 600, marginTop: 4 }}
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
    </div>
  )
}

export default LoginPage
