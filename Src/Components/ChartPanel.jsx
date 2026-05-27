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
const PITCH_TYPES = ['FB', 'CT', 'SL', 'CH']

function kernel(x, y, px, py, bw) {
  const dx = (x - px) / bw, dy = (y - py) / bw
  return Math.exp(-0.5 * (dx * dx + dy * dy))
}

function drawCanvas(canvas, pitches, filter, showDots, line1, line2) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, CW, CH)

  const bg = ctx.createRadialGradient(CW/2, CH/2, 0, CW/2, CH/2, CW)
  bg.addColorStop(0, '#1a2035'); bg.addColorStop(1, '#0d1120')
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

  ctx.fillStyle = 'rgba(
