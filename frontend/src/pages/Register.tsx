import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Server, RefreshCw, CheckCircle, Mail } from 'lucide-react'
import { register, getPublicSettings, getCaptcha } from '../lib/api'

interface RegisterProps {
  onLogin: (token: string, user: any) => void
}

export default function Register({ onLogin }: RegisterProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const navigate = useNavigate()

  // Captcha
  const [captchaEnabled, setCaptchaEnabled] = useState(false)
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaQuestion, setCaptchaQuestion] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(true)

  useEffect(() => {
    getPublicSettings().then(res => {
      setCaptchaEnabled(res.data.captcha_enabled)
      setRegistrationEnabled(res.data.registration_enabled)
      if (res.data.captcha_enabled && res.data.registration_enabled) loadCaptcha()
    }).catch(() => {})
    .finally(() => setSettingsLoading(false))
  }, [])

  const loadCaptcha = async () => {
    try {
      const res = await getCaptcha()
      setCaptchaId(res.data.captcha_id)
      setCaptchaQuestion(res.data.captcha_question)
      setCaptchaAnswer('')
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      const res = await register(
        email,
        password,
        captchaEnabled ? captchaId : undefined,
        captchaEnabled ? captchaAnswer : undefined,
      )
      if (res.data.needs_verification) {
        setNeedsVerification(true)
        setRegistered(true)
      } else if (res.data.token) {
        onLogin(res.data.token, res.data.user)
        navigate('/zones')
      } else {
        setRegistered(true)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed')
      if (captchaEnabled) loadCaptcha()
    } finally {
      setLoading(false)
    }
  }

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-gray-800">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!registrationEnabled) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-gray-800">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">DingDns</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <h2 className="text-xl font-semibold mb-3">Registration Disabled</h2>
          <p className="text-gray-500 mb-6">Public registration is currently disabled by the administrator.</p>
          <Link to="/login" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  )

  // Success: needs email verification
  if (registered) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-gray-800">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">DingDns</h1>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {needsVerification ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <Mail className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold mb-3">Check Your Email</h2>
              <p className="text-gray-500 mb-2">
                We've sent a verification link to:
              </p>
              <p className="font-medium text-gray-800 mb-6">{email}</p>
              <p className="text-sm text-gray-400 mb-6">
                Click the link in the email to activate your account. The link will expire in a few hours.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold mb-3">Account Created!</h2>
              <p className="text-gray-500 mb-6">Your account has been created successfully.</p>
            </>
          )}
          <Link to="/login" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Go to Login
          </Link>
        </div>
      </div>
    </div>
  )

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
          <h2 className="text-xl font-semibold mb-6">Create Account</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="you@example.com"
                required
              />
              <p className="text-xs text-gray-400 mt-1">This will also be your login email</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Min 8 characters"
                minLength={8}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                placeholder="Repeat password"
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
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign In
              </Link>
            </p>

            <p className="text-center text-xs text-gray-400">
              Free plan: up to 3 subdomains under dingdns.com
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}
