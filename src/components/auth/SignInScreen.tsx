// ---------------------------------------------------------------------------
// SignInScreen
//
// Full-screen auth prompt shown whenever `useAuth` reports "no signed-
// in user".
//
// Account creation is invite-only. The "Create account" tab is shown
// ONLY when `inviteProjectId` is set (the user arrived via an invite
// link). On a normal visit the tab bar is omitted entirely and the
// sign-in form is rendered directly — existing accounts (email or
// Google) sign in as usual; new visitors without an invite have no
// way to register.
//
// When `inviteProjectId` is set the invite banner explains why they
// are being asked to sign in, and both tabs (Sign in / Create
// account) are available. Activation against the project happens in
// App.tsx after auth completes; this screen just adjusts copy + tab
// visibility.
// ---------------------------------------------------------------------------

import { useState, type FormEvent } from 'react'

type Tab = 'signin' | 'signup'

interface Props {
  onSignInGoogle: () => void
  onSignInEmail: (email: string, password: string) => Promise<void>
  onSignUpEmail: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>
  onPasswordReset: (email: string) => Promise<void>
  error: string | null
  // When set, the user arrived through an invite link. We show a
  // banner so they understand why they are being asked to sign in.
  inviteProjectId: string | null
}

export function SignInScreen({
  onSignInGoogle,
  onSignInEmail,
  onSignUpEmail,
  onPasswordReset,
  error,
  inviteProjectId,
}: Props) {
  const [tab, setTab] = useState<Tab>('signin')

  // Account creation is gated behind an invite link. Without one,
  // the tab bar is suppressed and only the sign-in form is rendered.
  const showSignUp = inviteProjectId != null
  const activeTab: Tab = showSignUp ? tab : 'signin'

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        {/* Logo + wordmark */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600 text-white font-bold text-lg">
            K
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your personal board.
          </p>
        </div>

        {/* Invite banner. Rendered above the auth form when the user
            opened the app via an invite link, so they understand why
            they are being asked to sign in. */}
        {inviteProjectId && (
          <div className="mb-5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
            You've been invited to collaborate on a Kanban board. Sign
            in or create an account to accept the invitation.
          </div>
        )}

        {/* Tab switcher. Rendered only when account creation is
            enabled (i.e. the user arrived via an invite link). On a
            normal visit the form below is the only path. */}
        {showSignUp && (
          <div className="mb-5 flex items-center border-b border-slate-200">
            <TabButton active={activeTab === 'signin'} onClick={() => setTab('signin')}>
              Sign in
            </TabButton>
            <TabButton active={activeTab === 'signup'} onClick={() => setTab('signup')}>
              Create account
            </TabButton>
          </div>
        )}

        {activeTab === 'signin' ? (
          <SignInForm
            onSubmit={onSignInEmail}
            onPasswordReset={onPasswordReset}
          />
        ) : (
          <SignUpForm onSubmit={onSignUpEmail} />
        )}

        {/* Inline error from useAuth. We show it AFTER the form so
            it is visually adjacent to the action that produced it.
            Form-level validation errors render above the divider
            (inside the form components). */}
        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
          <span className="text-xs uppercase tracking-wider text-slate-400">
            or
          </span>
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
        </div>

        <button
          onClick={onSignInGoogle}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  )
}

// ---------- Tab button ----------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 border-b-2 px-2 py-2 text-sm font-medium transition ${
        active
          ? 'border-violet-600 text-slate-900'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

// ---------- Sign-in form ----------

function SignInForm({
  onSubmit,
  onPasswordReset,
}: {
  onSubmit: (email: string, password: string) => Promise<void>
  onPasswordReset: (email: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Local validation error (separate from the useAuth-level error
  // shown by the parent). Cleared on every input change.
  const [localError, setLocalError] = useState<string | null>(null)
  // "Check your email" confirmation that appears after a password
  // reset request succeeds.
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim() || !password) {
      setLocalError('Email and password are required.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(email.trim(), password)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReset() {
    setLocalError(null)
    setResetSent(false)
    if (!email.trim()) {
      setLocalError('Enter your email to receive a reset link.')
      return
    }
    try {
      await onPasswordReset(email.trim())
      setResetSent(true)
    } catch {
      // The hook's `recordError` already populated the parent error
      // banner; nothing more to do here.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(v) => {
          setEmail(v)
          setLocalError(null)
          setResetSent(false)
        }}
      />
      <Input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(v) => {
          setPassword(v)
          setLocalError(null)
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="text-center">
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-violet-600 hover:underline"
        >
          Forgot password?
        </button>
      </div>
      {localError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {localError}
        </div>
      )}
      {resetSent && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Check your email for a password reset link.
        </div>
      )}
    </form>
  )
}

// ---------- Sign-up form ----------

function SignUpForm({
  onSubmit,
}: {
  onSubmit: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim() || !password) {
      setLocalError('Email and password are required.')
      return
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(email.trim(), password, displayName.trim())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="text"
        autoComplete="name"
        placeholder="Display name (optional)"
        value={displayName}
        onChange={setDisplayName}
      />
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(v) => {
          setEmail(v)
          setLocalError(null)
        }}
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Password (min 8 characters)"
        value={password}
        onChange={(v) => {
          setPassword(v)
          setLocalError(null)
        }}
      />
      <Input
        type="password"
        autoComplete="new-password"
        placeholder="Confirm password"
        value={confirm}
        onChange={(v) => {
          setConfirm(v)
          setLocalError(null)
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
      >
        {submitting ? 'Creating account…' : 'Create account'}
      </button>
      {localError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {localError}
        </div>
      )}
    </form>
  )
}

// ---------- Shared input ----------

function Input({
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
}: {
  type: 'text' | 'email' | 'password'
  placeholder: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
}) {
  return (
    <input
      type={type}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
    />
  )
}

// ---------- Google brand mark ----------

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.46 1.18 4.96l3.67-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.1 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.67 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
