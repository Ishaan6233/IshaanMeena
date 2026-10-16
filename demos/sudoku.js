// Sudoku backtracking visualizer: a JavaScript port of solver.java from Ishaan6233/Sudoku-Game.
// Cells are filled in row-major order trying 1..n; a value stays only if its row, column
// and box are still valid, otherwise the solver backtracks. Every try/undo is animated.
window.DEMOS = window.DEMOS || {}

window.DEMOS.sudoku = {
	title: 'Sudoku Solver',
	tagline: 'Backtracking, step by step',
	icon: '🔢',
	blurb: 'Watch the backtracking search from my Java Sudoku game fill the grid: every value it tries, and every time it has to undo a choice.',
	note: 'Ported from <code>solver.java</code>. Same search order and validity checks (row, column, box) as the original Swing app.',

	mount(root) {
		const PUZZLES = {
			// The original game's difficulty modes: random grids with a few pre-filled cells
			easy: { label: 'Easy 4×4 (random)', size: 4, givens: 4 },
			hard: { label: 'Hard 9×9 (random)', size: 9, givens: 16 },
			// A classic puzzle with a unique solution: makes the search work much harder
			classic: {
				label: 'Classic 9×9 puzzle',
				size: 9,
				grid: '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
			},
			tough: {
				label: 'Tough 9×9 (lots of backtracking)',
				size: 9,
				grid: '000000010400000000020000000000050407008000300001090000300400200050100000000806000',
			},
		}

		root.innerHTML = `
			<div class="demo-controls">
				<label>Puzzle
					<select class="sd-puzzle">${Object.entries(PUZZLES).map(([k, p]) => `<option value="${k}"${k === 'classic' ? ' selected' : ''}>${p.label}</option>`).join('')}</select>
				</label>
				<button type="button" class="demo-btn sd-new">New puzzle</button>
				<label>Speed
					<input type="range" class="sd-speed" min="0" max="100" value="55" aria-label="Animation speed">
				</label>
				<button type="button" class="demo-btn primary sd-run">▶ Solve</button>
				<button type="button" class="demo-btn sd-instant">Solve instantly</button>
			</div>
			<div class="sd-layout">
				<div class="sd-grid" role="grid" aria-label="Sudoku grid"></div>
				<dl class="demo-stats">
					<div><dt>Values tried</dt><dd class="sd-tries">0</dd></div>
					<div><dt>Backtracks</dt><dd class="sd-backs">0</dd></div>
					<div><dt>Status</dt><dd class="sd-status">Ready</dd></div>
					<div class="sd-legend">
						<span><i class="sd-swatch given"></i>Given</span>
						<span><i class="sd-swatch trying"></i>Trying</span>
						<span><i class="sd-swatch back"></i>Undone</span>
					</div>
				</dl>
			</div>`

		const gridEl = root.querySelector('.sd-grid')
		const puzzleSel = root.querySelector('.sd-puzzle')
		const speedEl = root.querySelector('.sd-speed')
		const runBtn = root.querySelector('.sd-run')
		const triesEl = root.querySelector('.sd-tries')
		const backsEl = root.querySelector('.sd-backs')
		const statusEl = root.querySelector('.sd-status')

		let size = 9
		let box = 3
		let grid = []
		let givens = []
		let cells = []
		let solver = null
		let raf = 0
		let running = false
		let tries = 0
		let backs = 0

		// ---------- the solver (port of solver.java) ----------

		function valid(g, i, j) {
			const v = g[i][j]
			for (let c = 0; c < size; c++) if (c !== j && g[i][c] === v) return false
			for (let r = 0; r < size; r++) if (r !== i && g[r][j] === v) return false
			const bi = Math.floor(i / box) * box
			const bj = Math.floor(j / box) * box
			for (let r = bi; r < bi + box; r++)
				for (let c = bj; c < bj + box; c++)
					if ((r !== i || c !== j) && g[r][c] === v) return false
			return true
		}

		// Generator version of solveAndGetFirstSolution so each step can be shown
		function* solve(g, i, j) {
			if (j === size) { i++; j = 0 }
			if (i === size) return true
			if (g[i][j] !== 0) return yield* solve(g, i, j + 1)
			for (let v = 1; v <= size; v++) {
				g[i][j] = v
				yield { type: 'try', i, j, v }
				if (valid(g, i, j) && (yield* solve(g, i, j + 1))) return true
			}
			// Every value failed here: clear the cell and let the previous cell try its next value
			g[i][j] = 0
			yield { type: 'back', i, j }
			return false
		}

		// ---------- puzzles ----------

		function shuffled(n) {
			const a = Array.from({ length: n }, (_, k) => k + 1)
			for (let k = a.length - 1; k > 0; k--) {
				const r = Math.floor(Math.random() * (k + 1));
				[a[k], a[r]] = [a[r], a[k]]
			}
			return a
		}

		// Like the original game: build a full random grid, then keep a few cells
		function randomPuzzle(n, keep) {
			const g = Array.from({ length: n }, () => Array(n).fill(0))
			const fill = (k) => {
				if (k === n * n) return true
				const i = Math.floor(k / n), j = k % n
				for (const v of shuffled(n)) {
					g[i][j] = v
					if (valid(g, i, j) && fill(k + 1)) return true
				}
				g[i][j] = 0
				return false
			}
			fill(0)
			const positions = shuffled(n * n).map(p => p - 1).slice(keep)
			for (const p of positions) g[Math.floor(p / n)][p % n] = 0
			return g
		}

		function load() {
			stopRun()
			const p = PUZZLES[puzzleSel.value]
			size = p.size
			box = Math.sqrt(size)
			grid = p.grid
				? Array.from({ length: size }, (_, i) => Array.from(p.grid.slice(i * size, (i + 1) * size), Number))
				: randomPuzzle(size, p.givens)
			givens = grid.map(row => row.map(v => v !== 0))
			solver = null
			tries = 0
			backs = 0
			root.querySelector('.sd-new').hidden = !!p.grid
			render()
			setStatus('Ready')
		}

		function render() {
			gridEl.style.setProperty('--n', size)
			gridEl.style.setProperty('--box', box)
			gridEl.innerHTML = ''
			cells = []
			for (let i = 0; i < size; i++) {
				const row = []
				for (let j = 0; j < size; j++) {
					const cell = document.createElement('div')
					cell.className = 'sd-cell'
					cell.setAttribute('role', 'gridcell')
					if (givens[i][j]) cell.classList.add('given')
					if ((j + 1) % box === 0 && j !== size - 1) cell.classList.add('box-right')
					if ((i + 1) % box === 0 && i !== size - 1) cell.classList.add('box-bottom')
					cell.textContent = grid[i][j] || ''
					gridEl.appendChild(cell)
					row.push(cell)
				}
				cells.push(row)
			}
			updateStats()
		}

		function updateStats() {
			triesEl.textContent = tries.toLocaleString()
			backsEl.textContent = backs.toLocaleString()
		}

		function setStatus(text) {
			statusEl.textContent = text
		}

		// ---------- animation ----------

		let lastTrying = null

		function apply(step) {
			const cell = cells[step.i][step.j]
			if (lastTrying && lastTrying !== cell) lastTrying.classList.remove('trying')
			if (step.type === 'try') {
				tries++
				cell.textContent = step.v
				cell.classList.remove('back')
				cell.classList.add('trying', 'filled')
				lastTrying = cell
			} else {
				backs++
				cell.textContent = ''
				cell.classList.remove('trying', 'filled')
				cell.classList.add('back')
			}
		}

		// Speed slider: 0 = one step every few frames, 100 = thousands of steps per frame
		function stepsPerFrame() {
			const s = Number(speedEl.value)
			return s < 20 ? (s / 20) : Math.round(Math.pow(10, (s - 20) / 80 * 3.5))
		}

		let budget = 0
		function frame() {
			if (!running) return
			budget += stepsPerFrame()
			while (budget >= 1) {
				budget--
				const { value, done } = solver.next()
				if (done) {
					finish(value)
					return
				}
				apply(value)
			}
			updateStats()
			raf = requestAnimationFrame(frame)
		}

		function finish(solved) {
			running = false
			updateStats()
			if (lastTrying) lastTrying.classList.remove('trying')
			gridEl.classList.toggle('solved', !!solved)
			setStatus(solved ? `Solved after ${tries.toLocaleString()} tries` : 'No solution exists')
			runBtn.textContent = '▶ Solve'
			runBtn.disabled = true
			solver = null
		}

		function stopRun() {
			running = false
			cancelAnimationFrame(raf)
			gridEl.classList.remove('solved')
			runBtn.disabled = false
			runBtn.textContent = '▶ Solve'
		}

		function startOrPause() {
			if (running) {
				running = false
				cancelAnimationFrame(raf)
				runBtn.textContent = '▶ Resume'
				setStatus('Paused')
				return
			}
			if (!solver) solver = solve(grid, 0, 0)
			running = true
			runBtn.textContent = '❚❚ Pause'
			setStatus('Searching…')
			raf = requestAnimationFrame(frame)
		}

		// Runs the rest of the search without drawing, in chunks so the page never freezes
		function solveInstantly() {
			stopRun()
			if (!solver) solver = solve(grid, 0, 0)
			running = true
			runBtn.disabled = true
			const started = performance.now()
			const chunk = () => {
				if (!running) return
				const until = performance.now() + 12
				while (performance.now() < until) {
					for (let k = 0; k < 2000; k++) {
						const { value, done } = solver.next()
						if (done) return complete(value)
						if (value.type === 'try') tries++
						else backs++
					}
				}
				updateStats()
				setStatus(`Searching… ${tries.toLocaleString()} tries`)
				raf = requestAnimationFrame(chunk)
			}
			const complete = (result) => {
				const ms = performance.now() - started
				for (let i = 0; i < size; i++)
					for (let j = 0; j < size; j++) {
						cells[i][j].textContent = grid[i][j] || ''
						cells[i][j].classList.remove('trying', 'back')
						if (!givens[i][j] && grid[i][j]) cells[i][j].classList.add('filled')
					}
				finish(result)
				setStatus(result ? `Solved in ${ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'} (${tries.toLocaleString()} tries)` : 'No solution exists')
			}
			chunk()
		}

		puzzleSel.addEventListener('change', load)
		root.querySelector('.sd-new').addEventListener('click', load)
		runBtn.addEventListener('click', startOrPause)
		root.querySelector('.sd-instant').addEventListener('click', solveInstantly)

		load()

		return () => {
			running = false
			cancelAnimationFrame(raf)
		}
	},
}
