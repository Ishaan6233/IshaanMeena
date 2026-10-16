// Heart-disease risk, following Ishaan6233/Heart-Disease-Detection-ML: the notebook's three strongest
// model families with its tuned hyper-parameters, trained in the browser on the repo's CSV:
//   Random Forest (100 trees, sqrt features, min_samples_split 5, no bootstrap)
//   K-Nearest Neighbours (k = 19, distance-weighted)
//   Logistic Regression (L1, C = 0.1)
// Educational only: not medical advice.
window.DEMOS = window.DEMOS || {}

;(function () {
	const U = window.MLUtils

	const FEATURES = [
		{ key: 'age', label: 'Age', type: 'range', min: 28, max: 77, step: 1, unit: 'years' },
		{ key: 'sex', label: 'Sex', type: 'select', options: [[1, 'Male'], [0, 'Female']] },
		{ key: 'chest pain type', label: 'Chest pain', type: 'select', options: [[1, 'Typical angina'], [2, 'Atypical angina'], [3, 'Non-anginal pain'], [4, 'No symptoms']] },
		{ key: 'resting bp s', label: 'Resting blood pressure', type: 'range', min: 80, max: 200, step: 1, unit: 'mm Hg' },
		{ key: 'cholesterol', label: 'Cholesterol', type: 'range', min: 0, max: 600, step: 1, unit: 'mg/dl' },
		{ key: 'fasting blood sugar', label: 'Fasting blood sugar > 120 mg/dl', type: 'select', options: [[0, 'No'], [1, 'Yes']] },
		{ key: 'resting ecg', label: 'Resting ECG', type: 'select', options: [[0, 'Normal'], [1, 'ST-T abnormality'], [2, 'LV hypertrophy']] },
		{ key: 'max heart rate', label: 'Max heart rate', type: 'range', min: 60, max: 202, step: 1, unit: 'bpm' },
		{ key: 'exercise angina', label: 'Exercise-induced angina', type: 'select', options: [[0, 'No'], [1, 'Yes']] },
		{ key: 'oldpeak', label: 'ST depression (oldpeak)', type: 'range', min: -2.6, max: 6.2, step: 0.1, unit: '' },
		{ key: 'ST slope', label: 'ST slope', type: 'select', options: [[1, 'Upsloping'], [2, 'Flat'], [3, 'Downsloping'], [0, 'Not recorded']] },
	]

	// ---------- models ----------

	function standardizer(X) {
		const d = X[0].length
		const mean = new Array(d).fill(0)
		const std = new Array(d).fill(0)
		X.forEach(x => x.forEach((v, j) => { mean[j] += v / X.length }))
		X.forEach(x => x.forEach((v, j) => { std[j] += (v - mean[j]) ** 2 / X.length }))
		for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1
		return x => x.map((v, j) => (v - mean[j]) / std[j])
	}

	// L1-regularised logistic regression: minimise ||w||₁ + C·Σ log-loss with FISTA
	function trainLogReg(X, y, C) {
		const n = X.length
		const d = X[0].length
		let w = new Array(d).fill(0), b = 0
		let zw = w.slice(), zb = 0, t = 1
		const L = 0.25 * C * n * (d + 1) // a safe Lipschitz bound for standardised features
		const step = 1 / L
		for (let it = 0; it < 1500; it++) {
			const g = new Array(d).fill(0)
			let gb = 0
			for (let i = 0; i < n; i++) {
				let s = zb
				for (let j = 0; j < d; j++) s += zw[j] * X[i][j]
				const err = C * (U.sigmoid(s) - y[i])
				for (let j = 0; j < d; j++) g[j] += err * X[i][j]
				gb += err
			}
			const nextW = zw.map((v, j) => {
				const u = v - step * g[j]
				return Math.sign(u) * Math.max(0, Math.abs(u) - step) // soft-threshold (L1)
			})
			const nextB = zb - step * gb
			const nextT = (1 + Math.sqrt(1 + 4 * t * t)) / 2
			zw = nextW.map((v, j) => v + ((t - 1) / nextT) * (v - w[j]))
			zb = nextB + ((t - 1) / nextT) * (nextB - b)
			w = nextW
			b = nextB
			t = nextT
		}
		return {
			w, b,
			proba: x => U.sigmoid(b + x.reduce((s, v, j) => s + v * w[j], 0)),
		}
	}

	function trainKNN(X, y, k) {
		return {
			proba(x) {
				const nearest = X.map((xi, i) => [Math.hypot(...xi.map((v, j) => v - x[j])), y[i]])
					.sort((a, b) => a[0] - b[0])
					.slice(0, k)
				const exact = nearest.filter(([d]) => d === 0)
				if (exact.length) return exact.reduce((s, [, c]) => s + c, 0) / exact.length
				let pos = 0, total = 0
				for (const [d, c] of nearest) { pos += c / d; total += 1 / d }
				return pos / total
			},
		}
	}

	// CART tree with Gini impurity, as scikit-learn's DecisionTreeClassifier
	function buildTree(X, y, idx, random, maxFeatures, minSplit) {
		const pos = idx.reduce((s, i) => s + y[i], 0)
		const node = { p: pos / idx.length }
		if (idx.length < minSplit || pos === 0 || pos === idx.length) return node

		const d = X[0].length
		const order = U.shuffle(Array.from({ length: d }, (_, j) => j), random)
		const gini = (p, n) => (n ? 1 - (p / n) ** 2 - (1 - p / n) ** 2 : 0)
		const parent = gini(pos, idx.length)
		let best = null
		// Try max_features random features; keep drawing if none of them can split (like scikit-learn)
		for (let f = 0; f < d && (f < maxFeatures || !best); f++) {
			const j = order[f]
			const sorted = idx.slice().sort((a, b) => X[a][j] - X[b][j])
			let leftPos = 0
			for (let k = 0; k < sorted.length - 1; k++) {
				leftPos += y[sorted[k]]
				const a = X[sorted[k]][j], c = X[sorted[k + 1]][j]
				if (a === c) continue
				const nl = k + 1, nr = sorted.length - nl
				const impurity = (nl * gini(leftPos, nl) + nr * gini(pos - leftPos, nr)) / sorted.length
				const gain = parent - impurity
				if (!best || gain > best.gain) best = { gain, j, threshold: (a + c) / 2 }
			}
		}
		if (!best || best.gain <= 1e-12) return node
		const left = idx.filter(i => X[i][best.j] <= best.threshold)
		const right = idx.filter(i => X[i][best.j] > best.threshold)
		node.j = best.j
		node.threshold = best.threshold
		node.left = buildTree(X, y, left, random, maxFeatures, minSplit)
		node.right = buildTree(X, y, right, random, maxFeatures, minSplit)
		return node
	}

	async function trainForest(X, y, trees, onProgress) {
		const random = U.rng(42)
		const maxFeatures = Math.max(1, Math.floor(Math.sqrt(X[0].length)))
		const all = X.map((_, i) => i)
		const forest = []
		for (let t = 0; t < trees; t++) {
			forest.push(buildTree(X, y, all, random, maxFeatures, 5)) // bootstrap=False: every tree sees all rows
			if (t % 10 === 9) {
				onProgress && onProgress((t + 1) / trees)
				await U.nextFrame()
			}
		}
		const leafP = (node, x) => (node.left ? leafP(x[node.j] <= node.threshold ? node.left : node.right, x) : node.p)
		return { proba: x => forest.reduce((s, tree) => s + leafP(tree, x), 0) / forest.length }
	}

	async function train(onProgress) {
		const text = await fetch('demos/data/heart.csv').then(r => {
			if (!r.ok) throw new Error('HTTP ' + r.status)
			return r.text()
		})
		const rows = U.parseCSV(text)
		const header = rows[0]
		const raw = rows.slice(1)
		// The combined dataset repeats 272 patients; drop exact duplicates so test patients are truly unseen
		const unique = Array.from(new Map(raw.map(r => [r.join(','), r])).values())
		const data = unique.map(r => ({ x: FEATURES.map(f => Number(r[header.indexOf(f.key)])), y: Number(r[header.indexOf('target')]) }))
		const { train, test } = U.split(data, d => d.y, 0.2, 42)
		const scale = standardizer(train.map(d => d.x))
		const Xtr = train.map(d => scale(d.x))
		const ytr = train.map(d => d.y)

		const started = performance.now()
		const models = {
			rf: { name: 'Random Forest', notebook: 0.9538, ...(await trainForest(Xtr, ytr, 100, onProgress)) },
			knn: { name: 'K-Nearest Neighbours', notebook: 0.9412, ...trainKNN(Xtr, ytr, 19) },
			lr: { name: 'Logistic Regression', notebook: 0.8529, ...trainLogReg(Xtr, ytr, 0.1) },
		}
		const ms = performance.now() - started

		for (const m of Object.values(models)) {
			m.metrics = U.metrics(test.map(d => d.y), test.map(d => (m.proba(scale(d.x)) >= 0.5 ? 1 : 0)))
		}

		// Two real patients from the held-out set as presets: one with disease, one without
		const presets = [test.find(d => d.y === 1), test.find(d => d.y === 0)].filter(Boolean)
		return { models, scale, presets, info: { raw: raw.length, unique: data.length, train: train.length, test: test.length, ms } }
	}

	let modelPromise = null
	const load = onProgress => (modelPromise = modelPromise || train(onProgress))

	window.DEMOS.heart = {
		title: 'Heart Disease Predictor',
		tagline: 'Random Forest · KNN · Logistic Regression',
		icon: '❤️',
		blurb: 'Adjust a patient’s measurements and compare how three classifiers from my project rate the risk of heart disease. The logistic-regression bars show which measurements drive its estimate.',
		note: 'Trained in your browser on the repo’s combined Cleveland/Hungary/Statlog dataset, using the hyper-parameters my grid search selected. Duplicate rows are removed before splitting, so the held-out scores are honest and lower than the notebook’s. <strong>Educational demo, not medical advice.</strong>',

		mount(root) {
			root.innerHTML = `
				<p class="demo-status heart-status">Training three models…</p>
				<div class="heart-layout" hidden>
					<form class="heart-form" aria-label="Patient measurements">
						<div class="demo-chips heart-presets"></div>
						${FEATURES.map((f, i) => `
							<label class="heart-field">
								<span>${f.label}</span>
								${f.type === 'range'
									? `<input type="range" data-i="${i}" min="${f.min}" max="${f.max}" step="${f.step}"><output data-i="${i}"></output>`
									: `<select data-i="${i}">${f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`}
							</label>`).join('')}
					</form>
					<div class="heart-results">
						<div class="heart-models" aria-live="polite"></div>
						<h4>What drives the logistic-regression estimate</h4>
						<div class="heart-drivers"></div>
						<h4>Held-out accuracy (this run vs. my notebook)</h4>
						<table class="heart-scores"></table>
					</div>
				</div>`

			const status = root.querySelector('.heart-status')
			const layout = root.querySelector('.heart-layout')
			const controls = Array.from(root.querySelectorAll('.heart-form [data-i]:not(output)'))
			let bundle = null
			let cancelled = false

			function values() {
				return FEATURES.map((_, i) => Number(controls[i].value))
			}

			function setValues(x) {
				x.forEach((v, i) => { controls[i].value = v })
				render()
			}

			function render() {
				if (!bundle) return
				const x = values()
				FEATURES.forEach((f, i) => {
					if (f.type === 'range') root.querySelector(`output[data-i="${i}"]`).textContent = `${x[i]}${f.unit ? ' ' + f.unit : ''}`
				})
				const z = bundle.scale(x)
				root.querySelector('.heart-models').innerHTML = Object.values(bundle.models).map(m => {
					const p = m.proba(z)
					return `<div class="heart-model">
						<span class="heart-model-name">${m.name}</span>
						<span class="heart-bar" aria-hidden="true"><i style="width:${(p * 100).toFixed(0)}%; background:${p >= 0.5 ? '#e5393b' : '#2ea043'}"></i></span>
						<strong>${(p * 100).toFixed(0)}%</strong>
					</div>`
				}).join('') + `<p class="demo-status">Estimated probability of heart disease from each model.</p>`

				const lr = bundle.models.lr
				const contributions = FEATURES.map((f, j) => [f.label, lr.w[j] * z[j]]).filter(([, c]) => Math.abs(c) > 0.01).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
				const max = Math.max(0.5, ...contributions.map(([, c]) => Math.abs(c)))
				root.querySelector('.heart-drivers').innerHTML = contributions.map(([label, c]) =>
					`<div class="heart-driver"><span>${label}</span><span class="heart-driver-bar"><i class="${c > 0 ? 'up' : 'down'}" style="width:${(Math.abs(c) / max * 50).toFixed(1)}%"></i></span><em>${c > 0 ? '↑ risk' : '↓ risk'}</em></div>`).join('')
					|| '<p class="demo-status">No single measurement stands out.</p>'
			}

			root.querySelector('.heart-form').addEventListener('input', render)

			load(f => { if (!cancelled) status.textContent = `Training the random forest… ${Math.round(f * 100)}%` })
				.then(b => {
					if (cancelled) return
					bundle = b
					const { info } = b
					status.textContent = `Trained on ${info.train} patients in ${(info.ms / 1000).toFixed(1)} s (${info.raw - info.unique} duplicate rows removed from ${info.raw}); scored on ${info.test} unseen patients.`
					layout.hidden = false
					root.querySelector('.heart-presets').innerHTML = b.presets.map((p, i) =>
						`<button type="button" class="demo-chip" data-preset="${i}">Real patient ${String.fromCharCode(65 + i)} (${p.y ? 'had' : 'no'} heart disease)</button>`).join('')
					root.querySelector('.heart-presets').addEventListener('click', e => {
						const chip = e.target.closest('[data-preset]')
						if (chip) setValues(b.presets[Number(chip.dataset.preset)].x)
					})
					root.querySelector('.heart-scores').innerHTML = `<tr><th>Model</th><th>This run</th><th>Notebook</th></tr>` +
						Object.values(b.models).map(m => `<tr><td>${m.name}</td><td>${U.pct(m.metrics.accuracy)}</td><td>${U.pct(m.notebook)}</td></tr>`).join('')
					setValues(b.presets[0] ? b.presets[0].x : [55, 1, 4, 130, 230, 0, 0, 140, 1, 1.5, 2])
				})
				.catch(err => { status.textContent = 'Could not train the models (' + err.message + ').' })

			return () => { cancelled = true }
		},
	}
})()
