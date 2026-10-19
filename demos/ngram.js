// Phonetic n-grams, from Ishaan6233/Phonetic-Sequence-Modeling-with-N-grams: unigram, bigram and trigram
// models (Laplace smoothing) over ARPAbet phonemes from CHILDES child-directed speech. Counts are
// precomputed (demos/data/phoneme-ngrams.json); scoring and sampling happen in the browser.
window.DEMOS = window.DEMOS || {}

;(function () {
	const U = window.MLUtils

	// A small pronunciation dictionary (CMUdict-style ARPAbet) so visitors can type words
	const LEXICON = {
		a: 'AH0', and: 'AH0 N D', apple: 'AE1 P AH0 L', baby: 'B EY1 B IY0', ball: 'B AO1 L', banana: 'B AH0 N AE1 N AH0',
		big: 'B IH1 G', birthday: 'B ER1 TH D EY2', blue: 'B L UW1', book: 'B UH1 K', can: 'K AE1 N', car: 'K AA1 R',
		cat: 'K AE1 T', come: 'K AH1 M', computer: 'K AH0 M P Y UW1 T ER0', cookie: 'K UH1 K IY0', daddy: 'D AE1 D IY0',
		data: 'D EY1 T AH0', do: 'D UW1', dog: 'D AO1 G', eat: 'IY1 T', friend: 'F R EH1 N D', fun: 'F AH1 N',
		go: 'G OW1', good: 'G UH1 D', happy: 'HH AE1 P IY0', have: 'HH AE1 V', hello: 'HH AH0 L OW1', here: 'HH IY1 R',
		house: 'HH AW1 S', i: 'AY1', is: 'IH1 Z', it: 'IH1 T', juice: 'JH UW1 S', language: 'L AE1 NG G W AH0 JH',
		learning: 'L ER1 N IH0 NG', little: 'L IH1 T AH0 L', look: 'L UH1 K', love: 'L AH1 V', machine: 'M AH0 SH IY1 N',
		me: 'M IY1', milk: 'M IH1 L K', model: 'M AA1 D AH0 L', mommy: 'M AA1 M IY0', morning: 'M AO1 R N IH0 NG',
		music: 'M Y UW1 Z IH0 K', my: 'M AY1', night: 'N AY1 T', no: 'N OW1', play: 'P L EY1', please: 'P L IY1 Z',
		read: 'R IY1 D', red: 'R EH1 D', river: 'R IH1 V ER0', school: 'S K UW1 L', science: 'S AY1 AH0 N S',
		see: 'S IY1', thank: 'TH AE1 NG K', that: 'DH AE1 T', the: 'DH AH0', there: 'DH EH1 R', this: 'DH IH1 S',
		to: 'T UW1', truck: 'T R AH1 K', want: 'W AA1 N T', water: 'W AO1 T ER0', we: 'W IY1', what: 'W AH1 T',
		world: 'W ER1 L D', yes: 'Y EH1 S', you: 'Y UW1',
	}
	const EXAMPLES = [
		['English sentence', 'do you want a cookie'],
		['English-like nonword', 'B L IH1 K'],
		['Impossible in English', 'NG B ZH IY1 T'],
		['Tech words', 'machine learning model'],
	]
	const ORDERS = ['unigram', 'bigram', 'trigram']

	function esc(s) { return U.esc(s) }

	let modelPromise = null
	function load() {
		modelPromise = modelPromise || fetch('demos/data/phoneme-ngrams.json').then(r => {
			if (!r.ok) throw new Error('HTTP ' + r.status)
			return r.json()
		}).then(m => {
			// Context totals for bigrams and trigrams
			m.ctx1 = {}
			for (const [k, c] of Object.entries(m.bi)) { const a = k.split(' ')[0]; m.ctx1[a] = (m.ctx1[a] || 0) + c }
			m.ctx2 = {}
			for (const [k, c] of Object.entries(m.tri)) { const p = k.split(' '); const ctx = p[0] + ' ' + p[1]; m.ctx2[ctx] = (m.ctx2[ctx] || 0) + c }
			m.phonemes = Object.keys(m.uni)
			m.V = m.phonemes.length + 1 // + </s>, as in training
			return m
		})
		return modelPromise
	}

	// Laplace-smoothed probability of the i-th symbol under each order (same formulas as the project)
	function probs(m, w, i) {
		const x = w[i]
		return {
			unigram: ((m.uni[x] || 0) + 1) / (m.total + m.V),
			bigram: ((m.bi[w[i - 1] + ' ' + x] || 0) + 1) / ((m.ctx1[w[i - 1]] || 0) + m.V),
			trigram: ((m.tri[w[i - 2] + ' ' + w[i - 1] + ' ' + x] || 0) + 1) / ((m.ctx2[w[i - 2] + ' ' + w[i - 1]] || 0) + m.V),
		}
	}

	function score(m, phonemes) {
		const w = ['<s>', '<s>', ...phonemes, '</s>']
		const logp = { unigram: 0, bigram: 0, trigram: 0 }
		const per = []
		for (let i = 2; i < w.length; i++) {
			const p = probs(m, w, i)
			for (const o of ORDERS) logp[o] += Math.log(p[o])
			if (i < w.length - 1) per.push(p.trigram)
		}
		const n = w.length - 2
		const ppl = {}
		for (const o of ORDERS) ppl[o] = Math.exp(-logp[o] / n)
		return { ppl, per }
	}

	// Sample from raw trigram counts, backing off to bigram, then unigram
	function babble(m, length) {
		const out = []
		let a = '<s>', b = '<s>'
		const pick = entries => {
			let total = 0
			for (const [, c] of entries) total += c
			let r = Math.random() * total
			for (const [x, c] of entries) { r -= c; if (r <= 0) return x }
			return entries[entries.length - 1][0]
		}
		for (let i = 0; i < length; i++) {
			let options = Object.entries(m.tri).filter(([k]) => k.startsWith(a + ' ' + b + ' ')).map(([k, c]) => [k.split(' ')[2], c])
			if (!options.length) options = Object.entries(m.bi).filter(([k]) => k.startsWith(b + ' ')).map(([k, c]) => [k.split(' ')[1], c])
			if (!options.length) options = Object.entries(m.uni)
			options = options.filter(([x]) => x !== '</s>')
			const next = pick(options)
			out.push(next)
			a = b
			b = next
		}
		return out
	}

	window.DEMOS.ngram = {
		title: 'Phonetic N-grams',
		tagline: 'How English-like is a sound?',
		icon: '🗣️',
		blurb: 'Type words or ARPAbet phonemes. Unigram, bigram and trigram models trained on child-directed speech score how English-like the sound sequence is. Lower perplexity means more English-like.',
		note: '',

		mount(root) {
			root.innerHTML = `
				<form class="pos-form ng-form">
					<label class="sr-only" for="ng-input">Words or ARPAbet phonemes</label>
					<input id="ng-input" class="demo-input" type="text" autocomplete="off" spellcheck="false" value="${EXAMPLES[0][1]}">
					<button type="submit" class="demo-btn primary">Score</button>
				</form>
				<div class="demo-chips">${EXAMPLES.map(([l, v]) => `<button type="button" class="demo-chip" data-v="${esc(v)}">${esc(l)}</button>`).join('')}
					<button type="button" class="demo-chip ng-scramble">🔀 Scramble it</button>
					<button type="button" class="demo-chip ng-babble">🎲 Generate babble</button></div>
				<p class="demo-status ng-status">Loading the model…</p>
				<div class="ng-out" aria-live="polite"></div>`

			const input = root.querySelector('#ng-input')
			const status = root.querySelector('.ng-status')
			const out = root.querySelector('.ng-out')
			let model = null
			let cancelled = false
			let current = []

			// Words → phonemes via the lexicon; uppercase tokens are taken as ARPAbet directly
			function toPhonemes(text) {
				const phones = []
				const unknown = []
				for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
					if (/^[A-Z]{1,2}[012]?$/.test(tok) && model.uni[tok]) phones.push(tok)
					else if (LEXICON[tok.toLowerCase()]) phones.push(...LEXICON[tok.toLowerCase()].split(' '))
					else unknown.push(tok)
				}
				return { phones, unknown }
			}

			function render(phones, note) {
				current = phones
				if (!phones.length) {
					out.innerHTML = `<p class="demo-status">${note || 'Nothing to score yet.'}</p>`
					return
				}
				const { ppl, per } = score(model, phones)
				const scrambled = phones.slice().sort(() => Math.random() - 0.5)
				const sppl = score(model, scrambled).ppl
				const max = Math.max(...ORDERS.map(o => Math.max(ppl[o], sppl[o])))
				const bar = (v, cls) => `<span class="ng-bar ${cls}" style="width:${Math.max(3, (Math.log(v) / Math.log(max)) * 100).toFixed(1)}%"></span>`
				out.innerHTML = `
					<ol class="ng-phones">${phones.map((p, i) => {
						const s = Math.min(1, Math.max(0, (Math.log(per[i]) + 7) / 6)) // 0 = surprising, 1 = expected
						return `<li title="trigram P = ${per[i].toFixed(4)}" style="--s:${s.toFixed(2)}">${esc(p)}</li>`
					}).join('')}</ol>
					<p class="demo-status">Colour = how expected each phoneme is after the previous two (trigram): <span class="ng-key lo">surprising</span> → <span class="ng-key hi">expected</span>${note ? ' · ' + esc(note) : ''}</p>
					<table class="heart-scores ng-table">
						<tr><th>Model</th><th>Perplexity</th><th>Same phonemes scrambled</th></tr>
						${ORDERS.map(o => `<tr><td>${o}</td><td><div class="ng-cell">${bar(ppl[o], 'real')}<b>${ppl[o].toFixed(1)}</b></div></td><td><div class="ng-cell">${bar(sppl[o], 'scr')}<span>${sppl[o].toFixed(1)}</span></div></td></tr>`).join('')}
					</table>
					<p class="demo-status">Context helps: the trigram should separate real English from the scrambled version far more clearly than the unigram, which only counts how common each sound is.</p>`
			}

			function run() {
				if (!model) return
				const { phones, unknown } = toPhonemes(input.value)
				render(phones, unknown.length ? `not in the mini dictionary: ${unknown.join(', ')} (or type ARPAbet, e.g. K AE1 T)` : '')
			}

			root.querySelector('.ng-form').addEventListener('submit', e => { e.preventDefault(); run() })
			root.querySelector('.demo-chips').addEventListener('click', e => {
				const chip = e.target.closest('.demo-chip')
				if (!chip || !model) return
				if (chip.classList.contains('ng-scramble')) {
					const s = current.slice().sort(() => Math.random() - 0.5)
					input.value = s.join(' ')
					render(s, 'scrambled')
				} else if (chip.classList.contains('ng-babble')) {
					const b = babble(model, 18)
					input.value = b.join(' ')
					render(b, 'sampled from the trigram model: plausible-sounding baby talk')
				} else {
					input.value = chip.dataset.v
					run()
				}
			})

			load()
				.then(m => {
					if (cancelled) return
					model = m
					status.textContent = `Trained on ${m.total.toLocaleString()} phonemes · ${m.phonemes.length} ARPAbet symbols · dev-set perplexity: unigram ${m.devPerplexity.unigram}, bigram ${m.devPerplexity.bigram}, trigram ${m.devPerplexity.trigram}`
					run()
				})
				.catch(err => { status.textContent = 'Could not load the model (' + err.message + ').' })

			return () => { cancelled = true }
		},
	}

	window.DEMOS.ngram.note = 'Counts come from the project’s CHILDES training split (child-directed speech converted to ARPAbet), restricted to real phonemes. The original project also kept transcription tags (XXX, word markers), which is why its reported perplexities are higher. Word lookup uses a small built-in dictionary.'
})()
