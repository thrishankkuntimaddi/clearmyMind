import { useRef, useEffect } from 'react'

// Monochrome palette — white/gray, matches the dark app theme
const MONO = ['#ffffff', '#e1e1e1', '#c4c4c4', '#a0a0a0', '#808080', '#606060']

function rand(min, max) { return min + Math.random() * (max - min) }
function pick(arr)       { return arr[Math.floor(Math.random() * arr.length)] }

export default function BlastAnimation({ names, onComplete }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const W = (canvas.width  = window.innerWidth)
    const H = (canvas.height = window.innerHeight)

    // ── Grid geometry (must match .app padding/header/input in App.module.css)
    // App:  padding 8px top, 10px bottom, gap 7px between sections
    // Header ≈ 30px, InputSection ≈ 42px → grid starts ≈ 8+30+7+42+7 = 94px
    const GRID_TOP    = 94
    const GRID_BOTTOM = H - 10
    const GRID_LEFT   = 12
    const GRID_RIGHT  = W - 12
    const COLS        = 5
    const ROWS        = 20
    const cellW       = (GRID_RIGHT - GRID_LEFT) / COLS
    const cellH       = (GRID_BOTTOM - GRID_TOP) / ROWS

    // ── Letter particles — each name's chars blast from their cell position ────
    const particles = []

    names.forEach((name, nameIdx) => {
      if (nameIdx >= ROWS * COLS) return   // safety cap at 100
      const col   = Math.floor(nameIdx / ROWS)
      const row   = nameIdx % ROWS
      const cellX = GRID_LEFT + col * cellW + cellW / 2
      const cellY = GRID_TOP  + row * cellH + cellH / 2
      const chars = name.split('')
      const fontSize = Math.max(9, Math.min(15, cellH * 0.52))

      chars.forEach((char, ci) => {
        const letterOffsetX = (ci - chars.length / 2) * fontSize * 0.6

        // Blast direction: mostly outward from cell center + slight upward kick
        const spreadX = (col - 2) * rand(1, 4) + rand(-6, 6)  // outer cols go wider
        const kickUp  = rand(-12, -3)                           // initial upward burst

        particles.push({
          char,
          x:        cellX + letterOffsetX,
          y:        cellY,
          vx:       spreadX,
          vy:       kickUp,
          gravity:  rand(0.5, 0.9),
          friction: rand(0.94, 0.98),
          rotation: rand(-Math.PI, Math.PI),
          rotVel:   rand(-0.25, 0.25),
          color:    pick(MONO),
          fontSize,
          opacity:  1,
          scaleX:   1,
          scaleY:   1,
          squish:   0,
          grounded: false,
          groundY:  H - rand(8, 60),
          bounces:  0,
          maxBounce: Math.floor(rand(1, 3)),
        })
      })
    })

    // ── Subtle white sparks (no rainbow) ──────────────────────────────────────
    const sparks = Array.from({ length: 60 }, () => ({
      x:  rand(GRID_LEFT, GRID_RIGHT),
      y:  rand(GRID_TOP,  GRID_BOTTOM * 0.8),
      vx: rand(-8, 8),
      vy: rand(-14, -3),
      gravity: rand(0.3, 0.7),
      r:  rand(1.5, 3.5),
      opacity: rand(0.4, 0.8),
    }))

    // ── Shockwave rings (white) ────────────────────────────────────────────────
    const rings = Array.from({ length: 2 }, (_, i) => ({
      x:   W / 2 + rand(-60, 60),
      y:   H / 2 + rand(-60, 60),
      r:   0,
      maxR: rand(250, 420),
      speed: rand(10, 18),
      opacity: 0.5,
      delay: i * 10,
    }))

    let frame     = 0
    let flashAlpha = 0.6     // brief white flash, not orange
    let animId

    function animate() {
      frame++
      ctx.clearRect(0, 0, W, H)

      // Dark background always
      ctx.fillStyle = '#0d0d0f'
      ctx.fillRect(0, 0, W, H)

      // Brief white flash (fades in 10 frames)
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`
        ctx.fillRect(0, 0, W, H)
        flashAlpha = Math.max(0, flashAlpha - 0.1)
      }

      // Screen shake (frames 1-20)
      if (frame < 20) {
        const s = (1 - frame / 20) * 5
        ctx.translate(rand(-s, s), rand(-s, s))
      }

      // Shockwave rings
      rings.forEach((ring) => {
        if (frame < ring.delay) return
        ring.r       += ring.speed
        ring.opacity -= 0.018
        if (ring.opacity <= 0 || ring.r > ring.maxR) return
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(220,220,220,${ring.opacity})`
        ctx.lineWidth   = 2
        ctx.stroke()
      })

      // Sparks
      sparks.forEach((s) => {
        if (s.opacity <= 0) return
        s.vx *= 0.96; s.vy += s.gravity
        s.x  += s.vx;  s.y  += s.vy
        s.opacity -= 0.015
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle   = `rgba(200,200,200,${Math.max(0, s.opacity)})`
        ctx.globalAlpha = 1
        ctx.fill()
      })

      // Letter particles
      let anyVisible = false

      particles.forEach((p) => {
        if (p.opacity <= 0) return
        anyVisible = true

        if (!p.grounded) {
          p.vx  *= p.friction
          p.vy  += p.gravity
          p.x   += p.vx
          p.y   += p.vy
          p.rotation += p.rotVel

          if (p.y >= p.groundY) {
            p.y      = p.groundY
            p.vy     = -p.vy * 0.22
            p.vx    *= 0.5
            p.rotVel *= 0.35
            p.bounces++
            // Impact squish
            p.scaleX = 1.7; p.scaleY = 0.3; p.squish = 8

            if (Math.abs(p.vy) < 1 || p.bounces >= p.maxBounce) {
              p.grounded = true; p.vy = 0; p.vx = 0; p.rotVel = 0
            }
          }
        } else {
          p.opacity -= 0.006   // slow fade once settled
        }

        // Un-squish
        if (p.squish > 0) {
          p.squish--
          const t = 1 - p.squish / 8
          p.scaleX = 1.7 - t * 0.7
          p.scaleY = 0.3 + t * 0.7
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.scale(p.scaleX, p.scaleY)
        ctx.globalAlpha  = Math.max(0, p.opacity)
        ctx.fillStyle    = p.color
        ctx.font         = `500 ${p.fontSize}px Inter, sans-serif`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.char, 0, 0)
        ctx.restore()
      })

      ctx.globalAlpha = 1

      // End after all particles fade OR max 320 frames (~5s)
      if (anyVisible && frame < 320) {
        animId = requestAnimationFrame(animate)
      } else {
        onComplete()
      }
    }

    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [names, onComplete])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        width: '100%', height: '100%', display: 'block',
        background: '#0d0d0f',
      }}
    />
  )
}
