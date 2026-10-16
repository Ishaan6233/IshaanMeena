// Cliff Walking: Q-learning vs Expected Sarsa, a JavaScript port of
// Ishaan6233/CliffWalking-QLearning-ExpectedSARSA (cliffworld_env.py + both agents).
// Both agents learn side by side; arrows show each one's current greedy policy.
window.DEMOS = window.DEMOS || {}

window.DEMOS['cliff-walking'] = {
	title: 'Cliff Walking',
	tagline: 'Q-learning vs Expected Sarsa',
	icon: '🧗',
	blurb: 'Two reinforcement-learning agents learn to cross a 4×12 grid without falling off the cliff. Q-learning finds the shortest path along the edge; Expected Sarsa learns a safer route.',
	note: 'Same environment and update rules as my Python agents: −1 per step, −100 and back to start for the cliff, ε-greedy actions with random tie-breaking, discount 1.',

	mount(root) {
		const H = 4
		const W = 12
		const START = 3 * W
		const GOAL = 3 * W + 11
		const ACTIONS = [[-1, 0], [0, -1], [1, 0], [0, 1]] // up, left, down, right (as in the env)
		const ARROWS = ['↑', '←', '↓', '→']
		const MAX_EPISODES = 500

		root.innerHTML = `
			<div class="demo-controls">
				<button type="button" class="demo-btn primary cw-run">▶ Train</button>
				<button type="button" class="demo-btn cw-reset">Reset</button>
				<label>Speed <input type="range" class="cw-speed" min="0" max="100" value="45" aria-label="Training speed"></label>
				<label>ε <input type="range" class="cw-eps" min="0" max="30" value="10" aria-label="Exploration rate epsilon"><output class="cw-eps-val">0.10</output></label>
				<label>α <input type="range" class="cw-alpha" min="5" max="100" value="50" aria-label="Step size alpha"><output class="cw-alpha-val">0.50</output></label>
			</div>
			<div class="cw-boards">
				<figure class="cw-board" data-agent="q">
					<figcaption><strong>Q-learning</strong> <span class="cw-meta"></span></figcaption>
					<canvas aria-label="Q-learning agent on the cliff grid"></canvas>
				</figure>
				<figure class="cw-board" data-agent="es">
					<figcaption><strong>Expected Sarsa</strong> <span class="cw-meta"></span></figcaption>
					<canvas aria-label="Expected Sarsa agent on the cliff grid"></canvas>
				</figure>
			</div>
			<figure class="cw-chart-wrap">
				<figcaption>Sum of rewards per episode (moving average of 10). Higher is better.</figcaption>
				<canvas class="cw-chart" aria-label="Reward per episode chart"></canvas>
			</figure>`

		const runBtn = root.querySelector('.cw-run')
		const speedEl = root.querySelector('.cw-speed')
		const epsEl = root.querySelector('.cw-eps')
		const alphaEl = root.querySelector('.cw-alpha')
		const chart = root.querySelector('.cw-chart')

		let epsilon = 0.1
		let alpha = 0.5

		// ---------- environment + agents ----------

		function step(state, action) {
			const r = Math.floor(state / W)
			const c = state % W
			const nr = Math.min(H - 1, Math.max(0, r + ACTIONS[action][0]))
			const nc = Math.min(W - 1, Math.max(0, c + ACTIONS[action][1]))
			const next = nr * W + nc
			if (nr === 3 && nc >= 1 && nc <= 10) return { next: START, reward: -100, done: false, fell: true }
			if (next === GOAL) return { next, reward: 0, done: true }
			return { next, reward: -1, done: false }
		}

		function argmax(q) {
			let top = -Infinity
			let ties = []
			for (let a = 0; a < q.length; a++) {
				if (q[a] > top) { top = q[a]; ties = [] }
				if (q[a] === top) ties.push(a)
			}
			return ties[Math.floor(Math.random() * ties.length)]
		}

		function policy(q) {
			return Math.random() < epsilon ? Math.floor(Math.random() * 4) : argmax(q)
		}

		function makeAgent(kind) {
			return {
				kind,
				q: Array.from({ length: H * W }, () => [0, 0, 0, 0]),
				state: START,
				action: null,
				episodeReturn: 0,
				returns: [],
				falls: 0,
				trail: [],
			}
		}

		// The value of the next state: max (Q-learning) or the ε-greedy expectation (Expected Sarsa)
		function targetValue(agent, s) {
			const q = agent.q[s]
			if (agent.kind === 'q') return Math.max(...q)
			const best = argmax(q)
			let expected = 0
			for (let a = 0; a < 4; a++) expected += ((a === best ? 1 - epsilon : 0) + epsilon / 4) * q[a]
			return expected
		}

		function agentStep(agent) {
			if (agent.returns.length >= MAX_EPISODES) return
			if (agent.action === null) agent.action = policy(agent.q[agent.state])
			const prev = agent.state
			const a = agent.action
			const { next, reward, done, fell } = step(prev, a)
			agent.episodeReturn += reward
			if (fell) agent.falls++
			if (done) {
				agent.q[prev][a] += alpha * (reward - agent.q[prev][a])
				agent.returns.push(agent.episodeReturn)
				agent.state = START
				agent.action = null
				agent.episodeReturn = 0
				agent.trail = []
				return
			}
			agent.q[prev][a] += alpha * (reward + targetValue(agent, next) - agent.q[prev][a])
			agent.state = next
			agent.action = policy(agent.q[next])
			agent.trail.push(prev)
			if (agent.trail.length > 30) agent.trail.shift()
		}

		// ---------- drawing ----------

		const boards = Array.from(root.querySelectorAll('.cw-board')).map(fig => ({
			fig,
			canvas: fig.querySelector('canvas'),
			meta: fig.querySelector('.cw-meta'),
		}))

		function colours() {
			const s = getComputedStyle(root)
			return {
				text: s.getPropertyValue('--mainText').trim() || '#fff',
				muted: s.getPropertyValue('--secondaryText').trim() || '#999',
				border: s.getPropertyValue('--borderColor').trim() || '#444',
				link: s.getPropertyValue('--linkColor').trim() || '#58a6ff',
			}
		}

		function sizeCanvas(canvas, aspect) {
			const dpr = Math.min(window.devicePixelRatio || 1, 2)
			const w = canvas.clientWidth || 300
			const h = Math.round(w * aspect)
			if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
				canvas.width = Math.round(w * dpr)
				canvas.height = Math.round(h * dpr)
				canvas.style.height = h + 'px'
			}
			const ctx = canvas.getContext('2d')
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
			return { ctx, w, h }
		}

		// Greedy path from the start, to show the route each agent has settled on
		function greedyPath(agent) {
			const path = [START]
			let s = START
			for (let k = 0; k < 60 && s !== GOAL; k++) {
				const q = agent.q[s]
				const a = q.indexOf(Math.max(...q))
				const res = step(s, a)
				if (res.fell) break
				s = res.next
				path.push(s)
			}
			return path
		}

		function drawBoard(board, agent, c, showAgent) {
			const { ctx, w, h } = sizeCanvas(board.canvas, H / W)
			const cw = w / W
			const ch = h / H
			ctx.clearRect(0, 0, w, h)

			// Cell shading by state value (max Q)
			let min = 0
			for (const q of agent.q) min = Math.min(min, Math.max(...q))
			for (let s = 0; s < H * W; s++) {
				const r = Math.floor(s / W)
				const col = s % W
				const x = col * cw
				const y = r * ch
				const isCliff = r === 3 && col >= 1 && col <= 10
				if (isCliff) {
					ctx.fillStyle = 'rgba(229, 57, 59, 0.75)'
				} else if (s === GOAL) {
					ctx.fillStyle = 'rgba(46, 160, 67, 0.8)'
				} else if (s === START) {
					ctx.fillStyle = 'rgba(88, 166, 255, 0.45)'
				} else {
					const v = Math.max(...agent.q[s])
					const t = min < 0 ? v / min : 0 // 0 = best, 1 = worst
					ctx.fillStyle = `rgba(88, 166, 255, ${0.06 + 0.32 * (1 - t)})`
				}
				ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2)

				ctx.fillStyle = c.text
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				if (isCliff) {
					if (col === 5) {
						ctx.font = `600 ${Math.max(9, ch * 0.28)}px system-ui, sans-serif`
						ctx.fillStyle = '#fff'
						ctx.fillText('THE CLIFF', x + cw, y + ch / 2)
					}
				} else if (s === GOAL || s === START) {
					ctx.font = `700 ${Math.max(9, ch * 0.3)}px system-ui, sans-serif`
					ctx.fillText(s === GOAL ? 'G' : 'S', x + cw / 2, y + ch / 2)
				} else if (agent.q[s].some(v => v !== 0)) {
					ctx.globalAlpha = 0.55
					ctx.font = `${Math.max(9, ch * 0.34)}px system-ui, sans-serif`
					const q = agent.q[s]
					ctx.fillText(ARROWS[q.indexOf(Math.max(...q))], x + cw / 2, y + ch / 2)
					ctx.globalAlpha = 1
				}
			}

			// The greedy route
			const path = greedyPath(agent)
			if (path.length > 1) {
				ctx.strokeStyle = c.link
				ctx.lineWidth = 3
				ctx.lineJoin = 'round'
				ctx.beginPath()
				path.forEach((s, k) => {
					const x = (s % W) * cw + cw / 2
					const y = Math.floor(s / W) * ch + ch / 2
					k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
				})
				ctx.stroke()
			}

			// The agent itself, when slow enough to follow
			if (showAgent) {
				const x = (agent.state % W) * cw + cw / 2
				const y = Math.floor(agent.state / W) * ch + ch / 2
				ctx.fillStyle = '#ffd33d'
				ctx.beginPath()
				ctx.arc(x, y, Math.min(cw, ch) * 0.22, 0, Math.PI * 2)
				ctx.fill()
			}

			const last = agent.returns.slice(-10)
			const avg = last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : '–'
			board.meta.textContent = `episode ${agent.returns.length} · avg reward ${avg} · falls ${agent.falls}`
		}

		function movingAverage(values, k) {
			return values.map((_, i) => {
				const slice = values.slice(Math.max(0, i - k + 1), i + 1)
				return slice.reduce((a, b) => a + b, 0) / slice.length
			})
		}

		function drawChart(c) {
			const { ctx, w, h } = sizeCanvas(chart, 0.28)
			ctx.clearRect(0, 0, w, h)
			const pad = { l: 38, r: 10, t: 8, b: 20 }
			const yMin = -100
			const yMax = 0
			const n = Math.max(50, ...agents.map(a => a.returns.length))
			const X = i => pad.l + (i / Math.max(1, n - 1)) * (w - pad.l - pad.r)
			const Y = v => pad.t + ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * (h - pad.t - pad.b)

			ctx.strokeStyle = c.border
			ctx.fillStyle = c.muted
			ctx.font = '11px system-ui, sans-serif'
			ctx.lineWidth = 1
			ctx.textAlign = 'right'
			ctx.textBaseline = 'middle'
			for (const v of [0, -25, -50, -75, -100]) {
				ctx.globalAlpha = 0.5
				ctx.beginPath()
				ctx.moveTo(pad.l, Y(v))
				ctx.lineTo(w - pad.r, Y(v))
				ctx.stroke()
				ctx.globalAlpha = 1
				ctx.fillText(v, pad.l - 6, Y(v))
			}
			ctx.textAlign = 'center'
			ctx.textBaseline = 'top'
			ctx.fillText('episodes →', (w + pad.l) / 2, h - pad.b + 6)

			const lineColours = { q: '#f0883e', es: c.link }
			for (const agent of agents) {
				const avg = movingAverage(agent.returns, 10)
				if (avg.length < 2) continue
				ctx.strokeStyle = lineColours[agent.kind]
				ctx.lineWidth = 2
				ctx.beginPath()
				avg.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
				ctx.stroke()
			}

			// Legend
			ctx.textAlign = 'left'
			ctx.textBaseline = 'middle'
			let lx = pad.l + 8
			for (const agent of agents) {
				ctx.fillStyle = lineColours[agent.kind]
				ctx.fillRect(lx, pad.t + 8, 14, 3)
				ctx.fillStyle = c.text
				const label = agent.kind === 'q' ? 'Q-learning' : 'Expected Sarsa'
				ctx.fillText(label, lx + 20, pad.t + 9)
				lx += ctx.measureText(label).width + 40
			}
		}

		// ---------- loop ----------

		let agents = []
		let running = false
		let raf = 0
		let budget = 0

		function stepsPerFrame() {
			const s = Number(speedEl.value)
			return s < 30 ? s / 60 : Math.round(Math.pow(10, (s - 30) / 70 * 3.3))
		}

		function draw() {
			const c = colours()
			const slow = stepsPerFrame() < 4
			boards.forEach((b, i) => drawBoard(b, agents[i], c, slow))
			drawChart(c)
		}

		function frame() {
			if (!running) return
			budget += stepsPerFrame()
			while (budget >= 1) {
				budget--
				agents.forEach(agentStep)
			}
			draw()
			if (agents.every(a => a.returns.length >= MAX_EPISODES)) {
				running = false
				runBtn.textContent = '✓ Done'
				runBtn.disabled = true
				return
			}
			raf = requestAnimationFrame(frame)
		}

		function reset() {
			running = false
			cancelAnimationFrame(raf)
			agents = [makeAgent('q'), makeAgent('es')]
			budget = 0
			runBtn.disabled = false
			runBtn.textContent = '▶ Train'
			draw()
		}

		runBtn.addEventListener('click', () => {
			running = !running
			runBtn.textContent = running ? '❚❚ Pause' : '▶ Resume'
			if (running) raf = requestAnimationFrame(frame)
		})
		root.querySelector('.cw-reset').addEventListener('click', reset)
		epsEl.addEventListener('input', () => {
			epsilon = Number(epsEl.value) / 100
			root.querySelector('.cw-eps-val').textContent = epsilon.toFixed(2)
		})
		alphaEl.addEventListener('input', () => {
			alpha = Number(alphaEl.value) / 100
			root.querySelector('.cw-alpha-val').textContent = alpha.toFixed(2)
		})

		const resize = new ResizeObserver(() => { if (!running) draw() })
		resize.observe(root)

		reset()

		return () => {
			running = false
			cancelAnimationFrame(raf)
			resize.disconnect()
		}
	},
}
