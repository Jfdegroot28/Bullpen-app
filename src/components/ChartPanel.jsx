import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const CW = 420, CH = 480
const ZL = 110, ZT = 90, ZR = 310, ZB = 350
const ZW = ZR - ZL, ZH = ZB - ZT

const CATS = {
  executed:    { label: 'Executed',         short: 'EX', rgb: [34, 197, 94]  },
  competitive: { label: 'Competitive Miss', short: 'CM', rgb: [250, 204, 21] },
  notComp:     { label: 'Not Competitive',  short: 'NC', rgb: [239, 68, 68]  },
}

function kernel(x, y, px, py, bw) {
  const dx = (x - px) / bw, dy = (y - py) / bw
  return Math.exp(-0.5 * (dx * dx + dy * dy))
}

function drawCanvas(canvas, pitches, filter, showDots, line1, line2) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, CW, CH)
  const bg = ctx.createRadialGradient(CW/2, CH/2, 0, CW/2, CH/2, CW)
  bg.addColorStop(0, '#1a2a5e'); bg.addColorStop(1, '#0f1a3d')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH)
  ctx.fillStyle = 'rgba(255,255,255,0.015)'
  for (let i = 0; i < 200; i++) {
    ctx.beginPath(); ctx.arc((i*37)%CW, (i*53)%CH, 1, 0, Math.PI*2); ctx.fill()
  }
  const visible = filter === 'All' ? pitches : pitches.filter(p => p.pitch_type === filter)
  if (visible.length > 0) {
    const imgData = ctx.createImageData(CW, CH)
    for (let px = 0; px < CW; px++) {
      for (let py = 0; py < CH; py++) {
        let total = 0, r = 0, g = 0, b = 0
        Object.entries(CATS).forEach(([key, val]) => {
          let d = 0
          visible.filter(p => p.quality === key).forEach(p => { d += kernel(px, py, p.x, p.y, 38) })
          r += val.rgb[0]*d; g += val.rgb[1]*d; b += val.rgb[2]*d; total += d
        })
        if (total > 0.004) {
          const alpha = Math.min(total*220, 200), idx = (py*CW+px)*4
          imgData.data[idx]   = Math.round(r/total)
          imgData.data[idx+1] = Math.round(g/total)
          imgData.data[idx+2] = Math.round(b/total)
          imgData.data[idx+3] = Math.round(alpha)
        }
      }
    }
    ctx.putImageData(imgData, 0, 0)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5
  ctx.strokeRect(ZL, ZT, ZW, ZH)
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(ZL+(ZW/3)*i, ZT); ctx.lineTo(ZL+(ZW/3)*i, ZB); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ZL, ZT+(ZH/3)*i); ctx.lineTo(ZR, ZT+(ZH/3)*i); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([4,4])
  ctx.strokeRect(ZL-25, ZT-25, ZW+50, ZH+50); ctx.setLineDash([])
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'
  ctx.fillText('RHH', ZL-40, ZT+ZH/2+4); ctx.fillText('LHH', ZR+40, ZT+ZH/2+4)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const ppx = CW/2, ppy = ZB+55, pw = 36
  ctx.beginPath()
  ctx.moveTo(ppx-pw/2, ppy-8); ctx.lineTo(ppx+pw/2, ppy-8)
  ctx.lineTo(ppx+pw/2, ppy+4); ctx.lineTo(ppx, ppy+18); ctx.lineTo(ppx-pw/2, ppy+4)
  ctx.closePath(); ctx.fill()
  if (showDots) {
    visible.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI*2)
      ctx.fillStyle = `rgba(${CATS[p.quality].rgb.join(',')},0.9)`; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = 'white'; ctx.font = 'bold 7px Courier New'; ctx.textAlign = 'center'
      ctx.fillText(p.pitch_type, p.x, p.y-8)
    })
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 13px Courier New'
  ctx.fillText(line1, CW/2, 35)
  ctx.fillStyle = 'rgba(245,166,35,0.7)'; ctx.font = '10px Courier New'
  ctx.fillText(line2, CW/2, 55)
}

export default function ChartPanel({ pitcher, onUpdatePitcher }) {
  const canvasRef = useRef(null)
  const channelRef = useRef(null)
  const notesTimer = useRef(null)

  const [sessions, setSessions]     = useState([])
  const [pitches, setPitches]       = useState([])
  const [allPitches, setAllPitches] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [selCat, setSelCat]   = useState('executed')
  const [selType, setSelType] = useState(null)
  const [filter, setFilter]   = useState('All')
  const [showDots, setShowDots] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editingSession, setEditingSession] = useState(null)
  const [editingVal, setEditingVal] = useState('')
  const [editingPitchTypes, setEditingPitchTypes] = useState(false)
  const [pitchTypesInput, setPitchTypesInput] = useState('')
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(true)

  const pitchTypes = pitcher?.pitch_types || ['FB', 'CT', 'SL', 'CH']
  const isTotal = activeSessionId === null
  const displayPitches = isTotal ? allPitches : pitches
  const activeSession = sessions.find(s => s.id === activeSessionId)

  useEffect(() => {
    if (pitcher?.pitch_types?.length > 0) setSelType(pitcher.pitch_types[0])
    else setSelType('FB')
  }, [pitcher?.id])

  useEffect(() => {
    if (!pitcher) return
    setLoading(true); setPitches([]); setAllPitches([]); setActiveSessionId(null); setNotes('')
    const load = async () => {
      const { data } = await supabase.from('sessions').select('*').eq('pitcher_id', pitcher.id).order('created_at', { ascending: true })
      setSessions(data || [])
      if (data && data.length > 0) { setActiveSessionId(data[0].id); setNotes(data[0].notes || '') }
      else setLoading(false)
    }
    load()
  }, [pitcher?.id])

  useEffect(() => {
    if (!activeSessionId) { setPitches([]); setNotes(''); return }
    const session = sessions.find(s => s.id === activeSessionId)
    setNotes(session?.notes || '')
    const load = async () => {
      setLoading(true)
      const { data } = await supabase.from('pitches').select('*').eq('session_id', activeSessionId).order('created_at', { ascending: true })
      setPitches(data || []); setLoading(false)
    }
    load()
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel('pitches-' + activeSessionId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pitches', filter: `session_id=eq.${activeSessionId}` }, payload => setPitches(prev => [...prev, payload.new]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pitches', filter: `session_id=eq.${activeSessionId}` }, payload => setPitches(prev => prev.filter(p => p.id !== payload.old.id)))
      .subscribe()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [activeSessionId])

  useEffect(() => {
    if (!pitcher || sessions.length === 0 || !isTotal) { if (isTotal) setAllPitches([]); return }
    const load = async () => {
      const ids = sessions.map(s => s.id)
      const { data } = await supabase.from('pitches').select('*').in('session_id', ids).order('created_at')
      setAllPitches(data || [])
    }
    load()
  }, [isTotal, sessions, pitcher?.id])

  useEffect(() => {
    if (!pitcher) return
    const line1 = `${pitcher.name.toUpperCase()} — ${pitcher.hand}`
    const line2 = `${isTotal ? 'ALL SESSIONS' : (activeSession?.name?.toUpperCase() ?? '')} · ${filter === 'All' ? 'ALL PITCHES' : filter} · ${displayPitches.length} PITCHES`
    drawCanvas(canvasRef.current, displayPitches, filter, showDots, line1, line2)
  }, [displayPitches, filter, showDots, pitcher, activeSessionId, sessions, isTotal])

  const handleNotesChange = (val) => {
    setNotes(val)
    setNotesSaved(false)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      await supabase.from('sessions').update({ notes: val }).eq('id', activeSessionId)
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, notes: val } : s))
      setNotesSaved(true)
    }, 1000)
  }

  const handleCanvasClick = async (e) => {
    if (isTotal || !activeSessionId || !selType) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (CW / rect.width)
    const y = (e.clientY - rect.top) * (CH / rect.height)
    const optimistic = { id: 'tmp-' + Date.now(), session_id: activeSessionId, x, y, pitch_type: selType, quality: selCat }
    setPitches(prev => [...prev, optimistic])
    const { data, error } = await supabase.from('pitches').insert({ session_id: activeSessionId, x, y, pitch_type: selType, quality: selCat }).select().single()
    if (error) { setPitches(prev => prev.filter(p => p.id !== optimistic.id)); return }
    setPitches(prev => prev.map(p => p.id === optimistic.id ? data : p))
  }

  const undo = async () => {
    if (isTotal || pitches.length === 0) return
    const last = [...pitches].at(-1)
    if (!last) return
    setPitches(prev => prev.filter(p => p.id !== last.id))
    await supabase.from('pitches').delete().eq('id', last.id)
  }

  const clearSession = async () => {
    if (isTotal || !activeSessionId) return
    if (!confirm('Clear all pitches from this session?')) return
    setPitches([])
    await supabase.from('pitches').delete().eq('session_id', activeSessionId)
  }

  const addSession = async () => {
    const { data, error } = await supabase.from('sessions').insert({ pitcher_id: pitcher.id, name: `Session ${sessions.length + 1}`, session_date: new Date().toISOString().split('T')[0], notes: '' }).select().single()
    if (error) { console.error(error); return }
    setSessions(prev => [...prev, data]); setActiveSessionId(data.id)
  }

  const deleteSession = async (id) => {
    if (!confirm('Delete this session and all its pitches?')) return
    await supabase.from('sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id)
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : null)
    }
  }

  const renameSession = async (id, name) => {
    if (!name.trim()) return
    await supabase.from('sessions').update({ name: name.trim() }).eq('id', id)
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: name.trim() } : s))
  }

  const savePitchTypes = async () => {
    const types = pitchTypesInput.split(',').map(t => t.trim().toUpperCase()).filter(t => t.length > 0)
    if (types.length === 0) return
    const { data, error } = await supabase.from('pitchers').update({ pitch_types: types }).eq('id', pitcher.id).select().single()
    if (error) { console.error(error); return }
    onUpdatePitcher(data); setSelType(types[0]); setEditingPitchTypes(false)
  }

  const total = displayPitches.length

  if (!pitcher) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5a623', fontSize: '13px', letterSpacing: '2px' }}>
      SELECT A PITCHER FROM THE ROSTER
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '2px', margin: 0 }}>{pitcher.name}</h1>
        <div style={{ fontSize: '11px', color: '#f5a623', marginTop: '3px' }}>{pitcher.hand}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px', maxWidth: '860px' }}>
        <button onClick={() => { setActiveSessionId(null); setFilter('All') }}
          style={{ padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', border: 'none',
            background: isTotal ? 'linear-gradient(135deg,#f5a623,#e09000)' : 'rgba(245,166,35,0.12)',
            color: isTotal ? '#0f1a3d' : '#94a3b8',
            boxShadow: isTotal ? '0 0 16px rgba(245,166,35,0.4)' : 'none' }}>
          ⬡ TOTAL
        </button>
        {sessions.map(s => (
          <div key={s.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {editingSession === s.id ? (
              <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                onBlur={() => { renameSession(s.id, editingVal); setEditingSession(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { renameSession(s.id, editingVal); setEditingSession(null) } }}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #f5a623', borderRadius: '6px', color: 'white', fontSize: '11px', padding: '6px 8px', outline: 'none', width: '110px' }} />
            ) : (
              <button onClick={() => { setActiveSessionId(s.id); setFilter('All') }}
                onDoubleClick={() => { setEditingSession(s.id); setEditingVal(s.name) }}
                style={{ padding: '7px 12px', paddingRight: '26px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', border: 'none',
                  background: activeSessionId === s.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                  color: activeSessionId === s.id ? 'white' : '#64748b',
                  borderBottom: activeSessionId === s.id ? '2px solid #f5a623' : '2px solid transparent' }}>
                {s.name}
              </button>
            )}
            <button onClick={() => deleteSession(s.id)}
              style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: '10px', padding: '0 2px' }}>✕</button>
          </div>
        ))}
        <button onClick={addSession}
          style={{ padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '11px', background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(245,166,35,0.3)', color: '#f5a623' }}>
          + Session
        </button>
      </div>

      {isTotal && <div style={{ fontSize: '10px', color: '#f5a623', marginBottom: '10px', letterSpacing: '1px' }}>⬡ AGGREGATE — {sessions.length} SESSION{sessions.length !== 1 ? 'S' : ''} · READ ONLY</div>}

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div style={{ width: '160px' }}>
          <Sec label="PITCH TYPE">
            {pitchTypes.map(pt => <CBtn key={pt} active={selType===pt} onClick={() => setSelType(pt)} color="#f5a623" disabled={isTotal}>{pt}</CBtn>)}
            {!isTotal && (
              editingPitchTypes ? (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '4px' }}>Comma separated, e.g. FB, SL, CH</div>
                  <input autoFocus value={pitchTypesInput} onChange={e => setPitchTypesInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePitchTypes() }}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid #f5a623', borderRadius: '5px', color: 'white', fontSize: '11px', padding: '5px 7px', outline: 'none', boxSizing: 'border-box', marginBottom: '5px' }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={savePitchTypes} style={{ flex: 1, padding: '4px', background: '#f5a623', border: 'none', borderRadius: '4px', color: '#0f1a3d', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}>Save</button>
                    <button onClick={() => setEditingPitchTypes(false)} style={{ flex: 1, padding: '4px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: '4px', color: '#94a3b8', cursor: 'pointer', fontSize: '10px' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditingPitchTypes(true); setPitchTypesInput(pitchTypes.join(', ')) }}
                  style={{ width: '100%', marginTop: '6px', padding: '5px', background: 'transparent', border: '1px dashed rgba(245,166,35,0.3)', borderRadius: '5px', color: '#f5a623', cursor: 'pointer', fontSize: '10px' }}>
                  ✎ Edit pitch mix
                </button>
              )
            )}
          </Sec>
          <Sec label="QUALITY">{Object.entries(CATS).map(([key,val]) => <CBtn key={key} active={selCat===key} onClick={() => setSelCat(key)} color={`rgb(${val.rgb.join(',')})`} dot disabled={isTotal}>{val.label}</CBtn>)}</Sec>
          <Sec label="FILTER">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {['All',...pitchTypes].map(ft => <button key={ft} onClick={() => setFilter(ft)} style={{ padding: '4px 8px', background: filter===ft?'#f5a623':'rgba(255,255,255,0.05)', border: '1px solid '+(filter===ft?'#f5a623':'rgba(255,255,255,0.1)'), borderRadius: '4px', color: filter===ft?'#0f1a3d':'white', cursor: 'pointer', fontSize: '10px', fontWeight: filter===ft?'bold':'normal' }}>{ft}</button>)}
            </div>
          </Sec>
          <Sec label="OPTIONS">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showDots} onChange={e => setShowDots(e.target.checked)} /> Show dots
            </label>
          </Sec>
          {!isTotal && <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}><button onClick={undo} style={xbtn('#1e3a5f')}>↩ Undo</button><button onClick={clearSession} style={xbtn('#7f1d1d')}>✕ Clear</button></div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {loading ? (
            <div style={{ width: CW, height: CH, background: '#0f1a3d', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5a623', fontSize: '11px', letterSpacing: '2px' }}>LOADING...</div>
          ) : (
            <canvas ref={canvasRef} width={CW} height={CH} onClick={handleCanvasClick}
              style={{ cursor: isTotal?'default':'crosshair', borderRadius: '12px', border: isTotal?'1px solid rgba(245,166,35,0.4)':'1px solid rgba(255,255,255,0.1)', maxWidth: '100%', boxShadow: isTotal?'0 0 40px rgba(245,166,35,0.15)':'0 0 40px rgba(0,0,0,0.6)' }} />
          )}
          <div style={{ fontSize: '10px', color: '#f5a623', marginTop: '8px', letterSpacing: '1px', opacity: 0.6 }}>{isTotal ? 'AGGREGATE · READ ONLY' : 'CLICK TO PLACE PITCH · DOUBLE-CLICK TAB TO RENAME'}</div>

          {!isTotal && (
            <div style={{ marginTop: '16px', width: '100%', maxWidth: CW }}>
              <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#f5a623', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>SESSION NOTES</span>
                {!notesSaved && <span style={{ color: '#f59e0b', fontSize: '9px' }}>saving...</span>}
                {notesSaved && notes && <span style={{ color: '#22c55e', fontSize: '9px' }}>✓ saved</span>}
              </div>
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Add notes about this session — pitch feel, mechanics, counts, game plan..."
                style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: '8px', color: 'white', fontSize: '12px', padding: '10px', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Courier New, monospace', lineHeight: 1.5 }}
              />
            </div>
          )}
        </div>

        <div style={{ width: '148px' }}>
          <Sec label="SUMMARY">
            {Object.entries(CATS).map(([key,val]) => {
              const n = displayPitches.filter(p=>p.quality===key).length
              const pct = total>0?Math.round(n/total*100):0
              return (
                <div key={key} style={{ padding: '10px', marginBottom: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', borderLeft: `3px solid rgb(${val.rgb.join(',')})` }}>
                  <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '4px' }}>{val.label.toUpperCase()}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', lineHeight: 1 }}>{n}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>/ {total}</div>
                  </div>
                  <div style={{ marginTop: '5px', height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `rgb(${val.rgb.join(',')})`, borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '10px', color: `rgb(${val.rgb.join(',')})`, marginTop: '3px', fontWeight: 'bold' }}>{pct}%</div>
                </div>
              )
            })}
            <div style={{ padding: '10px', background: 'rgba(245,166,35,0.1)', borderRadius: '8px', border: '1px solid rgba(245,166,35,0.2)' }}>
              <div style={{ fontSize: '9px', color: '#f5a623' }}>TOTAL PITCHES</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{total}</div>
            </div>
          </Sec>
          {pitchTypes.filter(pt=>displayPitches.some(p=>p.pitch_type===pt)).length>0 && (
            <Sec label="BY TYPE">
              {pitchTypes.filter(pt=>displayPitches.some(p=>p.pitch_type===pt)).map(pt => {
                const pts = displayPitches.filter(p=>p.pitch_type===pt)
                const ex=pts.filter(p=>p.quality==='executed').length, cm=pts.filter(p=>p.quality==='competitive').length, nc=pts.filter(p=>p.quality==='notComp').length
                const ep=Math.round(ex/pts.length*100), cp=Math.round(cm/pts.length*100), np=Math.round(nc/pts.length*100)
                return (
                  <div key={pt} style={{ padding: '10px', marginBottom: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', borderLeft: '3px solid #f5a623' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{pt}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{pts.length}</span>
                    </div>
                    <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                      <div style={{ width: `${ep}%`, background: 'rgb(34,197,94)' }} />
                      <div style={{ width: `${cp}%`, background: 'rgb(250,204,21)' }} />
                      <div style={{ width: `${np}%`, background: 'rgb(239,68,68)' }} />
                    </div>
                    {[['EX',ex,ep,[34,197,94]],['CM',cm,cp,[250,204,21]],['NC',nc,np,[239,68,68]]].map(([lbl,cnt,pct,rgb]) => (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: `rgb(${rgb.join(',')})`, flexShrink: 0 }} />
                          <span style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '1px' }}>{lbl}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', color: `rgb(${rgb.join(',')})` }}>{cnt}</span>
                          <span style={{ fontSize: '9px', color: '#475569' }}>/ {pts.length}</span>
                          <span style={{ fontSize: '9px', color: '#64748b', minWidth: '28px', textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </Sec>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {Object.entries(CATS).map(([key,val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: `rgb(${val.rgb.join(',')})` }} />
            {val.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function Sec({ label, children }) {
  return <div style={{ marginBottom: '16px' }}><div style={{ fontSize: '9px', letterSpacing: '2px', color: '#f5a623', marginBottom: '8px' }}>{label}</div>{children}</div>
}
function CBtn({ active, onClick, color, children, dot, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%', marginBottom: '5px', padding: '7px 10px', background: active?`${color}22`:'rgba(255,255,255,0.04)', border: `1.5px solid ${active?color:'rgba(255,255,255,0.08)'}`, borderRadius: '6px', color: disabled?'#374151':'white', cursor: disabled?'default':'pointer', fontSize: '11px', textAlign: 'left', fontWeight: active?'bold':'normal', opacity: disabled?0.4:1 }}>
      {dot && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {children}
    </button>
  )
}
function xbtn(bg) {
  return { flex: 1, padding: '7px', background: bg, border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '10px' }
}
