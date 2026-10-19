// Game mode: drive a little car around the page; park on anything clickable for a moment to click it.
//   Toggle: the 🏎 button in the menu bar, or `drive` in the Terminal. Esc exits.
//   Controls: arrow keys / WASD, or the on-screen joystick on touch screens (push the way you want to go).
//   Hold still on a target until the ring fills (DWELL_MS).
(function () {
	const DWELL_MS = 1500
	const CLICKABLE = 'button, a[href], [role="button"], [role="radio"], [role="option"], [role="menuitem"], .dock-item, .finder-item, .theme-swatch, .t-cmd, .demo-chip, summary, input[type="checkbox"], input[type="radio"], select'
	const MAX_SPEED = 430 // px/s
	const ACCEL = 700
	const BRAKE = 1100
	const FRICTION = 380
	const TURN = 3.2 // rad/s at full speed

	const coarse = window.matchMedia('(pointer: coarse)')

	let active = false
	let layer, marks, mctx, car, ring, ringArc, toast, joyBase, joyKnob
	const state = { x: 0, y: 0, angle: -Math.PI / 2, speed: 0 }
	const keys = new Set()
	let joy = null // { dx, dy } in -1..1 while the joystick is held
	let raf = 0
	let last = 0
	let target = null
	let dwellStart = 0
	let lastClicked = null // must drive off before the same element can be clicked again

	const RING_R = 30
	const RING_LEN = 2 * Math.PI * RING_R
	const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a))

	function build() {
		layer = document.createElement('div')
		layer.className = 'drive-layer'
		layer.innerHTML = `
			<canvas class="drive-marks" aria-hidden="true"></canvas>
			<svg class="drive-ring" width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
				<circle cx="38" cy="38" r="${RING_R}" class="drive-ring-track"/>
				<circle cx="38" cy="38" r="${RING_R}" class="drive-ring-fill" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${RING_LEN}"/>
			</svg>
			${carSvg('drive-car', '#d7263d', '#ff4d5e')}
			<div class="drive-joystick" aria-label="Driving joystick: drag in the direction you want to go"><span class="drive-joy-knob"></span></div>
			<div class="drive-toast" aria-live="polite"></div>`
		document.body.appendChild(layer)
		marks = layer.querySelector('.drive-marks')
		mctx = marks.getContext('2d')
		car = layer.querySelector('.drive-car')
		ring = layer.querySelector('.drive-ring')
		ringArc = layer.querySelector('.drive-ring-fill')
		toast = layer.querySelector('.drive-toast')
		joyBase = layer.querySelector('.drive-joystick')
		joyKnob = layer.querySelector('.drive-joy-knob')
		bindJoystick()
		sizeMarks()
		window.addEventListener('resize', sizeMarks)
	}

	// The car sprite
	function carSvg(cls, dark, light) {
		const id = 'grad-' + cls
		return `<svg class="${cls}" width="26" height="44" viewBox="0 0 26 44" aria-hidden="true">
			<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.5" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
			<rect x="0" y="6" width="5" height="9" rx="2" fill="#111"/><rect x="21" y="6" width="5" height="9" rx="2" fill="#111"/>
			<rect x="0" y="29" width="5" height="9" rx="2" fill="#111"/><rect x="21" y="29" width="5" height="9" rx="2" fill="#111"/>
			<rect x="3" y="1" width="20" height="42" rx="8" fill="url(#${id})"/>
			<path d="M6 12 Q13 8 20 12 L19 19 Q13 17 7 19 Z" fill="#1b2a3a" opacity="0.9"/>
			<path d="M7 30 Q13 32 19 30 L20 35 Q13 38 6 35 Z" fill="#1b2a3a" opacity="0.8"/>
			<rect x="11" y="20" width="4" height="9" rx="1" fill="#fff" opacity="0.85"/>
			<circle cx="7" cy="2.5" r="1.6" fill="#fff6c4"/><circle cx="19" cy="2.5" r="1.6" fill="#fff6c4"/>
		</svg>`
	}

	function sizeMarks() {
		if (!marks) return
		marks.width = innerWidth
		marks.height = innerHeight
	}

	// ---------- joystick (touch) ----------

	function bindJoystick() {
		const RADIUS = 46
		let pointerId = null
		const update = e => {
			const r = joyBase.getBoundingClientRect()
			let dx = e.clientX - (r.left + r.width / 2)
			let dy = e.clientY - (r.top + r.height / 2)
			const m = Math.hypot(dx, dy)
			if (m > RADIUS) { dx *= RADIUS / m; dy *= RADIUS / m }
			joyKnob.style.transform = `translate(${dx}px, ${dy}px)`
			joy = { dx: dx / RADIUS, dy: dy / RADIUS }
		}
		joyBase.addEventListener('pointerdown', e => {
			pointerId = e.pointerId
			joyBase.setPointerCapture(pointerId)
			joyBase.classList.add('held')
			update(e)
			e.preventDefault()
		})
		joyBase.addEventListener('pointermove', e => { if (e.pointerId === pointerId) update(e) })
		const release = e => {
			if (e.pointerId !== pointerId) return
			pointerId = null
			joy = null
			joyKnob.style.transform = ''
			joyBase.classList.remove('held')
		}
		joyBase.addEventListener('pointerup', release)
		joyBase.addEventListener('pointercancel', release)
	}

	// ---------- clicking by parking ----------

	function setTarget(el) {
		if (el === target) return
		if (target) target.classList.remove('drive-target')
		target = el
		dwellStart = performance.now()
		if (target) target.classList.add('drive-target')
	}

	function updateDwell(now) {
		const { x, y } = state
		const under = document.elementFromPoint(x, y)
		const el = under && under.closest(CLICKABLE)
		let usable = el && !el.disabled && el.getClientRects().length && !el.closest('.drive-layer') ? el : null
		if (usable !== lastClicked) lastClicked = null // left the element it just clicked
		setTarget(usable && usable !== lastClicked ? usable : null)

		if (target) {
			const p = Math.min(1, (now - dwellStart) / DWELL_MS)
			ring.classList.add('on')
			ringArc.style.strokeDashoffset = RING_LEN * (1 - p)
			if (p >= 1) {
				const hit = target
				setTarget(null)
				lastClicked = hit
				ring.classList.remove('on')
				ring.classList.add('fired')
				setTimeout(() => ring.classList.remove('fired'), 300)
				if (hit.matches('select')) hit.focus()
				else hit.click()
			}
		} else {
			ring.classList.remove('on')
			ringArc.style.strokeDashoffset = RING_LEN
		}
	}

	// ---------- the frame ----------

	function step(now) {
		if (!active) return
		const dt = Math.min(0.05, (now - last) / 1000)
		last = now

		// Input → throttle (-1..1) and steer (-1..1), from the keyboard or the joystick
		const up = keys.has('ArrowUp') || keys.has('w')
		const down = keys.has('ArrowDown') || keys.has('s')
		let throttle = up ? 1 : down ? -1 : 0
		let steer = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0)
		if (joy) {
			const m = Math.min(1, Math.hypot(joy.dx, joy.dy))
			if (m > 0.18) {
				// Point-to-go: turn toward the joystick's direction, speed up with how far it's pushed
				const diff = wrapAngle(Math.atan2(joy.dy, joy.dx) - state.angle)
				steer = Math.max(-1, Math.min(1, diff * 2.2))
				throttle = Math.abs(diff) > 2.6 ? -0.6 : m * (1 - 0.35 * Math.min(1, Math.abs(diff)))
			}
		}

		// Physics: accelerate, brake/reverse, coast to a stop
		let { x, y, angle, speed } = state
		if (throttle > 0) speed += ACCEL * throttle * dt
		else if (throttle < 0) speed -= (speed > 0 ? BRAKE : ACCEL * 0.6) * -throttle * dt
		else speed -= Math.sign(speed) * Math.min(Math.abs(speed), FRICTION * dt)
		speed = Math.max(-MAX_SPEED * 0.45, Math.min(MAX_SPEED, speed))
		angle += steer * TURN * dt * Math.max(-1, Math.min(1, speed / 180))

		const nx = x + Math.cos(angle) * speed * dt
		const ny = y + Math.sin(angle) * speed * dt
		// Bounce gently off the viewport edges
		if (nx < 14 || nx > innerWidth - 14) speed *= -0.35
		else x = nx
		if (ny < 14 || ny > innerHeight - 14) speed *= -0.35
		else y = ny
		Object.assign(state, { x, y, angle, speed })

		// Tyre marks when turning hard at speed; the whole layer slowly fades
		mctx.globalCompositeOperation = 'destination-out'
		mctx.fillStyle = 'rgba(0,0,0,0.04)'
		mctx.fillRect(0, 0, marks.width, marks.height)
		mctx.globalCompositeOperation = 'source-over'
		if (Math.abs(steer) > 0.5 && Math.abs(state.speed) > 220) {
			mctx.fillStyle = 'rgba(30, 30, 40, 0.35)'
			for (const side of [-1, 1]) {
				const px = state.x - Math.cos(state.angle) * 12 + Math.cos(state.angle + Math.PI / 2) * 9 * side
				const py = state.y - Math.sin(state.angle) * 12 + Math.sin(state.angle + Math.PI / 2) * 9 * side
				mctx.fillRect(px - 1.5, py - 1.5, 3, 3)
			}
		}

		car.style.transform = `translate(${state.x - 13}px, ${state.y - 22}px) rotate(${state.angle + Math.PI / 2}rad)`
		ring.style.transform = `translate(${state.x - 38}px, ${state.y - 38}px)`
		updateDwell(now)

		raf = requestAnimationFrame(step)
	}

	// ---------- keyboard ----------

	function onKeyDown(e) {
		if (!active) return
		if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			stop()
			return
		}
		const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) {
			// While driving, these keys steer instead of scrolling or typing
			e.preventDefault()
			e.stopPropagation()
			keys.add(k)
		}
	}

	function onKeyUp(e) {
		const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
		keys.delete(k)
	}

	// ---------- lifecycle ----------

	function showToast(html, ms = 5000) {
		toast.innerHTML = html
		toast.classList.remove('hide')
		clearTimeout(showToast.timer)
		showToast.timer = setTimeout(() => toast && toast.classList.add('hide'), ms)
	}

	function start(at) {
		if (!layer) build()
		if (!active) {
			active = true
			document.documentElement.classList.add('driving')
			layer.hidden = false
			lastClicked = null
			if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
			last = performance.now()
			raf = requestAnimationFrame(step)
			showToast(coarse.matches
				? '🏎 Game mode · drag the <b>joystick</b> to drive · park on a button to click · tap 🏎 to exit'
				: '🏎 Game mode · <b>arrows / WASD</b> to drive · park on a button to click · <b>Esc</b> to exit')
		}
		// Start near the middle of the visible page (or at a given point), pointing up
		place({
			x: at && at.x != null ? at.x : innerWidth / 2,
			y: at && at.y != null ? at.y : innerHeight * 0.55,
			angle: at && at.angle != null ? at.angle : -Math.PI / 2,
		})
		syncButton()
	}

	function place({ x, y, angle }) {
		Object.assign(state, { x, y, speed: 0 })
		if (angle != null) state.angle = angle
		if (mctx) mctx.clearRect(0, 0, marks.width, marks.height)
	}

	function stop() {
		if (!active) return
		active = false
		cancelAnimationFrame(raf)
		keys.clear()
		joy = null
		setTarget(null)
		layer.hidden = true
		mctx.clearRect(0, 0, marks.width, marks.height)
		document.documentElement.classList.remove('driving')
		syncButton()
	}

	function syncButton() {
		const b = document.getElementById('drive-toggle')
		if (b) b.setAttribute('aria-pressed', active)
	}

	window.addEventListener('keydown', onKeyDown, true)
	window.addEventListener('keyup', onKeyUp, true)
	window.addEventListener('blur', () => keys.clear())

	const button = document.getElementById('drive-toggle')
	if (button) button.addEventListener('click', () => (active ? stop() : start()))

	window.driveMode = {
		start,
		stop,
		toggle: () => (active ? stop() : start()),
		get active() { return active },
	}
})()
