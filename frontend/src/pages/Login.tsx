import { useState, useEffect } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Server, ShieldCheck, RefreshCw, CheckCircle, AlertCircle, Mail } from 'lucide-react'
import { login, getPublicSettings, getCaptcha, resendVerification } from '../lib/api'

interface LoginProps {
  onLogin: (token: string, user: any) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [needs2FA, setNeeds2FA] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Captcha state
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')

  useEffect(() => {
    // Check verification redirect
    const verified = searchParams.get('verified')
    if (verified === 'success') {
      setSuccess('Email verified successfully! You can now log in.')
    } else if (verified === 'invalid') {
      setError('Invalid or expired verification link.')
    } else if (verified === 'already') {
      setSuccess('Email is already verified. Please log in.')
    }

    getPublicSettings().then(res => {
      setCaptchaEnabled(res.data.captcha_enabled)
      setRegistrationEnabled(res.data.registration_enabled)
      if (res.data.captcha_enabled) loadCaptcha()
    }).catch(() => {})
  }, [])

  const loadCaptcha = async () => {
    try {
      const res = await getCaptcha()
      setCaptchaId(res.data.captcha_id)
      setCaptchaQuestion(res.data.captcha_question)
      setCaptchaAnswer('')
    } catch {}
  }

  const handleResendVerification = async () => {
    try {
      await resendVerification(verifyEmail)
      setSuccess('Verification email sent! Check your inbox.')
    } catch {
      setError('Failed to resend verification email')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const res = await login(
        email,
        password,
        needs2FA ? totpCode : undefined,
        captchaEnabled ? captchaId : undefined,
        captchaEnabled ? captchaAnswer : undefined,
      )
      onLogin(res.data.token, res.data.user)
      navigate('/zones')
    } catch (err: any) {
      const data = err.response?.data
      if (data?.requires_2fa) {
        setNeeds2FA(true)
        setError('')
      } else if (data?.needs_verification) {
        setNeedsVerification(true)
        setVerifyEmail(data.email || email)
        setError('')
      } else {
        setError(data?.error || 'Login failed')
        if (captchaEnabled) loadCaptcha()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-gray-800">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">DingDns</h1>
          <p className="text-gray-400 mt-1">DNS Management Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold mb-6">
            {needs2FA ? 'Two-Factor Authentication' : needsVerification ? 'Email Verification Required' : 'Sign In'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          <div className="space-y-4">
            {needsVerification ? (
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <p className="text-gray-600 mb-4">
                  Please verify your email address (<strong>{verifyEmail}</strong>) before logging in.
                  Check your inbox for the verification link.
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => { setNeedsVerification(false); setError('') }}
                  className="w-full py-2 mt-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to login
                </button>
              </div>
            ) : !needs2FA ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="********"
                    required
                  />
                </div>

                {captchaEnabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Security Check</label>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 p-3 bg-gray-100 rounded-lg text-center">
                        <span className="text-lg font-bold text-gray-800 select-none">{captchaQuestion} = ?</span>
                      </div>
                      <button
                        type="button"
                        onClick={loadCaptcha}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                        title="New captcha"
                      >
                        <RefreshCw className="w-5 h-5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      placeholder="Your answer"
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                {registrationEnabled && (
                  <p className="text-center text-sm text-gray-500">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                      Sign Up
                    </Link>
                  </p>
                )}
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    <span className="text-sm text-blue-700">
                      Enter the 6-digit code from your authenticator app
                    </span>
                  </div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2FA Code</label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-center text-2xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                  />
                  <p className="text-xs text-gray-500 mt-2">You can also use a backup code</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>

                <button
                  type="button"
                  onClick={() => { setNeeds2FA(false); setTotpCode(''); setError('') }}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to login
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
