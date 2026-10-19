// Relation extraction with Naive Bayes, ported from Ishaan6233/Naive-Bayes-Classifier: given a sentence
// with a HEAD and TAIL entity, predict the relation (characters, director, performer, publisher).
// Same pipeline as src/main.py (entity tags, NLTK stopwords, Laplace smoothing) and the improved variant
// (src/improved.py: + word bigrams, drop features seen fewer than 3 times). Trained in the browser.
window.DEMOS = window.DEMOS || {}

;(function () {
	const U = window.MLUtils
	// NLTK English stopword list
	const STOP = new Set(("i me my myself we our ours ourselves you you're you've you'll you'd your yours yourself yourselves he him his himself she she's her hers herself it it's its itself they them their theirs themselves what which who whom this that that'll these those am is are was were be been being have has had having do does did doing a an the and but if or because as until while of at by for with about against between into through during before after above below to from up down in out on off over under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very s t can will just don don't should should've now d ll m o re ve y ain aren aren't couldn couldn't didn didn't doesn doesn't hadn hadn't hasn hasn't haven haven't isn isn't ma mightn mightn't mustn mustn't needn needn't shan shan't shouldn shouldn't wasn wasn't weren weren't won won't wouldn wouldn't").split(' '))
	const LABELS = { characters: '🎭 characters', director: '🎬 director', performer: '🎤 performer', publisher: '📚 publisher' }

	function parseRows(text) {
		const rows = U.parseCSV(text)
		const header = rows[0]
		const col = name => header.indexOf(name)
		return rows.slice(1).filter(r => r.length >= 5).map(r => ({
			tokens: r[col('tokens')].split(' '),
			relation: r[col('relation')],
			head: r[col('head_pos')].split(' ').map(Number),
			tail: r[col('tail_pos')].split(' ').map(Number),
		}))
	}

	// preprocess_data: tag the first/last token of each entity
	function tagged(row) {
		const t = row.tokens.slice()
		t[row.head[0]] = '<HEAD>' + t[row.head[0]]
		t[row.head[row.head.length - 1]] = t[row.head[row.head.length - 1]] + '</HEAD>'
		if (!(row.tail.length === 1 && row.tail[0] === 0)) {
			t[row.tail[0]] = '<TAIL>' + t[row.tail[0]]
			t[row.tail[row.tail.length - 1]] = t[row.tail[row.tail.length - 1]] + '</TAIL>'
		}
		return t
	}

	function features(row, improved) {
		const words = tagged(row).filter(w => !STOP.has(w.toLowerCase()))
		if (!improved) return words
		const out = words.slice()
		for (let i = 0; i < words.length - 1; i++) out.push(words[i] + ' ' + words[i + 1])
		return out
	}

	function train(rows, improved) {
		const docs = rows.map(r => features(r, improved))
		let rare = null
		if (improved) {
			const freq = new Map()
			docs.forEach(d => d.forEach(f => freq.set(f, (freq.get(f) || 0) + 1)))
			rare = new Set([...freq].filter(([, c]) => c < 3).map(([f]) => f))
		}
		const classes = [...new Set(rows.map(r => r.relation))].sort()
		const counts = Object.fromEntries(classes.map(c => [c, new Map()]))
		const totals = Object.fromEntries(classes.map(c => [c, 0]))
		const vocab = new Set()
		docs.forEach((d, i) => {
			const c = rows[i].relation
			for (const f of d) {
				if (rare && rare.has(f)) continue
				counts[c].set(f, (counts[c].get(f) || 0) + 1)
				totals[c]++
				vocab.add(f)
			}
		})
		const n = rows.length
		const prior = Object.fromEntries(classes.map(c => [c, (rows.filter(r => r.relation === c).length + 1) / (n + classes.length)]))
		return { classes, counts, totals, vocab, prior, rare, improved }
	}

	function predict(m, row) {
		const feats = features(row, m.improved).filter(f => m.vocab.has(f) && !(m.rare && m.rare.has(f)))
		const V = m.vocab.size
		const scores = {}
		const contrib = new Map()
		for (const c of m.classes) {
			let s = Math.log(m.prior[c])
			for (const f of feats) s += Math.log(((m.counts[c].get(f) || 0) + 1) / (m.totals[c] + V))
			scores[c] = s
		}
		const best = m.classes.reduce((a, b) => (scores[a] >= scores[b] ? a : b))
		// Which features most favour the winner over the runner-up
		const runner = m.classes.filter(c => c !== best).reduce((a, b) => (scores[a] >= scores[b] ? a : b))
		for (const f of feats) {
			const lp = c => Math.log(((m.counts[c].get(f) || 0) + 1) / (m.totals[c] + V))
			contrib.set(f, (contrib.get(f) || 0) + lp(best) - lp(runner))
		}
		const max = Math.max(...Object.values(scores))
		const z = Object.values(scores).reduce((s, v) => s + Math.exp(v - max), 0)
		const probs = Object.fromEntries(m.classes.map(c => [c, Math.exp(scores[c] - max) / z]))
		return { best, probs, contrib }
	}

	function accuracy(m, rows) {
		return rows.filter(r => predict(m, r).best === r.relation).length / rows.length
	}

	let dataPromise = null
	const loadData = () => (dataPromise = dataPromise || Promise.all(['relation-train', 'relation-test'].map(f =>
		fetch(`demos/data/${f}.csv`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text() }).then(parseRows))))

	window.DEMOS.relation = {
		title: 'Relation Extraction',
		tagline: 'Naive Bayes on entity pairs',
		icon: '🔗',
		blurb: 'Given a sentence and two highlighted entities, a Naive Bayes classifier decides how they are related: director, performer, publisher or characters. Pick a test sentence, or write your own and mark the entities.',
		note: 'Port of my <code>main.py</code> (entity tags, NLTK stopwords, Laplace smoothing) and <code>improved.py</code> (adds word bigrams, drops features seen fewer than 3 times), trained in your browser on the project’s 2,000 labelled sentences and scored on its 400 held-out test sentences. Interestingly, the “improved” variant scores slightly lower here: with only 2,000 sentences, bigrams mostly add sparse features.',

		mount(root) {
			root.innerHTML = `
				<div class="demo-controls">
					<label><input type="radio" name="re-model" value="basic" checked> Original (unigrams)</label>
					<label><input type="radio" name="re-model" value="improved"> “Improved” (+ bigrams)</label>
					<button type="button" class="demo-btn re-next">🎲 Random test sentence</button>
				</div>
				<p class="demo-status re-status">Training…</p>
				<div class="re-sentence" aria-live="polite"></div>
				<details class="pos-trellis-wrap re-own">
					<summary>Try your own sentence</summary>
					<label class="re-field">Sentence <input class="demo-input re-text" value="Inception is a 2010 science fiction film directed by Christopher Nolan ."></label>
					<label class="re-field">Head entity (the thing) <input class="demo-input re-head" value="Inception"></label>
					<label class="re-field">Tail entity (the person / company) <input class="demo-input re-tail" value="Christopher Nolan"></label>
					<p><button type="button" class="demo-btn primary re-classify">Classify</button> <span class="demo-status re-own-status"></span></p>
				</details>
				<div class="re-result" aria-live="polite"></div>`

			const status = root.querySelector('.re-status')
			let models = null
			let test = []
			let current = null
			let cancelled = false

			const model = () => models[root.querySelector('input[name="re-model"]:checked').value]

			function showSentence(row) {
				const head = new Set(row.head)
				const tail = row.tail.length === 1 && row.tail[0] === 0 ? new Set() : new Set(row.tail)
				root.querySelector('.re-sentence').innerHTML = `<p class="re-text-line">${row.tokens.map((t, i) =>
					`<span class="${head.has(i) ? 're-head' : tail.has(i) ? 're-tail' : ''}">${U.esc(t)}</span>`).join(' ')}</p>
					<p class="demo-status"><span class="re-head">head</span> <span class="re-tail">tail</span>${row.relation ? ` · true relation: <b>${U.esc(row.relation)}</b>` : ''}</p>`
			}

			function classify(row) {
				current = row
				showSentence(row)
				const { best, probs, contrib } = predict(model(), row)
				const ranked = Object.entries(probs).sort((a, b) => b[1] - a[1])
				const top = [...contrib].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
				const correct = row.relation ? (best === row.relation ? ' <span class="re-ok">✓ correct</span>' : ' <span class="re-bad">✗ wrong</span>') : ''
				root.querySelector('.re-result').innerHTML = `
					<div class="sent-result">
						<div class="sent-verdict"><span class="sent-label">${LABELS[best] || U.esc(best)}</span>${correct}</div>
						${ranked.map(([c, p]) => `<div class="heart-model"><span class="heart-model-name">${LABELS[c] || U.esc(c)}</span><span class="heart-bar"><i style="width:${(p * 100).toFixed(0)}%; background:${c === best ? 'var(--linkColor)' : '#6e7781'}"></i></span><strong>${(p * 100).toFixed(0)}%</strong></div>`).join('')}
						<h4 class="gr-heading">Strongest evidence</h4>
						<p class="demo-status">${top.map(([f]) => `<code>${U.esc(f)}</code>`).join(' · ') || 'no strongly indicative words'}</p>
					</div>`
			}

			function randomTest() {
				if (test.length) classify(test[Math.floor(Math.random() * test.length)])
			}

			// Find an entity's token span in a user sentence (case-insensitive)
			function span(tokens, phrase) {
				const p = phrase.trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase())
				if (!p.length) return null
				for (let i = 0; i + p.length <= tokens.length; i++) {
					if (p.every((w, j) => tokens[i + j].toLowerCase() === w)) return p.map((_, j) => i + j)
				}
				return null
			}

			root.querySelector('.re-next').addEventListener('click', randomTest)
			root.querySelectorAll('input[name="re-model"]').forEach(r => r.addEventListener('change', () => current && classify(current)))
			root.querySelector('.re-classify').addEventListener('click', () => {
				const note = root.querySelector('.re-own-status')
				// Tokenize like the dataset: punctuation as separate tokens
				const tokens = root.querySelector('.re-text').value.replace(/([.,;:!?()"])/g, ' $1 ').split(/\s+/).filter(Boolean)
				const head = span(tokens, root.querySelector('.re-head').value)
				const tail = span(tokens, root.querySelector('.re-tail').value)
				if (!head || !tail) {
					note.textContent = `Couldn’t find the ${!head ? 'head' : 'tail'} entity in the sentence.`
					return
				}
				note.textContent = ''
				classify({ tokens, head, tail, relation: null })
			})

			loadData()
				.then(([trainRows, testRows]) => {
					if (cancelled) return
					const t0 = performance.now()
					models = { basic: train(trainRows, false), improved: train(trainRows, true) }
					test = testRows
					const acc = { basic: accuracy(models.basic, testRows), improved: accuracy(models.improved, testRows) }
					status.textContent = `Trained on ${trainRows.length.toLocaleString()} sentences in ${Math.round(performance.now() - t0)} ms · held-out test accuracy: original ${U.pct(acc.basic)}, improved ${U.pct(acc.improved)} (${testRows.length} sentences)`
					randomTest()
				})
				.catch(err => { status.textContent = 'Could not load the data (' + err.message + ').' })

			return () => { cancelled = true }
		},
	}
})()
