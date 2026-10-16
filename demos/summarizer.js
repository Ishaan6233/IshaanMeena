// Extractive text summarization with TF-IDF and cosine similarity: each sentence becomes a
// TF-IDF vector, sentences closest to the whole document's vector are kept, in original order.
window.DEMOS = window.DEMOS || {}

window.DEMOS.summarizer = {
	title: 'Text Summarizer',
	tagline: 'TF-IDF + cosine similarity',
	icon: '📝',
	blurb: 'Paste any article and the summarizer keeps the sentences that best represent the whole text, scored with TF-IDF vectors and cosine similarity.',
	note: 'Extractive summarization: nothing is rewritten, the most representative sentences are selected and kept in their original order. Hover a sentence to see its score.',

	mount(root) {
		const SAMPLE = [
			'When a honeybee colony outgrows its hive, roughly half of the workers leave with the old queen to start a new home.',
			'The swarm first settles on a nearby branch, where it hangs in a tight cluster for hours or even days.',
			'From that cluster, a few hundred experienced scout bees fly out to search for a suitable cavity, such as a hollow tree.',
			'Each scout inspects a candidate site carefully, judging its volume, the size of its entrance and how dry it is.',
			'Back at the cluster, scouts advertise the sites they found with the waggle dance, and better sites earn longer, more enthusiastic dances.',
			'Other scouts follow these dances, visit the advertised sites themselves and, if impressed, begin dancing for them too.',
			'Support for weaker sites fades over time, while support for the best site grows, much like votes accumulating in an election.',
			'The decision is made when enough scouts are present at one site at the same time, a process biologists call quorum sensing.',
			'The scouts then warm up the rest of the swarm, which lifts off and flies together to its new home.',
			'Researchers have compared this process to how neurons in the brain reach decisions, and it has inspired algorithms for group decision making.',
		].join(' ')

		const STOPWORDS = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may much many one even').split(' '))

		root.innerHTML = `
			<label class="sr-only" for="sum-input">Text to summarize</label>
			<textarea id="sum-input" class="demo-input" rows="6" spellcheck="true">${SAMPLE}</textarea>
			<div class="demo-controls">
				<label>Summary length
					<input type="range" class="sum-k" min="1" max="6" value="3" aria-label="Number of sentences to keep">
					<output class="sum-k-val">3 sentences</output>
				</label>
				<button type="button" class="demo-btn sum-clear">Paste your own</button>
			</div>
			<div class="sum-out" aria-live="polite">
				<h4>Summary</h4>
				<p class="sum-summary"></p>
				<h4>Original, with kept sentences highlighted</h4>
				<p class="sum-original"></p>
				<p class="demo-status sum-status"></p>
			</div>`

		const input = root.querySelector('#sum-input')
		const kEl = root.querySelector('.sum-k')
		let timer = 0

		function esc(s) {
			return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
		}

		function sentencesOf(text) {
			return (text.replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+["”’)]?|$)/g) || [])
				.map(s => s.trim())
				.filter(s => s.length > 1)
		}

		function terms(sentence) {
			return (sentence.toLowerCase().match(/[a-z][a-z'-]*/g) || [])
				.map(w => w.replace(/'s$/, ''))
				.filter(w => w.length > 2 && !STOPWORDS.has(w))
		}

		function summarize(text, k) {
			const sentences = sentencesOf(text)
			const docs = sentences.map(terms)
			const N = docs.length
			const df = new Map()
			docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) || 0) + 1)))
			const idf = w => Math.log((1 + N) / (1 + df.get(w))) + 1

			const vectors = docs.map(d => {
				const tf = new Map()
				d.forEach(w => tf.set(w, (tf.get(w) || 0) + 1))
				const v = new Map()
				tf.forEach((count, w) => v.set(w, (count / d.length) * idf(w)))
				return v
			})

			// The document vector: the sum of all sentence vectors
			const doc = new Map()
			vectors.forEach(v => v.forEach((x, w) => doc.set(w, (doc.get(w) || 0) + x)))

			const norm = v => Math.sqrt(Array.from(v.values()).reduce((s, x) => s + x * x, 0))
			const docNorm = norm(doc)
			const scores = vectors.map(v => {
				let dot = 0
				v.forEach((x, w) => { dot += x * (doc.get(w) || 0) })
				const n = norm(v)
				return n && docNorm ? dot / (n * docNorm) : 0
			})

			const keep = new Set(scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i))
			return { sentences, scores, keep }
		}

		function run() {
			const text = input.value
			const sentenceCount = sentencesOf(text).length
			kEl.max = Math.max(1, Math.min(8, sentenceCount - 1))
			const k = Math.min(Number(kEl.value), Number(kEl.max))
			root.querySelector('.sum-k-val').textContent = `${k} sentence${k === 1 ? '' : 's'}`
			if (sentenceCount < 2) {
				root.querySelector('.sum-summary').textContent = 'Add at least two sentences.'
				root.querySelector('.sum-original').innerHTML = ''
				root.querySelector('.sum-status').textContent = ''
				return
			}
			const started = performance.now()
			const { sentences, scores, keep } = summarize(text, k)
			const ms = performance.now() - started
			const max = Math.max(...scores) || 1

			root.querySelector('.sum-summary').textContent = sentences.filter((_, i) => keep.has(i)).join(' ')
			root.querySelector('.sum-original').innerHTML = sentences.map((s, i) =>
				`<span class="sum-sentence${keep.has(i) ? ' kept' : ''}" style="--score:${(scores[i] / max).toFixed(2)}" title="similarity to the whole text: ${scores[i].toFixed(3)}">${esc(s)}</span>`).join(' ')
			const words = text.split(/\s+/).filter(Boolean).length
			const kept = sentences.filter((_, i) => keep.has(i)).join(' ').split(/\s+/).length
			root.querySelector('.sum-status').textContent = `${sentences.length} sentences → ${k} · ${Math.round(100 - (kept / words) * 100)}% shorter · computed in ${ms.toFixed(1)} ms`
		}

		input.addEventListener('input', () => {
			clearTimeout(timer)
			timer = setTimeout(run, 150)
		})
		kEl.addEventListener('input', run)
		root.querySelector('.sum-clear').addEventListener('click', () => {
			input.value = ''
			input.focus()
			run()
		})

		run()

		return () => clearTimeout(timer)
	},
}
