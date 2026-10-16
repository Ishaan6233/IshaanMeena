// Spam / phishing message detection, following Ishaan6233/Phishing-Detection-ML:
// bag-of-words counts (like scikit-learn's CountVectorizer) + L2-regularised logistic regression (C = 1),
// trained in the browser on the repo's spam.csv and scored on a held-out 20% split.
window.DEMOS = window.DEMOS || {}

;(function () {
	const U = window.MLUtils
	// CountVectorizer's default token pattern: words of 2+ characters, lowercased
	const TOKEN = /\b\w\w+\b/gu
	const tokenize = text => (text.toLowerCase().match(TOKEN) || [])

	function featurize(tokens, vocab) {
		const counts = new Map()
		for (const t of tokens) {
			const j = vocab.get(t)
			if (j !== undefined) counts.set(j, (counts.get(j) || 0) + 1)
		}
		return counts
	}

	// Minimises 0.5·||w||² + C·Σ log-loss (scikit-learn's objective) with Adam on full batches
	async function trainLogReg(docs, labels, dims, C, onProgress) {
		const w = new Float64Array(dims)
		let b = 0
		const m = new Float64Array(dims), v = new Float64Array(dims)
		let mb = 0, vb = 0
		const lr = 0.05, beta1 = 0.9, beta2 = 0.999, eps = 1e-8
		const iterations = 300
		const grad = new Float64Array(dims)
		for (let it = 1; it <= iterations; it++) {
			for (let j = 0; j < dims; j++) grad[j] = w[j]
			let gb = 0
			for (let i = 0; i < docs.length; i++) {
				let z = b
				for (const [j, x] of docs[i]) z += w[j] * x
				const err = C * (U.sigmoid(z) - labels[i])
				for (const [j, x] of docs[i]) grad[j] += err * x
				gb += err
			}
			for (let j = 0; j < dims; j++) {
				m[j] = beta1 * m[j] + (1 - beta1) * grad[j]
				v[j] = beta2 * v[j] + (1 - beta2) * grad[j] * grad[j]
				w[j] -= lr * (m[j] / (1 - beta1 ** it)) / (Math.sqrt(v[j] / (1 - beta2 ** it)) + eps)
			}
			mb = beta1 * mb + (1 - beta1) * gb
			vb = beta2 * vb + (1 - beta2) * gb * gb
			b -= lr * (mb / (1 - beta1 ** it)) / (Math.sqrt(vb / (1 - beta2 ** it)) + eps)
			if (it % 25 === 0) {
				onProgress && onProgress(it / iterations)
				await U.nextFrame()
			}
		}
		return { w, b }
	}

	async function train(onProgress) {
		const buffer = await fetch('demos/data/spam.csv').then(r => {
			if (!r.ok) throw new Error('HTTP ' + r.status)
			return r.arrayBuffer()
		})
		// The file is Latin-1 encoded (the notebook reads it with encoding='ISO-8859-1')
		const rows = U.parseCSV(new TextDecoder('windows-1252').decode(buffer)).slice(1)
		const seen = new Set()
		const data = []
		for (const r of rows) {
			const label = r[0] === 'spam' ? 1 : 0
			const text = r[1] || ''
			const key = r[0] + '\u0000' + text
			if (seen.has(key)) continue // df.drop_duplicates()
			seen.add(key)
			data.push({ text, label })
		}
		const { train, test } = U.split(data, d => d.label, 0.2, 3)

		const vocab = new Map()
		const trainTokens = train.map(d => tokenize(d.text))
		trainTokens.forEach(tokens => tokens.forEach(t => { if (!vocab.has(t)) vocab.set(t, vocab.size) }))
		const docs = trainTokens.map(tokens => Array.from(featurize(tokens, vocab)))
		const started = performance.now()
		const { w, b } = await trainLogReg(docs, train.map(d => d.label), vocab.size, 1, onProgress)
		const ms = performance.now() - started

		const model = { vocab, words: Array.from(vocab.keys()), w, b }
		const predicted = test.map(d => (predict(model, d.text).p >= 0.5 ? 1 : 0))
		model.metrics = U.metrics(test.map(d => d.label), predicted)
		model.info = { total: data.length, train: train.length, test: test.length, vocab: vocab.size, spamShare: data.filter(d => d.label).length / data.length, ms }
		return model
	}

	function predict(model, text) {
		const counts = featurize(tokenize(text), model.vocab)
		let z = model.b
		const contributions = new Map()
		for (const [j, x] of counts) {
			z += model.w[j] * x
		}

		for (const [j, x] of counts) contributions.set(model.words[j], model.w[j] * x)
		return { p: U.sigmoid(z), contributions }
	}

	let modelPromise = null
	const load = onProgress => (modelPromise = modelPromise || train(onProgress))

	window.DEMOS.spam = {
		title: 'Spam / Phishing Detector',
		tagline: 'Logistic regression on 5k messages',
		icon: '📧',
		blurb: 'Paste a message and a logistic-regression classifier decides whether it is spam or phishing, highlighting the words that tipped the decision.',
		note: 'Same pipeline as my notebook (bag-of-words counts + logistic regression, C = 1) on the repo’s dataset, the SMS Spam Collection, trained in your browser. The accuracy shown is measured only on held-out messages the model never saw.',

		mount(root) {
			const EXAMPLES = [
				['Prize scam', 'Congratulations! You\'ve won a free ticket to Bahamas. Call now to claim your prize.'],
				['Phishing', 'URGENT: your account has been suspended. Verify your details now to avoid closure. Reply STOP to opt out.'],
				['Friend', 'Hey, are we still meeting for lunch tomorrow at 12? Let me know if that works.'],
				['Work', 'Can you send me the slides from today\'s lecture before tonight? Thanks!'],
			]
			root.innerHTML = `
				<label class="sr-only" for="spam-input">Message</label>
				<textarea id="spam-input" class="demo-input" rows="3">${U.esc(EXAMPLES[0][1])}</textarea>
				<div class="demo-chips">${EXAMPLES.map(([label], i) => `<button type="button" class="demo-chip" data-i="${i}">${label}</button>`).join('')}</div>
				<p class="demo-status spam-status">Training on the dataset…</p>
				<div class="sent-result spam-result" hidden>
					<div class="sent-verdict"><span class="sent-label"></span><span class="sent-prob"></span></div>
					<div class="sent-meter spam-meter" aria-hidden="true"><span></span></div>
					<p class="sent-highlight"></p>
				</div>
				<div class="ml-metrics" hidden></div>`

			const input = root.querySelector('#spam-input')
			const status = root.querySelector('.spam-status')
			const result = root.querySelector('.spam-result')
			let model = null
			let timer = 0
			let cancelled = false

			function run() {
				if (!model) return
				const text = input.value
				if (!text.trim()) { result.hidden = true; return }
				const { p, contributions } = predict(model, text)
				const spam = p >= 0.5
				result.hidden = false
				result.classList.toggle('is-positive', !spam)
				result.classList.toggle('is-negative', spam)
				root.querySelector('.sent-label').textContent = spam ? '🚩 Spam / phishing' : '✅ Looks legitimate'
				root.querySelector('.sent-prob').textContent = `${U.pct(spam ? p : 1 - p)} confidence`
				root.querySelector('.spam-meter span').style.width = U.pct(1 - p)
				root.querySelector('.sent-highlight').innerHTML = text.split(/(\s+)/).map(part => {
					const weight = tokenize(part).reduce((s, t) => s + (contributions.get(t) || 0), 0)
					if (Math.abs(weight) < 0.15) return U.esc(part)
					const a = 0.15 + 0.6 * Math.min(1, Math.abs(weight) / 2)
					const colour = weight > 0 ? `rgba(229, 57, 59, ${a})` : `rgba(46, 160, 67, ${a})`
					return `<mark style="background:${colour}" title="weight ${weight.toFixed(2)}">${U.esc(part)}</mark>`
				}).join('')
			}

			input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120) })
			root.querySelector('.demo-chips').addEventListener('click', e => {
				const chip = e.target.closest('.demo-chip')
				if (!chip) return
				input.value = EXAMPLES[Number(chip.dataset.i)][1]
				run()
			})

			load(f => { if (!cancelled) status.textContent = `Training logistic regression… ${Math.round(f * 100)}%` })
				.then(m => {
					if (cancelled) return
					model = m
					const { info, metrics: mt } = m
					status.textContent = `Trained on ${info.train.toLocaleString()} messages (${info.vocab.toLocaleString()}-word vocabulary) in ${(info.ms / 1000).toFixed(1)} s.`
					const box = root.querySelector('.ml-metrics')
					box.hidden = false
					box.innerHTML = `
						<div><strong>${U.pct(mt.accuracy)}</strong><span>held-out accuracy</span></div>
						<div><strong>${U.pct(mt.precision)}</strong><span>spam precision</span></div>
						<div><strong>${U.pct(mt.recall)}</strong><span>spam recall</span></div>
						<table class="ml-confusion" aria-label="Confusion matrix on ${mt.total} held-out messages">
							<tr><th></th><th>predicted ham</th><th>predicted spam</th></tr>
							<tr><th>actual ham</th><td>${mt.tn}</td><td>${mt.fp}</td></tr>
							<tr><th>actual spam</th><td>${mt.fn}</td><td>${mt.tp}</td></tr>
						</table>`
					run()
				})
				.catch(err => { status.textContent = 'Could not train the model (' + err.message + ').' })

			return () => { cancelled = true; clearTimeout(timer) }
		},
	}
})()
