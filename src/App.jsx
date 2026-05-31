import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Login from './components/Login'
import ChartPanel from './components/ChartPanel'

const HANDS = ['RHP', 'LHP']

export default function App() {
  const [session, setSession]         = useState(undefined)
  const [pitchers, setPitchers]       = useState([])
  const [activePitcher, setActivePitcher] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [addingPitcher, setAddingPitcher] = useState(false)
  const [newName, setNewName]         = useState('')
  const [newHand, setNewHand]         = useState('RHP')
  const [editingId, setEditingId]     = useState(null)
  const [editingVal, setEditingVal]   = useState('')
  const [rosterLoading, setRosterLoading] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setPitchers([]); setActivePitcher(null); return }
    const load = async () => {
      setRosterLoading(true)
      const { data } = await supabase.from('pitchers').select('*').order('sort_order').order('created_at')
      setPitchers(data || [])
      if (data && data.length > 0 && !activePitcher) setActivePitcher(data[0])
      setRosterLoading(false)
    }
    load()
    const ch = supabase.channel('pitchers-roster')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pitchers' }, payload => {
        setPitchers(prev => prev.some(p => p.id === payload.new.id) ? prev : [...prev, payload.new])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pitchers' }, payload => {
        setPitchers(prev => prev.map(p => p.id === payload.new.id ? payload.new : p))
        setActivePitcher(prev => prev?.id === payload.new.id ? payload.new : prev)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pitchers' }, payload => {
        setPitchers(prev => prev.filter(p => p.id !== payload.old.id))
        setActivePitcher(prev => prev?.id === payload.old.id ? null : prev)
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [session?.user?.id])

  const addPitcher = async () => {
    if (!newName.trim()) return
    const { data, error } = await supabase.from('pitchers')
      .insert({ name: newName.trim(), hand: newHand, sort_order: pitchers.length })
      .select().single()
    if (error) { console.error(error); return }
    setPitchers(prev => [...prev, data])
    setActivePitcher(data); setShowLeaderboard(false)
    setNewName(''); setAddingPitcher(false)
  }

  const deletePitcher = async (id) => {
    if (!confirm('Delete this pitcher and all their data?')) return
    await supabase.from('pitchers').delete().eq('id', id)
  }

  const renamePitcher = async (id, name) => {
    if (!name.trim()) return
    await supabase.from('pitchers').update({ name: name.trim() }).eq('id', id)
  }

  const updatePitcher = (updated) => {
    setPitchers(prev => prev.map(p => p.id === updated.id ? updated : p))
    setActivePitcher(updated)
  }

  const signOut = () => supabase.auth.signOut()

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1a2a5e,#0f1a3d)', color: 'white', fontFamily: 'Courier New, monospace' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚾</div>
        <div style={{ fontSize: '11px', color: '#f5a623', letterSpacing: '3px' }}>LOADING...</div>
      </div>
    </div>
  )

  if (!session) return <Login />

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'linear-gradient(135deg,#1a2a5e,#0f1a3d)', fontFamily: 'Courier New, monospace', color: 'white', overflow: 'hidden' }}>
      <div style={{ width: sidebarOpen ? '210px' : '46px', flexShrink: 0, background: 'rgba(10,20,60,0.7)', borderRight: '1px solid rgba(245,166,35,0.2)', display: 'flex', flexDirection: 'column', transition: 'width 0.2s', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 10px', borderBottom: '1px solid rgba(245,166,35,0.2)', flexShrink: 0 }}>
          {sidebarOpen && <span style={{ fontSize: '9px', letterSpacing: '2px', color: '#f5a623' }}>ROSTER</span>}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', color: '#f5a623', cursor: 'pointer', fontSize: '14px', marginLeft: sidebarOpen ? 'auto' : 0, padding: 0 }}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <div style={{ padding: '8px', borderBottom: '1px solid rgba(245,166,35,0.2)', flexShrink: 0 }}>
          <button onClick={() => setShowLeaderboard(true)}
            style={{ width: '100%', padding: sidebarOpen ? '8px' : '8px 0', background: showLeaderboard ? 'rgba(245,166,35,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showLeaderboard ? '#f5a623' : 'rgba(245,166,35,0.25)'}`, borderRadius: '6px', color: '#f5a623', cursor: 'pointer', fontSize: sidebarOpen ? '11px' : '14px', fontWeight: 'bold', textAlign: 'center' }}>
            {sidebarOpen ? '🏆 Leaderboard' : '🏆'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {rosterLoading && sidebarOpen && (
            <div style={{ padding: '12px', fontSize: '10px', color: '#f5a623', textAlign: 'center' }}>LOADING...</div>
          )}
          {pitchers.map(p => (
            <div key={p.id} style={{ position: 'relative', margin: '2px 6px' }}>
              {editingId === p.id ? (
                <input autoFocus value={editingVal}
                  onChange={e => setEditingVal(e.target.value)}
                  onBlur={() => { renamePitcher(p.id, editingVal); setEditingId(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { renamePitcher(p.id, editingVal); setEditingId(null) } if (e.key === 'Escape') setEditingId(null) }}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: '1px solid #f5a623', borderRadius: '6px', color: 'white', fontSize: '11px', padding: '7px 8px', outline: 'none', boxSizing: 'border-box' }}
                />
              ) : (
                <button onClick={() => { setActivePitcher(p); setShowLeaderboard(false) }}
                  onDoubleClick={() => { setEditingId(p.id); setEditingVal(p.name) }}
                  style={{ width: '100%', padding: sidebarOpen ? '9px 28px 9px 10px' : '9px 0', background: (activePitcher?.id === p.id && !showLeaderboard) ? 'rgba(245,166,35,0.2)' : 'transparent', border: (activePitcher?.id === p.id && !showLeaderboard) ? '1px solid rgba(245,166,35,0.6)' : '1px solid transparent', borderRadius: '6px', color: (activePitcher?.id === p.id && !showLeaderboard) ? 'white' : '#94a3b8', cursor: 'pointer', textAlign: sidebarOpen ? 'left' : 'center', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sidebarOpen ? (
                    <>
                      <span style={{ display: 'block', fontWeight: activePitcher?.id === p.id ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <span style={{ fontSize: '9px', color: '#f5a623' }}>{p.hand}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: '9px' }}>{p.name.slice(0,2).toUpperCase()}</span>
                  )}
                </button>
              )}
              {sidebarOpen && (
                <button onClick={() => deletePitcher(p.id)}
                  style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: '11px', padding: '2px' }}>✕</button>
              )}
            </div>
          ))}
        </div>
        {sidebarOpen && (
          <div style={{ padding: '8px', borderTop: '1px solid rgba(245,166,35,0.2)', flexShrink: 0 }}>
            {addingPitcher ? (
              <div>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addPitcher(); if (e.key === 'Escape') setAddingPitcher(false) }}
                  placeholder="Name..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(245,166,35,0.5)', borderRadius: '5px', color: 'white', fontSize: '11px', padding: '6px 8px', outline: 'none', boxSizing: 'border-box', marginBottom: '5px' }}
                />
                <div style={{ display: 'flex', gap: '4px', marginBottom: '5px' }}>
                  {HANDS.map(h => (
                    <button key={h} onClick={() => setNewHand(h)}
                      style={{ flex: 1, padding: '4px', background: newHand === h ? 'rgba(245,166,35,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${newHand === h ? '#f5a623' : 'rgba(255,255,255,0.1)'}`, borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '10px' }}>
                      {h}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={addPitcher} style={{ flex: 1, padding: '5px', background: '#f5a623', border: 'none', borderRadius: '4px', color: '#0f1a3d', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>Add</button>
                  <button onClick={() => { setAddingPitcher(false); setNewName('') }} style={{ flex: 1, padding: '5px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingPitcher(true)}
                style={{ width: '100%', padding: '7px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(245,166,35,0.3)', borderRadius: '6px', color: '#f5a623', cursor: 'pointer', fontSize: '10px' }}>
                + Add Pitcher
              </button>
            )}
          </div>
        )}
        {sidebarOpen && (
          <div style={{ padding: '8px', borderTop: '1px solid rgba(245,166,35,0.2)', flexShrink: 0 }}>
            <div style={{ fontSize: '9px', color: '#475569', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.user.email}
            </div>
            <button onClick={signOut}
              style={{ width: '100%', padding: '6px', background: 'transparent', border: '1px solid rgba(245,166,35,0.2)', borderRadius: '5px', color: '#f5a623', cursor: 'pointer', fontSize: '10px' }}>
              Sign Out
            </button>
          </div>
        )}
      </div>
      {showLeaderboard
        ? <Leaderboard onSelectPitcher={(id) => { const p = pitchers.find(x => x.id === id); if (p) { setActivePitcher(p); setShowLeaderboard(false) } }} />
        : <ChartPanel pitcher={activePitcher} onUpdatePitcher={updatePitcher} />}
    </div>
  )
}

function Leaderboard({ onSelectPitcher }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    const load = async () => {
      const [{ data: pitchers }, { data: sessions }, { data: pitches }] = await Promise.all([
        supabase.from('pitchers').select('id,name,hand'),
        supabase.from('sessions').select('id,pitcher_id'),
        supabase.from('pitches').select('session_id,quality'),
      ])
      const s2p = {}
      ;(sessions || []).forEach(s => { s2p[s.id] = s.pitcher_id })
      const stat = {}
      ;(pitchers || []).forEach(p => { stat[p.id] = { id: p.id, name: p.name, hand: p.hand, total: 0, exec: 0 } })
      ;(pitches || []).forEach(p => {
        const pid = s2p[p.session_id]
        if (!pid || !stat[pid]) return
        stat[pid].total++
        if (p.quality === 'executed') stat[pid].exec++
      })
      const arr = Object.values(stat).map(r => ({ ...r, pct: r.total ? Math.round(r.exec / r.total * 100) : 0 }))
      arr.sort((a, b) => b.exec - a.exec || b.pct - a.pct)
      setRows(arr)
    }
    load()
  }, [])

  const medal = (i) => i === 0 ? '#f5a623' : i === 1 ? '#cbd5e1' : i === 2 ? '#b87333' : 'rgba(255,255,255,0.2)'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '6px' }}>
        <div style={{ fontSize: '30px' }}>🏆</div>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '2px', margin: '4px 0 0' }}>EXECUTED LEADERBOARD</h1>
        <div style={{ fontSize: '10px', color: '#f5a623', marginTop: '4px', letterSpacing: '1px' }}>MOST EXECUTED PITCHES · ALL PITCHERS</div>
      </div>

      <div style={{ width: '100%', maxWidth: '520px', marginTop: '18px' }}>
        {rows === null ? (
          <div style={{ textAlign: 'center', color: '#f5a623', fontSize: '11px', letterSpacing: '2px', padding: '40px' }}>LOADING...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '40px' }}>No pitchers yet.</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 6px', fontSize: '8px', letterSpacing: '1px', color: '#475569' }}>
              <span>PITCHER</span><span>EXECUTED · TOTAL · %</span>
            </div>
            {rows.map((r, i) => (
              <button key={r.id} onClick={() => onSelectPitcher(r.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '6px', background: i < 3 ? 'rgba(245,166,35,0.07)' : 'rgba(255,255,255,0.03)', border: `1px solid ${i < 3 ? 'rgba(245,166,35,0.25)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: '26px', height: '26px', flexShrink: 0, borderRadius: '50%', background: medal(i), color: '#0f1a3d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontSize: '9px', color: '#f5a623' }}>{r.hand}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '22px', fontWeight: 'bold', color: '#22c55e', lineHeight: 1 }}>{r.exec}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>{r.total} total · {r.pct}%</div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
      <div style={{ fontSize: '9px', color: '#475569', marginTop: '14px', textAlign: 'center' }}>Tap a pitcher to open their charts.</div>
    </div>
  )
}
