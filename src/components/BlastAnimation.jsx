import { useRef, useEffect } from 'react'

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#a855f7', '#ec4899', '#14b8a6',
  '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6',
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function rand(min, max) { return min + Math.random() * (max - min) }

export default function BlastAnimation({ names, onComplete }) {
  const canvasRef  = useRef(null)
  const shakeRef   = useRef(0)   // screen-shake magnitude

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const W = (canvas.width  = window.innerWidth)
    const H = (canvas.height = window.innerHeight)

    // ── Approximate grid geometry ──────────────────────────────────────────
    // Match App layout: padding 12px, header+input ≈ 80px, bottom padding 10px
    const PAD    = 12
    const TOP    = 80
    const COLS   = 5
    const ROWS   = 20
    const cellW  = (W - PAD * 2) / COLS
    const cellH  = (H - TOP - 10) / ROWS

    // ── Build letter particles from every name ─────────────────────────────
    const particles = []

    names.forEach((name, nameIdx) => {
      const col   = Math.floor(nameIdx / ROWS)
      const row   = nameIdx % ROWS
      const cellX = PAD + col * cellW + cellW / 2
      const cellY = TOP + row * cellH + cellH / 2
      const chars = name.split('')
      const fontSize = Math.max(9, Math.min(16, cellH * 0.55))

      chars.forEach((char, ci) => {
        const offsetX = (ci - chars.length / 2) * fontSize * 0.65
        const blastStr = rand(12, 28)        // explosion strength
        const angle    = rand(0, Math.PI * 2) // random direction
        // Bias upward slightly (ya ≈ -|up| + small_random)
        const vy0 = -rand(4, 18)

        particles.push({
          char,
          x:   cellX + offsetX,
          y:   cellY,
          vx:  Math.cos(angle) * blastStr * rand(0.5, 1),
          vy:  vy0,
          gravity:      rand(0.55, 1.0),
          friction:     rand(0.92, 0.98),
          rotation:     rand(-Math.PI, Math.PI),
          rotVel:       rand(-0.35, 0.35),
          color:        pick(COLORS),
          fontSize,
          opacity:      1,
          scaleX:       1,
          scaleY:       1,
          squishTimer:  0,
          grounded:     false,
          groundY:      H - rand(10, 80),   // random landing height
          bounceCount:  0,
          maxBounces:   Math.floor(rand(1, 4)),
        })
      })
    })

    // ── Debris sparks (small colored dots) ────────────────────────────────
    const sparks = Array.from({ length: 120 }, () => ({
      x:   rand(PAD, W - PAD),
      y:   rand(TOP, H * 0.7),
      vx:  rand(-15, 15),
      vy:  rand(-20, -5),
      gravity: rand(0.4, 0.9),
      r:   rand(2, 5),
      color: pick(COLORS),
      opacity: 1,
    }))

    // ── Shockwave rings ────────────────────────────────────────────────────
    const rings = Array.from({ length: 3 }, (_, i) => ({
      x:   W / 2 + rand(-100, 100),
      y:   H / 2 + rand(-80, 80),
      r:   0,
      maxR: rand(200, 400),
      speed: rand(8, 15),
      opacity: 0.8,
      delay: i * 8,   // stagger by frames
    }))

    let frame    = 0
    let flashAlpha = 1.0      // initial white flash
    let animId

    function animate() {
      frame++
      ctx.clearRect(0, 0, W, H)

      // ── Background ──────────────────────────────────────────────────────
      ctx.fillStyle = '#0d0d0f'
      ctx.fillRect(0, 0, W, H)

      // ── Initial explosion flash ──────────────────────────────────────────
      if (flashAlpha > 0) {
        ctx.fillStyle = `rgba(255, 160, 30, ${flashAlpha})`
        ctx.fillRect(0, 0, W, H)
        flashAlpha = Math.max(0, flashAlpha - 0.06)
      }

      // ── Screen shake (first 30 frames) ──────────────────────────────────
      const shake = frame < 30 ? rand(-6, 6) * Math.max(0, 1 - frame / 30) : 0
      if (shake) ctx.translate(shake, shake * 0.5)

      // ── Shockwave rings ──────────────────────────────────────────────────
      rings.forEach((ring) => {
        if (frame < ring.delay) return
        ring.r += ring.speed
        ring.opacity -= 0.015
        if (ring.opacity <= 0 || ring.r > ring.maxR) return

        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 120, 20, ${ring.opacity})`
        ctx.lineWidth = 3
        ctx.stroke()
      })

      // ── Sparks ────────────────────────────────────────────────────────────
      sparks.forEach((s) => {
        if (s.opacity <= 0) return
        s.vx *= 0.96
        s.vy += s.gravity
        s.x  += s.vx
        s.y  += s.vy
        s.opacity -= 0.018

        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.globalAlpha = Math.max(0, s.opacity)
        ctx.fill()
        ctx.globalAlpha = 1
      })

      // ── Letter particles ──────────────────────────────────────────────────
      let anyVisible = false

      particles.forEach((p) => {
        if (p.opacity <= 0) return
        anyVisible = true

        if (!p.grounded) {
          p.vx    *= p.friction
          p.vy    += p.gravity
          p.x     += p.vx
          p.y     += p.vy
          p.rotation += p.rotVel

          if (p.y >= p.groundY) {
            p.y  = p.groundY
            p.vy = -p.vy * 0.28              // bounce with energy loss
            p.vx *= 0.55
            p.rotVel *= 0.4
            p.bounceCount++

            // Squish on impact
            p.scaleX = 1.6
            p.scaleY = 0.35
            p.squishTimer = 6                // frames to un-squish

            if (Math.abs(p.vy) < 1.2 || p.bounceCount >= p.maxBounces) {
              p.grounded  = true
              p.vy        = 0
              p.vx        = 0
              p.rotVel    = 0
            }
          }
        } else {
          // Slowly fade out once settled
          p.opacity -= 0.007
        }

        // Un-squish over a few frames
        if (p.squishTimer > 0) {
          p.squishTimer--
          const t = 1 - p.squishTimer / 6
          p.scaleX = 1.6 - t * 0.6
          p.scaleY = 0.35 + t * 0.65
        }

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.scale(p.scaleX, p.scaleY)
        ctx.globalAlpha = Math.max(0, p.opacity)
        ctx.fillStyle   = p.color
        ctx.font        = `bold ${p.fontSize}px Inter, sans-serif`
        ctx.textAlign   = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.char, 0, 0)
        ctx.restore()
      })

      ctx.globalAlpha = 1

      // ── Continue until all particles faded or 5 s elapsed ────────────────
      if (anyVisible && frame < 300) {
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
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  )
}
