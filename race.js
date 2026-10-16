// Race mode: a circuit appears behind the Mac (which fades back), and you race an AI car for LAPS laps.
// There's also a parking lot in the infield: park squarely in the highlighted bay to score it.
// Plugs into drive.js as a scene, so the car, controls and joystick are the same as free-drive mode.
//   Start: the 🏁 button in the menu bar, or `race` in the Terminal. Esc exits.
(function () {
	if (!window.driveMode) return
	const drive = window.driveMode
	const LAPS = 2
	const AI_TOP = 385 // px/s (the player's top speed is 430)
	const AI_LATERAL = 720 // how hard the AI can corner (px/s²); lower = more braking for bends
	const AI_ACCEL = 620
	const AI_BRAKE = 950
	const OFF_TRACK_GRIP = 0.5
	const PARK_HOLD_MS = 900
	const PARK_ANGLE = 18 * Math.PI / 180

	// Circuit shape (fractions of the play area): a long left straight (start/finish), a chicane
	// at the top, an S on the right, and a twisty run back along the bottom.
	const SHAPE = [
		[0.06, 0.52], [0.08, 0.2], [0.25, 0.05], [0.44, 0.12], [0.55, 0.3], [0.68, 0.1], [0.9, 0.07],
		[0.97, 0.35], [0.84, 0.55], [0.96, 0.8], [0.82, 0.96], [0.6, 0.85], [0.45, 0.96], [0.25, 0.93], [0.11, 0.8],
	]
	const SAMPLES = 26 // per segment

	const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
	const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
	const fmt = s => (s == null ? '--' : s.toFixed(1) + ' s')

	let on = false
	let canvas, ctx, bg, bgctx, ui, hudEl, bannerEl, panelEl, aiEl
	let W = 0, H = 0, dpr = 1
	let track = [] // { x, y, tx, ty, nx, ny, k }
	let N = 0
	let half = 30 // half-width of the asphalt
	let lot = null // parking lot { bays: [{ x, y, w, h }] }
	let phase = 'countdown' // countdown | racing | done | parking
	let countdownAt = 0
	let raceStart = 0
	let lastHud = 0
	const player = { idx: 0, lap: 0, checkpoint: true, finished: null }
	const ai = { x: 0, y: 0, angle: 0, speed: 0, idx: 0, lap: 0, checkpoint: true, finished: null }
	let bay = 0
	let parkSince = 0
	let parks = 0

	// ---------- track geometry ----------

	function buildTrack() {
		W = innerWidth
		H = innerHeight
		dpr = Math.min(window.devicePixelRatio || 1, 2)
		const small = Math.min(W, H) < 600
		half = clamp(Math.min(W, H) * 0.042, small ? 22 : 26, 40)
		const pad = half + 16
		const top = pad + 44 // room for the HUD
		const area = { x: pad, y: top, w: W - pad * 2, h: H - top - pad }
		const p = SHAPE.map(([u, v]) => [area.x + u * area.w, area.y + v * area.h])

		// Closed Catmull-Rom spline
		track = []
		const n = p.length
		for (let i = 0; i < n; i++) {
			const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n]
			for (let k = 0; k < SAMPLES; k++) {
				const s = k / SAMPLES, s2 = s * s, s3 = s2 * s
				track.push({
					x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
					y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3),
				})
			}
		}
		N = track.length
		for (let i = 0; i < N; i++) {
			const a = track[(i - 1 + N) % N], b = track[(i + 1) % N], t = track[i]
			const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
			t.tx = dx / len; t.ty = dy / len; t.nx = -t.ty; t.ny = t.tx
			t.step = len / 2
		}
		for (let i = 0; i < N; i++) {
			const a = track[(i - 3 + N) % N], b = track[(i + 3) % N]
			const turn = Math.abs(wrap(Math.atan2(b.ty, b.tx) - Math.atan2(a.ty, a.tx)))
			let dist = 0
			for (let j = -3; j < 3; j++) dist += track[(i + j + N) % N].step * 2
			track[i].k = turn / Math.max(1, dist) // curvature (1/px)
		}

		// Parking lot in the infield
		const bw = clamp(half * 1.55, 38, 54)
		const bh = clamp(half * 2.3, 56, 80)
		const count = small ? 3 : 4
		const cx = area.x + area.w * 0.46
		const cy = area.y + area.h * 0.53
		lot = {
			x: cx - (bw * count) / 2 - 12, y: cy - bh / 2 - 26, w: bw * count + 24, h: bh + 40,
			bays: Array.from({ length: count }, (_, i) => ({ x: cx - (bw * count) / 2 + i * bw, y: cy - bh / 2 + 6, w: bw, h: bh })),
		}
		bay = Math.min(bay, count - 1)
		drawStatic()
	}

	function nearest(x, y, hint) {
		let best = 0, bestD = Infinity
		const scan = (from, to) => {
			for (let j = from; j <= to; j++) {
				const i = (j + N) % N
				const d = (track[i].x - x) ** 2 + (track[i].y - y) ** 2
				if (d < bestD) { bestD = d; best = i }
			}
		}
		if (hint == null) scan(0, N - 1)
		else scan(hint - 30, hint + 30)
		return { idx: best, dist: Math.sqrt(bestD) }
	}

	// ---------- drawing ----------

	function drawStatic() {
		bg = bg || document.createElement('canvas')
		bg.width = W * dpr
		bg.height = H * dpr
		bgctx = bg.getContext('2d')
		const c = bgctx
		c.setTransform(dpr, 0, 0, dpr, 0, 0)
		c.clearRect(0, 0, W, H)

		// Night-time infield: very dark, with a faint grain of grass
		c.fillStyle = 'rgba(6, 14, 18, 0.55)'
		c.fillRect(0, 0, W, H)

		const loop = (offset) => {
			c.beginPath()
			track.forEach((t, i) => {
				const x = t.x + t.nx * offset, y = t.y + t.ny * offset
				i ? c.lineTo(x, y) : c.moveTo(x, y)
			})
			c.closePath()
		}

		// Run-off glow, asphalt
		c.lineJoin = 'round'
		loop(0)
		c.strokeStyle = 'rgba(80, 160, 255, 0.08)'
		c.lineWidth = half * 2 + 28
		c.stroke()
		c.strokeStyle = '#23262d'
		c.lineWidth = half * 2
		c.stroke()
		c.strokeStyle = 'rgba(255, 255, 255, 0.05)'
		c.lineWidth = half * 2 - 6
		c.stroke()

		// Edge lines, with red/white kerbs on the tighter corners
		for (const side of [-1, 1]) {
			loop(side * (half - 2))
			c.strokeStyle = 'rgba(255, 255, 255, 0.65)'
			c.lineWidth = 2
			c.stroke()
			for (let i = 0; i < N; i += 2) {
				const t = track[i]
				if (t.k < 0.0045) continue
				const u = track[(i + 2) % N]
				c.beginPath()
				c.moveTo(t.x + t.nx * side * (half - 3), t.y + t.ny * side * (half - 3))
				c.lineTo(u.x + u.nx * side * (half - 3), u.y + u.ny * side * (half - 3))
				c.strokeStyle = (i / 2) % 2 ? '#e8e8e8' : '#d7263d'
				c.lineWidth = 6
				c.stroke()
			}
		}

		// Centre dashes
		loop(0)
		c.setLineDash([14, 18])
		c.strokeStyle = 'rgba(255, 255, 255, 0.28)'
		c.lineWidth = 2
		c.stroke()
		c.setLineDash([])

		// Start / finish line (checkered) at index 0, and two grid boxes behind it
		const s = track[0]
		const sq = 6
		const cells = Math.floor((half * 2) / sq)
		for (let row = 0; row < 2; row++) {
			for (let i = 0; i < cells; i++) {
				const o = -half + i * sq
				const x = s.x + s.nx * o + s.tx * row * sq
				const y = s.y + s.ny * o + s.ty * row * sq
				c.save()
				c.translate(x, y)
				c.rotate(Math.atan2(s.ty, s.tx))
				c.fillStyle = (i + row) % 2 ? '#111' : '#f5f5f5'
				c.fillRect(0, 0, sq, sq)
				c.restore()
			}
		}
		for (const [o, back] of [[0.5, 16], [-0.5, 16]]) {
			const g = track[(N - back) % N]
			c.save()
			c.translate(g.x + g.nx * o * half, g.y + g.ny * o * half)
			c.rotate(Math.atan2(g.ty, g.tx))
			c.strokeStyle = 'rgba(255, 255, 255, 0.5)'
			c.lineWidth = 1.5
			c.strokeRect(-22, -15, 44, 30)
			c.restore()
		}

		// Parking lot
		c.fillStyle = '#1d2027'
		roundRect(c, lot.x, lot.y, lot.w, lot.h, 10)
		c.fill()
		c.strokeStyle = 'rgba(255, 255, 255, 0.15)'
		c.lineWidth = 1
		c.stroke()
		c.fillStyle = 'rgba(255, 255, 255, 0.55)'
		c.font = '700 13px -apple-system, "Segoe UI", system-ui, sans-serif'
		c.fillText('🅿 PARKING', lot.x + 10, lot.y + 16)
		c.strokeStyle = 'rgba(255, 255, 255, 0.75)'
		c.lineWidth = 2
		for (const b of lot.bays) {
			c.beginPath()
			c.moveTo(b.x, b.y + b.h)
			c.lineTo(b.x, b.y)
			c.lineTo(b.x + b.w, b.y)
			c.lineTo(b.x + b.w, b.y + b.h)
			c.stroke()
		}
	}

	function roundRect(c, x, y, w, h, r) {
		c.beginPath()
		c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h)
	}

	function drawFrame(now) {
		ctx.setTransform(1, 0, 0, 1, 0, 0)
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.drawImage(bg, 0, 0)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

		// Target bay: pulsing highlight; fills green while you hold the park
		const b = lot.bays[bay]
		const pulse = 0.35 + 0.25 * Math.sin(now / 250)
		ctx.fillStyle = `rgba(255, 211, 61, ${pulse * 0.35})`
		ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6)
		if (parkSince) {
			const p = clamp((now - parkSince) / PARK_HOLD_MS, 0, 1)
			ctx.fillStyle = 'rgba(46, 200, 90, 0.45)'
			ctx.fillRect(b.x + 3, b.y + 3 + (b.h - 6) * (1 - p), b.w - 6, (b.h - 6) * p)
		}
	}

	// ---------- race logic ----------

	function trackProgress(who, x, y) {
		const prev = who.idx
		const { idx, dist } = nearest(x, y, prev)
		who.idx = idx
		// Crossing the start/finish line forwards counts a lap, but only after passing the far side
		if (prev > N * 0.75 && idx < N * 0.25) {
			if (who.checkpoint) { who.lap++; who.checkpoint = false }
		} else if (prev < N * 0.25 && idx > N * 0.75) {
			// Reversed back over the line: undo it
			if (who.lap > 0) { who.lap--; who.checkpoint = true }
		}
		if (idx > N * 0.45 && idx < N * 0.55) who.checkpoint = true
		return dist
	}

	const progressOf = who => who.lap * N + (who.idx > N * 0.75 && who.lap === 0 ? who.idx - N : who.idx)

	function driveAI(dt) {
		if (phase !== 'racing' && phase !== 'done') return
		if (ai.finished != null) {
			// Cool-down: roll to a stop after finishing
			ai.speed = Math.max(0, ai.speed - AI_BRAKE * 0.4 * dt)
		} else {
			// Look ahead along the track; brake for the tightest bend coming up
			let kMax = 0
			for (let j = 2; j < 34; j++) kMax = Math.max(kMax, track[(ai.idx + j) % N].k)
			const corner = Math.sqrt(AI_LATERAL / Math.max(kMax, 1e-5))
			const want = Math.min(AI_TOP, corner)
			ai.speed += clamp(want - ai.speed, -AI_BRAKE * dt, AI_ACCEL * dt)
		}
		const look = track[(ai.idx + 6 + Math.round(ai.speed / 70)) % N]
		const desired = Math.atan2(look.y - ai.y, look.x - ai.x)
		const turnRate = 3.6 * Math.min(1, ai.speed / 140)
		ai.angle += clamp(wrap(desired - ai.angle), -turnRate * dt, turnRate * dt)
		ai.x += Math.cos(ai.angle) * ai.speed * dt
		ai.y += Math.sin(ai.angle) * ai.speed * dt
	}

	function collide(car) {
		const dx = car.x - ai.x, dy = car.y - ai.y
		const d = Math.hypot(dx, dy)
		const MIN = 24
		if (d > 0 && d < MIN) {
			const push = (MIN - d) / 2
			car.x += (dx / d) * push
			car.y += (dy / d) * push
			ai.x -= (dx / d) * push
			ai.y -= (dy / d) * push
			car.speed *= 0.8
			ai.speed *= 0.8
		}
	}

	function checkParking(car, now) {
		const b = lot.bays[bay]
		const inside = car.x > b.x + 4 && car.x < b.x + b.w - 4 && car.y > b.y + 10 && car.y < b.y + b.h - 6
		const angErr = Math.min(Math.abs(wrap(car.angle - Math.PI / 2)), Math.abs(wrap(car.angle + Math.PI / 2)))
		const parked = inside && Math.abs(car.speed) < 14 && angErr < PARK_ANGLE
		if (!parked) { parkSince = 0; return }
		if (!parkSince) parkSince = now
		if (now - parkSince < PARK_HOLD_MS) return
		parkSince = 0
		parks++
		const off = Math.hypot(car.x - (b.x + b.w / 2), car.y - (b.y + b.h / 2)) / (b.w / 2)
		const precision = Math.round(100 * clamp(1 - 0.5 * off - 0.5 * angErr / PARK_ANGLE, 0, 1))
		drive.showToast(`🅿 Parked! <b>${precision}%</b> precision · ${parks} park${parks === 1 ? '' : 's'} so far`, 3000)
		let next = bay
		while (next === bay && lot.bays.length > 1) next = Math.floor(Math.random() * lot.bays.length)
		bay = next
	}

	function updateHud(now) {
		if (now - lastHud < 100) return
		lastHud = now
		const elapsed = phase === 'racing' || phase === 'done' ? (player.finished ?? (now - raceStart) / 1000) : 0
		const lapShown = clamp(player.lap, 1, LAPS)
		const pos = player.finished != null && (ai.finished == null || player.finished <= ai.finished) ? 1
			: ai.finished != null && player.finished == null ? 2
			: progressOf(player) >= progressOf(ai) ? 1 : 2
		hudEl.innerHTML = phase === 'parking'
			? `<span>🅿 Parking practice</span><span>Parks <b>${parks}</b></span>`
			: `<span>Lap <b>${lapShown}/${LAPS}</b></span><span><b>${elapsed.toFixed(1)}</b> s</span><span class="pos p${pos}">P${pos}</span><span>Best <b>${fmt(best())}</b></span><span>🅿 ${parks}</span>`
	}

	function best() {
		try { const v = parseFloat(localStorage.getItem('raceBest')); return Number.isFinite(v) ? v : null } catch (e) { return null }
	}

	function finish(now) {
		phase = 'done'
		const t = player.finished
		const won = ai.finished == null || t <= ai.finished
		const prev = best()
		const record = prev == null || t < prev
		if (record) try { localStorage.setItem('raceBest', t.toFixed(2)) } catch (e) {}
		panelEl.innerHTML = `
			<h2>${won ? '🏆 You win!' : '🤖 The AI wins'}</h2>
			<p>Your time <b>${fmt(t)}</b> · AI ${ai.finished != null ? fmt(ai.finished) : 'still racing'}</p>
			<p>${record ? '⭐ New personal best!' : `Personal best ${fmt(prev)}`}</p>
			<div class="race-actions">
				<button type="button" class="race-ui" data-race="again">Race again</button>
				<button type="button" class="race-ui" data-race="park">Parking practice</button>
				<button type="button" class="race-ui" data-race="exit">Exit</button>
			</div>
			<p class="race-hint">Tip: you can also click these by parking the car on them.</p>`
		panelEl.hidden = false
	}

	// ---------- the scene drive.js runs each frame ----------

	const scene = {
		get locked() { return phase === 'countdown' },
		grip(x, y) {
			if (lot && x > lot.x && x < lot.x + lot.w && y > lot.y && y < lot.y + lot.h) return 0.55 // car park: slow
			const { dist } = nearest(x, y, player.idx)
			return dist > half ? OFF_TRACK_GRIP : 1
		},
		allowClick: el => !!el.closest('.race-ui'),
		frame(dt, now, car) {
			if (!on) return
			if (phase === 'countdown') {
				const left = 3 - Math.floor((now - countdownAt) / 800)
				bannerEl.textContent = left > 0 ? String(left) : 'GO!'
				bannerEl.className = 'race-banner ' + (left > 0 ? 'count' : 'go')
				if (left <= 0) {
					phase = 'racing'
					raceStart = now
					setTimeout(() => { if (phase !== 'countdown') bannerEl.className = 'race-banner hide' }, 700)
				}
			}
			if (phase !== 'parking') {
				trackProgress(player, car.x, car.y)
				driveAI(dt)
				trackProgress(ai, ai.x, ai.y)
				collide(car)
				const t = (now - raceStart) / 1000
				if (phase === 'racing' || phase === 'done') {
					if (ai.finished == null && ai.lap > LAPS) {
						ai.finished = t
						if (player.finished == null) drive.showToast(`🤖 The AI finished in <b>${fmt(t)}</b>. Keep going!`, 3500)
					}
					if (player.finished == null && player.lap > LAPS) {
						player.finished = t
						finish(now)
					}
				}
				aiEl.style.transform = `translate(${ai.x - 13}px, ${ai.y - 22}px) rotate(${ai.angle + Math.PI / 2}rad)`
			}
			checkParking(car, now)
			drawFrame(now)
			updateHud(now)
		},
		exit() { teardown() },
	}

	// ---------- lifecycle ----------

	function build() {
		canvas = document.createElement('canvas')
		canvas.className = 'race-canvas'
		canvas.setAttribute('aria-hidden', 'true')
		ctx = canvas.getContext('2d')
		document.getElementById('hero').appendChild(canvas)

		ui = document.createElement('div')
		ui.className = 'race-ui-layer'
		ui.innerHTML = `
			<div class="race-hud" role="status" aria-live="off"></div>
			<div class="race-controls">
				<button type="button" class="race-ui" data-race="again" title="Restart the race">↻ Restart</button>
				<button type="button" class="race-ui" data-race="exit" title="Exit (Esc)">✕ Exit</button>
			</div>
			<div class="race-banner hide" aria-live="assertive"></div>
			<div class="race-panel" role="dialog" aria-label="Race result" hidden></div>`
		document.body.appendChild(ui)
		hudEl = ui.querySelector('.race-hud')
		bannerEl = ui.querySelector('.race-banner')
		panelEl = ui.querySelector('.race-panel')
		ui.addEventListener('click', e => {
			const b = e.target.closest('[data-race]')
			if (!b) return
			const action = b.dataset.race
			if (action === 'again') reset('race')
			else if (action === 'park') reset('parking')
			else drive.stop()
		})

		drive.layer.insertAdjacentHTML('beforeend', drive.carSvg('race-ai', '#1f6feb', '#58a6ff'))
		aiEl = drive.layer.querySelector('.race-ai')
		window.addEventListener('resize', onResize)
	}

	function sizeCanvas() {
		canvas.width = W * dpr
		canvas.height = H * dpr
		canvas.style.width = W + 'px'
		canvas.style.height = H + 'px'
	}

	function onResize() {
		if (!on) return
		buildTrack()
		sizeCanvas()
		reset(phase === 'parking' ? 'parking' : 'race')
	}

	function gridSpot(offset) {
		const g = track[(N - 16) % N]
		return { x: g.x + g.nx * offset * half, y: g.y + g.ny * offset * half, angle: Math.atan2(g.ty, g.tx) }
	}

	function reset(mode) {
		panelEl.hidden = true
		parkSince = 0
		Object.assign(player, { idx: N - 16, lap: 0, checkpoint: true, finished: null })
		const a = gridSpot(-0.5)
		Object.assign(ai, a, { speed: 0, idx: N - 16, lap: 0, checkpoint: true, finished: null })
		if (mode === 'parking') {
			phase = 'parking'
			aiEl.style.display = 'none'
			bannerEl.className = 'race-banner hide'
			const b = lot.bays[bay]
			drive.place({ x: b.x + b.w / 2, y: lot.y + lot.h + half * 1.6, angle: -Math.PI / 2 })
			drive.showToast('🅿 Park in the <b>glowing bay</b>: stop inside it, lined up, for a moment', 4000)
		} else {
			phase = 'countdown'
			countdownAt = performance.now()
			aiEl.style.display = ''
			drive.place(gridSpot(0.5))
			drive.showToast(`🏁 ${LAPS} laps against the AI · stay on the asphalt · <b>Esc</b> to exit`, 4000)
		}
		lastHud = 0
	}

	function start() {
		if (on) return
		on = true
		if (!canvas) build()
		document.documentElement.classList.add('racing')
		window.scrollTo(0, 0)
		ui.hidden = false
		canvas.hidden = false
		buildTrack()
		sizeCanvas()
		drive.setScene(scene)
		drive.start(gridSpot(0.5))
		reset('race')
		syncButton()
	}

	function teardown() {
		on = false
		document.documentElement.classList.remove('racing')
		if (ui) ui.hidden = true
		if (canvas) canvas.hidden = true
		if (aiEl) aiEl.style.display = 'none'
		syncButton()
	}

	function syncButton() {
		const b = document.getElementById('race-toggle')
		if (b) b.setAttribute('aria-pressed', on)
	}

	const button = document.getElementById('race-toggle')
	if (button) button.addEventListener('click', () => (on ? drive.stop() : start()))

	window.raceMode = { start, stop: () => drive.stop(), get active() { return on } }
})()
