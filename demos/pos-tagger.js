// Part-of-speech tagging with a Hidden Markov Model, matching Ishaan6233/POS-Tagging-HMM-and-Brill:
// NLTK's supervised HMM trainer with Lidstone smoothing (gamma = 0.1, the best setting in the report),
// trained on the same GUM training file in the browser, then Viterbi decoding.
//
// Optional addition for the demo: an unknown-word model. Plain Lidstone gives every unseen word the
// same tiny probability under every tag, which favours rare tags (e.g. "brown" -> "."). The add-on
// guesses tags for unseen words from their shape and suffix, learned from words seen once in training.
window.DEMOS = window.DEMOS || {}

;(function () {
	const GAMMA = 0.1

	// Word-shape classes for unseen words, most specific first
	const SHAPES = [
		['digit', w => /\d/.test(w)],
		['punct', w => /^[^A-Za-z0-9]+$/.test(w)],
		['hyphen', w => w.includes('-')],
		['allcaps', w => /^[A-Z]{2,}$/.test(w)],
		['-ing', w => /ing$/i.test(w)],
		['-ed', w => /ed$/i.test(w)],
		['-ly', w => /ly$/i.test(w)],
		['-tion', w => /(tion|sion|ment|ness|ity|ism)$/i.test(w)],
		['-ous', w => /(ous|ive|able|ible|al|ful|less|ic)$/i.test(w)],
		['-est', w => /est$/i.test(w)],
		['-er', w => /er$/i.test(w)],
		['-s', w => /[^s]s$/i.test(w)],
		['capital', w => /^[A-Z]/.test(w)],
		['other', () => true],
	]

	function shapeOf(word) {
		return SHAPES.find(([, test]) => test(word))[0]
	}

	// Counts + Lidstone, as NLTK's HiddenMarkovModelTrainer.train_supervised
	function train(text) {
		const started = performance.now()
		const starts = new Map()
		const transitions = new Map()
		const emissions = new Map()
		const wordCounts = new Map()
		const sentencesList = []

		const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by)
		const nested = (map, key) => map.get(key) || map.set(key, new Map()).get(key)

		for (const sentence of parse(text)) {
			sentencesList.push(sentence)
			inc(starts, sentence[0][1])
			sentence.forEach(([word, tag], i) => {
				inc(wordCounts, word)
				inc(nested(emissions, tag), word)
				if (i + 1 < sentence.length) inc(nested(transitions, tag), sentence[i + 1][1])
			})
		}

		const tags = Array.from(new Set([...emissions.keys(), ...starts.keys()]))
		const T = tags.length
		const V = wordCounts.size
		const total = m => { let n = 0; for (const v of m.values()) n += v; return n }
		const lid = (c, n, bins) => Math.log((c + GAMMA) / (n + bins * GAMMA))

		const startN = total(starts)
		const logStart = tags.map(t => lid(starts.get(t) || 0, startN, T))
		const logTrans = tags.map(t => {
			const m = transitions.get(t) || new Map()
			const n = total(m)
			return tags.map(u => lid(m.get(u) || 0, n, T))
		})
		const emitMaps = tags.map(t => emissions.get(t) || new Map())
		const emitTotals = emitMaps.map(total)

		// Unknown-word model: P(tag | shape) from words that occur once (they behave like unseen words)
		const shapeTag = new Map()
		const tagTotal = new Array(T).fill(0)
		let tokens = 0
		for (const sentence of sentencesList) {
			for (const [word, tag] of sentence) {
				const t = tags.indexOf(tag)
				tagTotal[t]++
				tokens++
				if (wordCounts.get(word) === 1) {
					const counts = nested(shapeTag, shapeOf(word))
					counts.set(t, (counts.get(t) || 0) + 1)
				}
			}
		}
		const hapaxCount = Array.from(wordCounts.values()).filter(c => c === 1).length
		const logUnknown = Math.log(hapaxCount / tokens) // share of tokens that are "new" words
		const unknownEmit = new Map()
		for (const [shape] of SHAPES) {
			const counts = shapeTag.get(shape) || new Map()
			const n = total(counts)
			// log P(word | tag) ≈ log P(tag | shape) − log P(tag) + log P(unknown), via Bayes' rule
			unknownEmit.set(shape, tags.map((_, t) => lid(counts.get(t) || 0, n, T) - Math.log(tagTotal[t] / tokens) + logUnknown))
		}

		return {
			tags, logStart, logTrans, emitMaps, emitTotals, V, lid, unknownEmit, wordCounts,
			sentences: sentencesList.length, tokens, ms: performance.now() - started,
		}
	}

	function parse(text) {
		const sentences = []
		for (const block of text.split(/\r?\n\s*\r?\n/)) {
			const pairs = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
				const k = l.lastIndexOf(' ')
				return [l.slice(0, k), l.slice(k + 1)]
			})
			if (pairs.length) sentences.push(pairs)
		}
		return sentences
	}

	function known(model, word) {
		return model.wordCounts.has(word)
	}

	// Emission log-probabilities for one word under every tag
	function emissionRow(model, word, smartUnknown) {
		if (smartUnknown && !known(model, word)) {
			// Sentence-initial capitals: fall back to the lowercase word if we know it
			const lower = word.toLowerCase()
			if (lower !== word && known(model, lower)) return emissionRow(model, lower, smartUnknown)
			return model.unknownEmit.get(shapeOf(word))
		}
		return model.tags.map((_, t) => model.lid(model.emitMaps[t].get(word) || 0, model.emitTotals[t], model.V))
	}

	function viterbi(model, words, smartUnknown) {
		const { tags, logStart, logTrans } = model
		const T = tags.length
		const emit = words.map(w => emissionRow(model, w, smartUnknown))
		const score = [tags.map((_, t) => logStart[t] + emit[0][t])]
		const back = [tags.map(() => -1)]
		for (let i = 1; i < words.length; i++) {
			const row = new Array(T)
			const ptr = new Array(T)
			for (let t = 0; t < T; t++) {
				let best = -Infinity
				let arg = 0
				for (let p = 0; p < T; p++) {
					const v = score[i - 1][p] + logTrans[p][t]
					if (v > best) { best = v; arg = p }
				}
				row[t] = best + emit[i][t]
				ptr[t] = arg
			}
			score.push(row)
			back.push(ptr)
		}
		const lastRow = score[score.length - 1]
		let last = lastRow.indexOf(Math.max(...lastRow))
		const path = [last]
		for (let i = words.length - 1; i > 0; i--) {
			last = back[i][last]
			path.unshift(last)
		}
		return { path: path.map(t => tags[t]), score }
	}

	// Token accuracy on a tagged file, like evaluate_tagger in the project
	function evaluate(model, text, smartUnknown) {
		let correct = 0
		let total = 0
		for (const sentence of parse(text)) {
			const { path } = viterbi(model, sentence.map(([w]) => w), smartUnknown)
			sentence.forEach(([, tag], i) => {
				if (path[i] === tag) correct++
				total++
			})
		}
		return correct / total
	}

	// The trained model is shared with other demos (the grammar checker tags sentences with it)
	let modelPromise = null
	function load() {
		modelPromise = modelPromise || fetch('demos/data/pos-train.txt')
			.then(r => {
				if (!r.ok) throw new Error('HTTP ' + r.status)
				return r.text()
			})
			.then(train)
		return modelPromise
	}

	// The same Penn-Treebank-style tokenizer the demo uses
	function tokenize(text) {
		return text
			.replace(/([“”"(){}\[\]!?;:])/g, ' $1 ')
			.replace(/,(?!\d)/g, ' , ')
			.replace(/\.(\s|$)/g, ' . ')
			.replace(/(\w)(n't)\b/gi, '$1 $2')
			.replace(/(\w)('s|'re|'ve|'ll|'d|'m)\b/gi, '$1 $2')
			.split(/\s+/)
			.filter(Boolean)
	}

	const engine = { train, viterbi, evaluate, parse, known, load, tokenize }

	window.DEMOS['pos-tagger'] = {
		title: 'POS Tagger (HMM)',
		tagline: 'Hidden Markov Model + Viterbi',
		icon: '🏷️',
		blurb: 'Type a sentence and a Hidden Markov Model tags every word with its part of speech, choosing the most likely tag sequence with the Viterbi algorithm.',
		note: 'Trained live in your browser on the project’s GUM training data (<a href="https://gucorpling.org/gum/" target="_blank" rel="noopener">Georgetown University Multilayer Corpus</a>, CC BY 4.0) with Lidstone smoothing, γ = 0.1. On the project’s test sets this port reproduces the report exactly: <strong>82.5%</strong> in-domain and <strong>77.3%</strong> out-of-domain. The unknown-word model added for this demo raises that to <strong>90.0%</strong> and <strong>86.6%</strong>.',
		engine,

		mount(root) {
			const EXAMPLES = [
				'The quick brown fox jumps over the lazy dog .',
				'I saw her duck under the table .',
				'Time flies like an arrow .',
				'The city had about 391,000 people in 2010 .',
				'She is preparing a research paper on 3D reconstruction .',
			]
			const TAG_INFO = {
				NN: ['noun', 'Noun, singular'], NNS: ['noun', 'Noun, plural'], NNP: ['noun', 'Proper noun, singular'], NNPS: ['noun', 'Proper noun, plural'],
				PRP: ['pron', 'Personal pronoun'], 'PRP$': ['pron', 'Possessive pronoun'], WP: ['pron', 'Wh-pronoun'], 'WP$': ['pron', 'Possessive wh-pronoun'],
				VB: ['verb', 'Verb, base form'], VBD: ['verb', 'Verb, past tense'], VBG: ['verb', 'Verb, gerund / present participle'], VBN: ['verb', 'Verb, past participle'], VBP: ['verb', 'Verb, non-3rd person present'], VBZ: ['verb', 'Verb, 3rd person singular present'], MD: ['verb', 'Modal'],
				JJ: ['adj', 'Adjective'], JJR: ['adj', 'Adjective, comparative'], JJS: ['adj', 'Adjective, superlative'],
				RB: ['adv', 'Adverb'], RBR: ['adv', 'Adverb, comparative'], RBS: ['adv', 'Adverb, superlative'], WRB: ['adv', 'Wh-adverb'],
				DT: ['det', 'Determiner'], PDT: ['det', 'Predeterminer'], WDT: ['det', 'Wh-determiner'],
				IN: ['prep', 'Preposition / subordinating conjunction'], TO: ['prep', '“to”'], RP: ['prep', 'Particle'],
				CC: ['conj', 'Coordinating conjunction'], CD: ['num', 'Cardinal number'],
			}

			root.innerHTML = `
				<form class="pos-form">
					<label class="sr-only" for="pos-input">Sentence to tag</label>
					<input id="pos-input" class="demo-input" type="text" autocomplete="off" spellcheck="false" value="${EXAMPLES[0]}">
					<button type="submit" class="demo-btn primary">Tag</button>
				</form>
				<div class="demo-chips" aria-label="Example sentences">${EXAMPLES.map(e => `<button type="button" class="demo-chip">${e.replace(/ ([.,!?])$/, '$1')}</button>`).join('')}</div>
				<label class="pos-toggle"><input type="checkbox" class="pos-smart" checked> Smarter unknown-word handling <span>(off = the original NLTK model)</span></label>
				<p class="demo-status pos-status">Training the HMM…</p>
				<div class="pos-output" aria-live="polite"></div>
				<details class="pos-trellis-wrap">
					<summary>Show the Viterbi trellis (top candidate tags per word)</summary>
					<div class="pos-trellis"></div>
				</details>
				<div class="pos-legend">${['noun', 'verb', 'adj', 'adv', 'pron', 'det', 'prep', 'conj', 'num', 'other'].map(k => `<span class="pos-tag pos-${k}">${k}</span>`).join('')}</div>`

			const form = root.querySelector('.pos-form')
			const input = root.querySelector('#pos-input')
			const smart = root.querySelector('.pos-smart')
			const status = root.querySelector('.pos-status')
			const output = root.querySelector('.pos-output')
			const trellisEl = root.querySelector('.pos-trellis')
			let model = null
			let cancelled = false

			function esc(s) {
				return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
			}

			function run() {
				if (!model) return
				const words = tokenize(input.value)
				if (!words.length) {
					output.innerHTML = ''
					trellisEl.innerHTML = ''
					return
				}
				const started = performance.now()
				const { path, score } = viterbi(model, words, smart.checked)
				const ms = performance.now() - started

				output.innerHTML = `<ol class="pos-tokens">${words.map((w, i) => {
					const tag = path[i]
					const unseen = !known(model, w)
					const desc = TAG_INFO[tag] ? TAG_INFO[tag][1] : tag
					return `<li class="pos-token${unseen ? ' unseen' : ''}" title="${esc(desc)}${unseen ? ' · word not seen in training' : ''}">
						<span class="pos-word">${esc(w)}</span>
						<span class="pos-tag pos-${TAG_INFO[tag] ? TAG_INFO[tag][0] : 'other'}">${esc(tag)}</span>
					</li>`
				}).join('')}</ol>
				<p class="demo-status">Decoded ${words.length} words in ${ms.toFixed(1)} ms · dotted underline = word not seen in training</p>`

				trellisEl.innerHTML = `<div class="pos-columns">${words.map((w, i) => {
					const ranked = score[i].map((s, t) => [s, model.tags[t]]).sort((a, b) => b[0] - a[0]).slice(0, 3)
					return `<div class="pos-column"><strong>${esc(w)}</strong>${ranked.map(([s, t]) =>
						`<span class="${t === path[i] ? 'chosen' : ''}">${esc(t)} <em>${s.toFixed(1)}</em></span>`).join('')}</div>`
				}).join('')}</div><p class="demo-status">Numbers are log-probabilities of the best path ending in that tag.</p>`
			}

			form.addEventListener('submit', e => {
				e.preventDefault()
				run()
			})
			smart.addEventListener('change', run)
			root.querySelector('.demo-chips').addEventListener('click', e => {
				const chip = e.target.closest('.demo-chip')
				if (!chip) return
				input.value = chip.textContent
				run()
			})

			load()
				.then(m => {
					if (cancelled) return
					model = m
					status.textContent = `Trained on ${model.sentences.toLocaleString()} sentences (${model.tokens.toLocaleString()} tokens, ${model.tags.length} tags) in ${Math.round(model.ms)} ms.`
					run()
				})
				.catch(err => {
					status.textContent = 'Could not load the training data (' + err.message + ').'
				})

			return () => { cancelled = true }
		},
	}
})()
