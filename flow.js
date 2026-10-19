// Background: one winding river of light, seen from above, crossing the lower half of the page.
//
//   • Course: a smooth Catmull-Rom spline with broad S-bends from the left edge to the right edge.
//     The control points drift a little over time, so the river slowly breathes.
//   • Band: a single filled ribbon with gently varying width and clearly defined, glowing banks.
//     Inside it (clipped to the banks): a deep teal body, layered flowing textures and soft ripples
//     that follow the curves, with light travelling downstream along them.
//   • The brightest current (cyan) swings toward the outside of each bend like a real river;
//     subtle violet reflections drift along the opposite side.
//   • Restrained particles float on the surface and glint.
// The frame is copied onto the laptop wallpaper (.screen-aurora, hue-shifted in CSS), so the river
// continues through the screen in a different colour. Decorative only: no pointer interaction.
(function () {
	const hero = document.getElementById('hero')
	const main = document.querySelector('.backdrop .flow-canvas')
	const mirror = document.querySelector('.screen-aurora .flow-canvas')
	if (!hero || !main || !main.getContext) return

	const ctx = main.getContext('2d')
	const mctx = mirror ? mirror.getContext('2d') : null
	const off = document.createElement('canvas') // organic river (outside the display) is composed here
	const doff = document.createElement('canvas') // digital river (inside the display) is composed here
	const dctx = doff.getContext('2d')
	const octx = off.getContext('2d')
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	const TAU = Math.PI * 2

	// The riverbed (fractions of the hero): broad S-bends across the lower half, edge to edge
	// Three irregular meanders of different sizes; the lowest bend stays well inside the frame
	// Wraps around and below the terminal (which sits at ~y 0.15–0.68) and stays clear of the dock (~y 0.8+):
	// enters below the profile card, dips under the terminal in two uneven bends, then rises past its right edge
	const COURSE = [
		[-0.14, 0.58], [0.03, 0.6], [0.16, 0.69], [0.3, 0.73], [0.43, 0.69],
		[0.55, 0.715], [0.7, 0.735], [0.82, 0.68], [0.92, 0.56], [1.0, 0.5], [1.14, 0.47],
	]
	const SAMPLES_PER_SEGMENT = 22

	let W = 0, H = 0, dpr = 1
	let ripples = []
	let particles = []
	let glows = []
	let eddies = []
	let screenRect = null // the display's inner bounds, relative to the hero
	let panels = [] // translucent UI panels (in hero coordinates) to soften the river beneath
	let running = false
	let visible = true
	let lastT = 0
	const start = performance.now()

	const rand = (a, b) => a + Math.random() * (b - a)
	const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
	const isLight = () => document.documentElement.dataset.theme === 'light'
	const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`

	// Palette: deep navy water, electric cyan light, subtle violet reflections
	const NAVY = [12, 30, 70]
	const TEAL = [20, 110, 160]
	const CYAN = [90, 230, 255]
	const ICE = [200, 250, 255]
	const VIOLET = [160, 110, 255]

	// ---------- geometry ----------

	function controlPoints(t) {
		return COURSE.map(([x, y], i) => [
			x * W,
			// Only a tiny drift, so the river's shape stays stable while the surface moves
			(y + 0.005 * Math.sin(t * 0.05 + i * 2.3)) * H,
		])
	}

	function sampleCourse(t) {
		const p = controlPoints(t)
		const pts = []
		for (let i = 0; i < p.length - 1; i++) {
			const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)]
			for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) {
				const s = k / SAMPLES_PER_SEGMENT, s2 = s * s, s3 = s2 * s
				pts.push({
					x: 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
					y: 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3),
				})
			}
		}
		pts.push({ x: p[p.length - 1][0], y: p[p.length - 1][1] })

		// Normals, arc length, half-width and (smoothed) curvature at every sample
		let s = 0
		for (let i = 0; i < pts.length; i++) {
			const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
			const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1
			const pt = pts[i]
			pt.tx = dx / len
			pt.ty = dy / len
			pt.nx = -pt.ty
			pt.ny = pt.tx
			if (i) s += Math.hypot(pt.x - pts[i - 1].x, pt.y - pts[i - 1].y)
			pt.s = s
			pt.u = pt.x / W
			// Gently varying width, a little wider through the middle of the page
			pt.w = H * (0.058 + 0.014 * Math.sin(pt.u * 4.1 + 1.3 + t * 0.04) + 0.01 * Math.sin(pt.u * 9.7 + t * 0.07)
				+ 0.012 * Math.exp(-(((pt.u - 0.45) / 0.25) ** 2)))
		}
		for (let i = 0; i < pts.length; i++) {
			const a = pts[Math.max(0, i - 3)], b = pts[Math.min(pts.length - 1, i + 3)]
			// Turning direction: positive = bending toward +normal
			pts[i].k = clamp((a.tx * b.ty - a.ty * b.tx) * 6, -1, 1)
		}
		const kSmooth = pts.map((_, i) => {
			let sum = 0, n = 0
			for (let j = Math.max(0, i - 10); j <= Math.min(pts.length - 1, i + 10); j++) { sum += pts[j].k; n++ }
			return sum / n
		})
		pts.forEach((pt, i) => {
			pt.k = kSmooth[i]
			// A little wider through the apex of each bend
			pt.w *= 1 + 0.22 * Math.abs(pt.k)
			// Soft, irregular bank contours: fixed in space (so the silhouette stays stable), drifting very slowly
			pt.eL = 0.06 * noise(pt.s * 0.011 + t * 0.01, 1)
			pt.eR = 0.06 * noise(pt.s * 0.013 - t * 0.01, 5)
		})
		return pts
	}

	// Smooth 1-D noise in about [-1, 1]
	function noise(x, seed) {
		return Math.sin(x * 1.7 + seed) * 0.5 + Math.sin(x * 3.1 + seed * 2.3) * 0.3 + Math.sin(x * 5.9 + seed * 0.7) * 0.2
	}

	// Bank position for side -1 / +1, including the irregular contour
	const bankAt = (pt, side, k = 1) => at(pt, side * k * (1 + (side < 0 ? pt.eL : pt.eR)))

	// Point across the river at sample i: o ∈ [-1, 1] spans bank to bank
	const at = (pt, o) => [pt.x + pt.nx * pt.w * o, pt.y + pt.ny * pt.w * o]

	function tracePath(c, pts, offsetOf) {
		c.beginPath()
		pts.forEach((pt, i) => {
			const [x, y] = at(pt, offsetOf(pt, i))
			i ? c.lineTo(x, y) : c.moveTo(x, y)
		})
	}

	function traceBand(c, pts, k) {
		c.beginPath()
		pts.forEach((pt, i) => { const [x, y] = bankAt(pt, -1, k); i ? c.lineTo(x, y) : c.moveTo(x, y) })
		for (let i = pts.length - 1; i >= 0; i--) { const [x, y] = bankAt(pts[i], 1, k); c.lineTo(x, y) }
		c.closePath()
	}

	// ---------- elements ----------

	function build() {
		const small = W < 700
		// Two translucent ripple layers: fine, quicker surface ripples and broader, slower swells.
		// Lane positions are irregular, and each lane wanders on its own.
		const lane = (fine) => {
			const o = rand(-0.85, 0.85)
			return {
				o,
				wobble: fine ? rand(0.05, 0.14) : rand(0.1, 0.22),
				wobbleF: rand(0.004, 0.011),
				wobbleP: rand(0, TAU),
				width: fine ? rand(0.4, 0.9) : rand(1, 1.7),
				alpha: (fine ? rand(0.06, 0.15) : rand(0.04, 0.08)) * (1 - 0.4 * Math.abs(o)),
				dash: fine ? rand(12, 50) : rand(50, 140),
				gap: fine ? rand(60, 220) : rand(160, 420),
				speed: (fine ? rand(22, 42) : rand(9, 20)) * (1.15 - 0.4 * Math.abs(o)), // faster mid-stream
				violet: Math.random() < 0.3,
			}
		}
		ripples = [
			...Array.from({ length: small ? 8 : 16 }, () => lane(true)),
			...Array.from({ length: small ? 3 : 6 }, () => lane(false)),
		]
		eddies = Array.from({ length: small ? 5 : 11 }, () => newEddy(Math.random()))
		particles = Array.from({ length: small ? 22 : 48 }, () => newParticle(Math.random()))
		glows = Array.from({ length: small ? 12 : 22 }, () => newGlow(Math.random() * 1.1 - 0.05))
		measurePanels()
	}

	// Particles: varied size, brightness and spacing; a few travel in loose pairs
	function newParticle(u) {
		const big = Math.random() < 0.15
		return {
			u: u + (Math.random() < 0.25 ? rand(0, 0.01) : 0),
			o: (Math.random() + Math.random() - 1) * 0.95,
			speed: rand(0.004, 0.012),
			r: big ? rand(1.4, 2.2) : rand(0.35, 1.1),
			bright: big ? rand(0.6, 1) : rand(0.2, 0.7),
			tw: rand(0, TAU),
			twS: rand(0.6, 2.2),
		}
	}

	// Uneven blue-violet reflections, leaning toward the outside of bends; gaps between them stay dark
	function newGlow(u) {
		const r = Math.random()
		return {
			u,
			o: rand(-0.6, 0.6),
			size: rand(0.6, 1.9),
			speed: rand(0.003, 0.008),
			alpha: rand(0.05, 0.13),
			colour: r < 0.3 ? 'cyan' : r < 0.6 ? 'blue' : r < 0.85 ? 'teal' : 'violet',
		}
	}

	// Small eddies: partial swirls that turn slowly as they drift downstream
	function newEddy(u) {
		return {
			u,
			o: rand(-0.6, 0.6),
			r: rand(0.18, 0.4), // fraction of the river's half-width
			speed: rand(0.002, 0.005),
			spin: rand(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1),
			phase: rand(0, TAU),
			arc: rand(1.4, 3),
			alpha: rand(0.08, 0.18),
			violet: Math.random() < 0.35,
		}
	}

	// Where the translucent panels (profile card, dock) sit, relative to the hero
	function measurePanels() {
		const h = hero.getBoundingClientRect()
		panels = Array.from(document.querySelectorAll('#hero .dw:not([hidden]), #hero .widget:not([hidden]), #hero .dock'))
			.map(el => el.getBoundingClientRect())
			.filter(r => r.width && r.height)
			.map(r => ({ x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }))
		const d = document.getElementById('desktop')
		const r = d && d.getBoundingClientRect()
		screenRect = r && r.width ? { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height } : null
	}

	// Dim the river beneath the panels, with soft edges, so their text stays readable
	function softenUnderPanels(octx, light) {
		if (!panels.length) return
		octx.globalCompositeOperation = 'destination-out'
		for (const p of panels) {
			// Many small steps from a wide, faint margin to the panel itself, so there's no visible edge
			const STEPS = 12
			for (let s = 0; s < STEPS; s++) {
				const grow = 36 * (1 - s / (STEPS - 1))
				const a = (light ? 0.035 : 0.045)
				octx.fillStyle = `rgba(0, 0, 0, ${a})`
				octx.beginPath()
				octx.roundRect(p.x - grow, p.y - grow, p.w + grow * 2, p.h + grow * 2, 18 + grow)
				octx.fill()
			}
		}
	}

	// ---------- drawing ----------

	function draw(now) {
		const t = (now - start) / 1000
		const dt = Math.min(0.1, t - lastT)
		lastT = t
		const light = isLight()
		const pts = sampleCourse(t)

		octx.setTransform(dpr, 0, 0, dpr, 0, 0)
		octx.globalCompositeOperation = 'source-over'
		octx.clearRect(0, 0, W, H)
		octx.lineCap = 'round'
		octx.lineJoin = 'round'

		// 1) Atmosphere: a soft glow spilling past the banks
		octx.globalCompositeOperation = light ? 'source-over' : 'lighter'
		for (const [k, a] of [[2.6, 0.03], [1.9, 0.045], [1.4, 0.06]]) {
			traceBand(octx, pts, k)
			octx.fillStyle = rgba(light ? TEAL : NAVY, a * (light ? 0 : 2)) // no halo in light mode: it shows as steps
			octx.fill()
		}

		// 2) The water body, clipped to the banks
		octx.save()
		traceBand(octx, pts, 1)
		octx.clip()
		octx.globalCompositeOperation = 'source-over'

		// Deep base
		octx.fillStyle = light ? 'rgba(160, 205, 235, 0.55)' : 'rgba(8, 22, 52, 0.85)'
		octx.fillRect(0, 0, W, H)
		octx.globalCompositeOperation = light ? 'source-over' : 'lighter'

		const sample = u => pts[clamp(Math.round(u * (pts.length - 1)), 0, pts.length - 1)]
		const COLOURS = { cyan: CYAN, blue: [70, 120, 240], teal: TEAL, violet: VIOLET }

		// Uneven reflections drifting downstream; they lean toward the outside of bends,
		// and the gaps between them leave the water dark for depth
		for (const g of glows) {
			if (!reduceMotion) g.u += dt * g.speed
			if (g.u > 1.08) Object.assign(g, newGlow(-0.08))
			const pt = sample(g.u)
			const [x, y] = at(pt, clamp(g.o - pt.k * 0.45, -0.8, 0.8))
			const r = pt.w * g.size
			const grad = octx.createRadialGradient(x, y, 0, x, y, r)
			const colour = COLOURS[g.colour]
			grad.addColorStop(0, rgba(colour, g.alpha * (light ? 1.1 : 1)))
			grad.addColorStop(0.55, rgba(colour, g.alpha * 0.35))
			grad.addColorStop(1, rgba(colour, 0))
			octx.fillStyle = grad
			octx.fillRect(x - r, y - r, r * 2, r * 2)
		}

		// Eddies: faint partial swirls aligned with the current, turning slowly
		octx.lineCap = 'round'
		for (const e of eddies) {
			if (!reduceMotion) e.u += dt * e.speed
			if (e.u > 1.05) Object.assign(e, newEddy(-0.05))
			const pt = sample(e.u)
			const [x, y] = at(pt, e.o)
			const r = pt.w * e.r
			const angle = Math.atan2(pt.ty, pt.tx)
			const start = e.phase + t * e.spin
			for (const [scale, a] of [[1, 1], [0.6, 0.6]]) {
				octx.beginPath()
				octx.ellipse(x, y, r * 1.7 * scale, r * 0.7 * scale, angle, start * scale, start * scale + e.arc)
				octx.lineWidth = 0.9
				octx.strokeStyle = rgba(e.violet ? VIOLET : CYAN, e.alpha * a * (light ? 1.3 : 1))
				octx.stroke()
			}
		}

		// Subtle ripples: a few short, wavering strokes rather than dense parallel streaks
		for (const r of ripples) {
			tracePath(octx, pts, pt => r.o + r.wobble * Math.sin(pt.s * r.wobbleF + t * 0.4 + r.wobbleP))
			octx.setLineDash([r.dash, r.gap])
			octx.lineDashOffset = -t * r.speed
			octx.lineWidth = r.width
			octx.strokeStyle = rgba(r.violet ? VIOLET : CYAN, r.alpha * (light ? 1.4 : 1))
			octx.stroke()
		}
		octx.setLineDash([])

		// Particles in the water: varied size and brightness, slower near the banks
		for (const p of particles) {
			if (!reduceMotion) p.u += dt * p.speed * (1.1 - 0.5 * Math.abs(p.o))
			if (p.u > 1.02) Object.assign(p, newParticle(-0.02))
			const [x, y] = at(sample(p.u), p.o)
			const a = p.bright * (0.45 + 0.55 * Math.sin(t * p.twS + p.tw) ** 2) * (light ? 0.55 : 0.8)
			if (a < 0.03) continue
			if (p.r > 1.3) {
				// The larger glints get a faint bloom
				const g = octx.createRadialGradient(x, y, 0, x, y, p.r * 4)
				g.addColorStop(0, rgba(CYAN, a * 0.35))
				g.addColorStop(1, rgba(CYAN, 0))
				octx.fillStyle = g
				octx.fillRect(x - p.r * 4, y - p.r * 4, p.r * 8, p.r * 8)
			}
			octx.fillStyle = rgba(ICE, a)
			octx.beginPath()
			octx.arc(x, y, p.r, 0, TAU)
			octx.fill()
		}
		octx.restore()

		// 3) Banks: a soft, continuous contour, plus broken cyan highlights that favour the outside of bends.
		// Each is ONE path (highlights as separate sub-paths), so no overlapping segments → no beads.
		octx.globalCompositeOperation = light ? 'source-over' : 'lighter'
		octx.lineJoin = 'round'
		for (const side of [-1, 1]) {
			const colour = side < 0 ? CYAN : [140, 160, 255]

			octx.beginPath()
			pts.forEach((pt, i) => { const [x, y] = bankAt(pt, side); i ? octx.lineTo(x, y) : octx.moveTo(x, y) })
			octx.lineCap = 'butt'
			for (const [w, a] of [[9, 0.025], [3.5, 0.04], [1, 0.08]]) {
				octx.lineWidth = w
				octx.strokeStyle = rgba(colour, a * (light ? 0.9 : 1))
				octx.stroke()
			}

			// Broken highlights: only where a slowly drifting noise field (boosted on outer bends) is high
			octx.beginPath()
			let open = false
			for (const pt of pts) {
				const outer = clamp(-pt.k * side * 2.2, 0, 1)
				const on = noise(pt.s * 0.009 - t * 0.12, side < 0 ? 2 : 8) + outer * 0.6 > 0.45
				const [x, y] = bankAt(pt, side)
				if (on) { open ? octx.lineTo(x, y) : octx.moveTo(x, y); open = true } else open = false
			}
			octx.lineCap = 'round' // soft ends on each highlight
			for (const [w, a] of [[5, 0.05], [1.3, 0.3]]) {
				octx.lineWidth = w
				octx.strokeStyle = rgba(CYAN, a * (light ? 0.8 : 1))
				octx.stroke()
			}
		}

		octx.lineCap = 'round'

		// Outside the display: the organic water, with a soft glow where it meets each screen edge
		drawEdgeGlows(octx, pts, light, CYAN)
		octx.globalCompositeOperation = 'source-over'
		ctx.clearRect(0, 0, W, H)
		ctx.drawImage(off, 0, 0, W, H)

		// Inside the display: the same river, from the same state, re-rendered as a digital stream
		if (mctx) {
			drawDigital(pts, t, light)
			drawEdgeGlows(dctx, pts, light, VIOLET)
			softenUnderPanels(dctx, light)
			dctx.globalCompositeOperation = 'source-over'
			mctx.clearRect(0, 0, W, H)
			mctx.drawImage(doff, 0, 0, W, H)
		}
	}

	// Restrained glow where the river crosses the display's left and right edges
	function drawEdgeGlows(c, pts, light, colour) {
		if (!screenRect) return
		c.globalCompositeOperation = light ? 'source-over' : 'lighter'
		for (const ex of [screenRect.x, screenRect.x + screenRect.w]) {
			let best = pts[0]
			for (const pt of pts) if (Math.abs(pt.x - ex) < Math.abs(best.x - ex)) best = pt
			if (best.y < screenRect.y || best.y > screenRect.y + screenRect.h) continue
			const r = best.w * 1.9
			const g = c.createRadialGradient(ex, best.y, 0, ex, best.y, r)
			g.addColorStop(0, rgba(colour, light ? 0.12 : 0.2))
			g.addColorStop(1, rgba(colour, 0))
			c.fillStyle = g
			c.fillRect(ex - r, best.y - r, r * 2, r * 2)
		}
	}

	// ---------- the liquid-glass river (inside the display) ----------
	// Same silhouette, reflections, eddies and particles as the water outside (one shared state),
	// re-rendered glossier and richer in violet: a translucent indigo body, smooth violet reflections,
	// a glassy sheen with a refracted inner rim, soft cyan highlights and swirling currents.
	// No grid, wireframe or dashes.
	const INDIGO = [60, 45, 190]
	const GLASS_VIOLET = [165, 120, 255]
	const GLASS_CYAN = [120, 220, 255]
	const SHEEN = [235, 225, 255]

	function drawDigital(pts, t, light) {
		const c = dctx
		c.setTransform(dpr, 0, 0, dpr, 0, 0)
		c.globalCompositeOperation = 'source-over'
		c.clearRect(0, 0, W, H)
		c.lineCap = 'round'
		c.lineJoin = 'round'
		const sample = u => pts[clamp(Math.round(u * (pts.length - 1)), 0, pts.length - 1)]
		const add = light ? 'source-over' : 'lighter'

		// Faint violet halo around the glass
		c.globalCompositeOperation = add
		if (!light) {
			for (const [k, a] of [[2.2, 0.025], [1.5, 0.04]]) {
				traceBand(c, pts, k)
				c.fillStyle = rgba(INDIGO, a)
				c.fill()
			}
		}

		c.save()
		traceBand(c, pts, 1)
		c.clip()

		// Translucent indigo body
		c.globalCompositeOperation = 'source-over'
		c.fillStyle = light ? 'rgba(190, 175, 250, 0.5)' : 'rgba(22, 12, 62, 0.82)'
		c.fillRect(0, 0, W, H)
		c.globalCompositeOperation = add

		// Depth: smooth shading toward the middle (many tiny steps, no visible bands)
		for (let s = 0; s < 12; s++) {
			traceBand(c, pts, 1 - (s + 0.5) / 12 * 0.9)
			c.fillStyle = rgba(INDIGO, light ? 0.018 : 0.03)
			c.fill()
		}

		// Smooth violet and cyan reflections: the shared reflections, larger and softer here
		for (const g of glows) {
			const pt = sample(g.u)
			const [x, y] = at(pt, clamp(g.o - pt.k * 0.45, -0.8, 0.8))
			const r = pt.w * g.size * 1.25
			const colour = g.colour === 'cyan' ? GLASS_CYAN : GLASS_VIOLET
			const grad = c.createRadialGradient(x, y, 0, x, y, r)
			grad.addColorStop(0, rgba(colour, g.alpha * (light ? 1 : 1.25)))
			grad.addColorStop(0.5, rgba(colour, g.alpha * 0.4))
			grad.addColorStop(1, rgba(colour, 0))
			c.fillStyle = grad
			c.fillRect(x - r, y - r, r * 2, r * 2)
		}

		// Glossy sheen: a broad, soft specular band along one side, shimmering slowly
		const sheenAt = pt => -0.42 + 0.12 * Math.sin(pt.s * 0.006 - t * 0.25)
		tracePath(c, pts, sheenAt)
		for (let s = 0; s < 8; s++) {
			c.lineWidth = H * 0.03 * (1 - s / 8)
			c.strokeStyle = rgba(SHEEN, light ? 0.02 : 0.025)
			c.stroke()
		}

		// Gentle ripples: the shared ripple lanes as smooth, continuous, very faint curves
		for (const r of ripples) {
			tracePath(c, pts, pt => r.o + r.wobble * Math.sin(pt.s * r.wobbleF + t * 0.4 + r.wobbleP))
			c.lineWidth = r.width * 0.9
			c.strokeStyle = rgba(r.violet ? GLASS_VIOLET : GLASS_CYAN, r.alpha * (light ? 0.5 : 0.45))
			c.stroke()
		}

		// Swirling internal currents: the shared eddies as soft, broad swirls
		for (const e of eddies) {
			const pt = sample(e.u)
			const [x, y] = at(pt, e.o)
			const r = pt.w * e.r * 1.3
			const angle = Math.atan2(pt.ty, pt.tx)
			const start = e.phase + t * e.spin
			for (const [scale, w, a] of [[1, 5, 0.06], [1, 1.2, 0.22], [0.62, 1, 0.14]]) {
				c.beginPath()
				c.ellipse(x, y, r * 1.8 * scale, r * 0.75 * scale, angle, start, start + e.arc)
				c.lineWidth = w
				c.strokeStyle = rgba(e.violet ? GLASS_VIOLET : GLASS_CYAN, e.alpha * a * 4 * (light ? 0.8 : 1))
				c.stroke()
			}
		}

		// Particles: the same positions as outside, as soft glassy beads with a highlight
		for (const p of particles) {
			const [x, y] = at(sample(p.u), p.o)
			const a = p.bright * (0.45 + 0.55 * Math.sin(t * p.twS + p.tw) ** 2) * (light ? 0.6 : 0.85)
			if (a < 0.03) continue
			const r = p.r * 2.4
			const g = c.createRadialGradient(x, y, 0, x, y, r)
			g.addColorStop(0, rgba(SHEEN, a))
			g.addColorStop(0.35, rgba(p.r > 1.3 ? GLASS_CYAN : GLASS_VIOLET, a * 0.5))
			g.addColorStop(1, rgba(GLASS_VIOLET, 0))
			c.fillStyle = g
			c.fillRect(x - r, y - r, r * 2, r * 2)
		}

		// Refraction: a thin, bright inner rim just inside each bank, like light bending at a glass edge
		for (const side of [-1, 1]) {
			c.beginPath()
			pts.forEach((pt, i) => { const [x, y] = bankAt(pt, side, 0.88); i ? c.lineTo(x, y) : c.moveTo(x, y) })
			c.lineWidth = 1
			c.strokeStyle = rgba(side < 0 ? SHEEN : GLASS_CYAN, light ? 0.18 : 0.14)
			c.stroke()
		}
		c.restore()

		// Banks: glossy edges, with the same broken highlights as outside so they carry through the bezel
		c.globalCompositeOperation = add
		for (const side of [-1, 1]) {
			const colour = side < 0 ? GLASS_VIOLET : GLASS_CYAN
			c.beginPath()
			pts.forEach((pt, i) => { const [x, y] = bankAt(pt, side); i ? c.lineTo(x, y) : c.moveTo(x, y) })
			c.lineCap = 'butt'
			for (const [w, a] of [[8, 0.035], [3, 0.06], [1.1, 0.28]]) {
				c.lineWidth = w
				c.strokeStyle = rgba(colour, a * (light ? 0.85 : 1))
				c.stroke()
			}
			c.beginPath()
			let open = false
			for (const pt of pts) {
				const outer = clamp(-pt.k * side * 2.2, 0, 1)
				const on = noise(pt.s * 0.009 - t * 0.12, side < 0 ? 2 : 8) + outer * 0.6 > 0.45
				const [x, y] = bankAt(pt, side)
				if (on) { open ? c.lineTo(x, y) : c.moveTo(x, y); open = true } else open = false
			}
			c.lineCap = 'round'
			for (const [w, a] of [[5, 0.06], [1.3, 0.38]]) {
				c.lineWidth = w
				c.strokeStyle = rgba(side < 0 ? SHEEN : GLASS_CYAN, a * (light ? 0.8 : 1))
				c.stroke()
			}
		}
	}

	// ---------- lifecycle ----------

	function resize() {
		dpr = Math.min(window.devicePixelRatio || 1, 1.5)
		W = hero.clientWidth
		H = hero.clientHeight
		for (const c of [main, mirror, off, doff]) {
			if (!c) continue
			c.width = Math.round(W * dpr)
			c.height = Math.round(H * dpr)
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		if (mctx) mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		build()
		draw(performance.now())
	}

	function loop(now) {
		if (!running) return
		draw(now)
		requestAnimationFrame(loop)
	}

	function update() {
		const shouldRun = visible && !document.hidden && !reduceMotion
		if (shouldRun && !running) {
			running = true
			lastT = (performance.now() - start) / 1000
			requestAnimationFrame(loop)
		} else if (!shouldRun) {
			running = false
		}
	}

	new IntersectionObserver(entries => {
		visible = entries[0].isIntersecting
		update()
	}).observe(hero)
	document.addEventListener('visibilitychange', update)

	let lastW = 0, lastH = 0, timer = 0
	new ResizeObserver(() => {
		if (hero.clientWidth === lastW && hero.clientHeight === lastH) return
		lastW = hero.clientWidth
		lastH = hero.clientHeight
		clearTimeout(timer)
		timer = setTimeout(resize, 100)
	}).observe(hero)

	// Widgets moved, resized, added or removed: re-measure where to dim the river
	document.addEventListener('widgets:changed', () => {
		measurePanels()
		if (!running) draw(performance.now())
	})

	new MutationObserver(() => {
		if (!running) draw(performance.now())
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

	resize()
	update()
})()
