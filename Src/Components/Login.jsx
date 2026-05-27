import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [mode, setMode]         = useState('login')
  const [sent, setSent]         = useState(false)

  const handle = async () => {
    setLoading(true)
    setError('')
    let err
    if (mode === 'login') {
      const res = await supabase.auth.signInWithPassword({ email, password })
      err = res.error
    } else {
      const res = await supabase.auth.signUp({ email, password })
      err = res.error
      if (!err) setSent(true)
    }
    if (err) setError(err.message)
    setLoading(false)
  }

  const s = {
    wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0d1120,#111827)', padding: '20px' },
    box:  { width: '100%', maxWidth: '380px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '40px 32px' },
    logo: { textAlign: 'center', fontSize: '48px', marginBottom: '8px' },
    title:{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '4px' },
    sub:  { textAlign: 'center', fontSize: '11px', color: '#64748b', marginBottom: '32px', letterSpacing: '1px' },
    label:{ display: 'block', fontSize: '10px', color: '#94a3b8', letterSpacing: '1px', marginBottom: '6px', marginTop: '16px' },
    input:{ width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: 'white', fontSize: '13px', outline: 'none' },
    btn:  { width: '100%', marginTop: '24px', padding: '12px', background: '#6366f1', border: 'none', borderRadius: '8px', color: 'white', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', letterSpacing: '1px' },
    err:  { marginTop: '12px', fontSize: '11px', color: '#f87171', textAlign: 'center' },
    toggle:{ marginTop: '16px', textAlign: 'center', fontSize: '11px', color: '#64748b' },
    link: { color: '#818cf8', cursor: 'pointer', textDecoration: 'underline' },
  }

  if (sent) return (
    <div style={s.wrap}>
      <div style={s.box}>
        <div style={s.logo}>📬</div>
        <div style={s.title}>CHECK YOUR EMAIL</div>
        <div style={{...s.sub, marginBottom: 0}}>We sent a confirmation link to <strong style={{color:'white'}}>{email}</strong>. Click it to activate your account, then come back here to log in.</div>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.box}>
        <div style={s.logo}>⚾</div>
        <div style={s.title}>BULLPEN CHARTS</div>
        <div style={s.sub}>{mode === 'login' ? 'SIGN IN TO YOUR ACCOUNT' : 'CREATE AN ACCOUNT'}</div>

        <label style={s.label}>EMAIL</label>
        <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()} placeholder="coach@team.com" />

        <label style={s.label}>PASSWORD</label>
        <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()} placeholder="••••••••" />

        <button style={{...s.btn, opacity: loading ? 0.6 : 1}} onClick={handle} disabled={loading}>
          {loading ? 'LOADING...' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </button>

        {error && <div style={s.err}>{error}</div>}

        <div style={s.toggle}>
          {mode === 'login'
            ? <>No account? <span style={s.link} onClick={() => { setMode('signup'); setError('') }}>Sign up</span></>
            : <>Have an account? <span style={s.link} onClick={() => { setMode('login'); setError('') }}>Sign in</span></>
          }
        </div>
      </div>
    </div>
  )
}
