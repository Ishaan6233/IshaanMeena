// Movie-review sentiment with Naive Bayes. The model (demos/data/sentiment-nb.json) is a binarized
// multinomial Naive Bayes retrained for this demo on the Cornell movie-review polarity dataset.
window.DEMOS = window.DEMOS || {}

window.DEMOS.sentiment = {
	title: 'Sentiment Analysis',
	tagline: 'Naive Bayes on movie reviews',
	icon: '🎬',
	blurb: 'Write a movie review and a Naive Bayes classifier decides whether it is positive or negative. Each word is coloured by how much it pushed the decision.',
	note: 'Retrained for this demo on the Cornell movie-review polarity dataset (2,000 reviews, Pang &amp; Lee 2004). It scores 76% on 200 held-out reviews: decent for a bag-of-words model, and it misses sarcasm and negation, which makes for fun experiments.',

	mount(root) {
		const EXAMPLES = [
			'A brilliant, moving film with superb performances and a beautifully written script.',
			'The plot was dull and predictable, the acting was awful, and I wanted my money back.',
			'The visuals are stunning, but the story is a mess and the ending is ridiculous.',
			'Not bad at all. Not great either, but the cast clearly had fun.',
		]

		root.innerHTML = `
			<label class="sr-only" for="sent-input">Review text</label>
			<textarea id="sent-input" class="demo-input" rows="4" spellcheck="true">${EXAMPLES[0]}</textarea>
			<div class="demo-chips" aria-label="Example reviews">${EXAMPLES.map((e, i) => `<button type="button" class="demo-chip" data-i="${i}">${['Glowing', 'Scathing', 'Mixed', 'Tricky (negation)'][i]}</button>`).join('')}</div>
			<p class="demo-status sent-status">Loading the model…</p>
			<div class="sent-result" aria-live="polite" hidden>
				<div class="sent-verdict"><span class="sent-label"></span><span class="sent-prob"></span></div>
				<div class="sent-meter" aria-hidden="true"><span></span></div>
				<p class="sent-highlight"></p>
				<div class="sent-top">
					<div><h4>Pushed it positive</h4><ul class="sent-pos"></ul></div>
					<div><h4>Pushed it negative</h4><ul class="sent-neg"></ul></div>
				</div>
			</div>`

		const input = root.querySelector('#sent-input')
		const status = root.querySelector('.sent-status')
		const result = root.querySelector('.sent-result')
		let model = null
		let cancelled = false
		let timer = 0

		function esc(s) {
			return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
		}

		// Same tokenization as training: lowercase runs of letters and apostrophes
		const TOKEN = /[a-z][a-z']*/g

		function classify(text) {
			const seen = new Set((text.toLowerCase().match(TOKEN) || []))
			let pos = Math.log(0.5)
			let neg = Math.log(0.5)
			const contributions = []
			for (const w of seen) {
				const lp = model.words[w]
				if (!lp) continue
				pos += lp[0]
				neg += lp[1]
				contributions.push([w, lp[0] - lp[1]])
			}
			// P(positive | text) from the two log scores
			const pPos = 1 / (1 + Math.exp(neg - pos))
			return { pPos, contributions: new Map(contributions) }
		}

		function run() {
			if (!model) return
			const text = input.value
			if (!text.trim()) {
				result.hidden = true
				return
			}
			const { pPos, contributions } = classify(text)
			const positive = pPos >= 0.5
			const confidence = positive ? pPos : 1 - pPos
			result.hidden = false
			result.classList.toggle('is-positive', positive)
			result.classList.toggle('is-negative', !positive)
			root.querySelector('.sent-label').textContent = positive ? '👍 Positive' : '👎 Negative'
			root.querySelector('.sent-prob').textContent = `${(confidence * 100).toFixed(confidence > 0.999 ? 2 : 1)}% (model probability)`
			root.querySelector('.sent-meter span').style.width = (pPos * 100).toFixed(1) + '%'

			// Colour each word by its log-likelihood ratio
			root.querySelector('.sent-highlight').innerHTML = text.split(/(\s+)/).map(part => {
				const words = part.toLowerCase().match(TOKEN) || []
				const weight = words.reduce((sum, w) => sum + (contributions.get(w) || 0), 0)
				if (!weight) return esc(part)
				const strength = Math.min(1, Math.abs(weight) / 1.5)
				const colour = weight > 0 ? `rgba(46, 160, 67, ${0.15 + 0.6 * strength})` : `rgba(229, 57, 59, ${0.15 + 0.6 * strength})`
				return `<mark style="background:${colour}" title="log-likelihood ratio ${weight.toFixed(2)}">${esc(part)}</mark>`
			}).join('')

			const ranked = Array.from(contributions).sort((a, b) => b[1] - a[1])
			const list = items => items.map(([w, v]) => `<li><span>${esc(w)}</span><em>${v > 0 ? '+' : ''}${v.toFixed(2)}</em></li>`).join('') || '<li class="none">none</li>'
			root.querySelector('.sent-pos').innerHTML = list(ranked.filter(([, v]) => v > 0.25).slice(0, 5))
			root.querySelector('.sent-neg').innerHTML = list(ranked.filter(([, v]) => v < -0.25).reverse().slice(0, 5))
		}

		input.addEventListener('input', () => {
			clearTimeout(timer)
			timer = setTimeout(run, 120)
		})
		root.querySelector('.demo-chips').addEventListener('click', e => {
			const chip = e.target.closest('.demo-chip')
			if (!chip) return
			input.value = EXAMPLES[Number(chip.dataset.i)]
			run()
		})

		fetch('demos/data/sentiment-nb.json')
			.then(r => {
				if (!r.ok) throw new Error('HTTP ' + r.status)
				return r.json()
			})
			.then(json => {
				if (cancelled) return
				model = json
				status.textContent = `${json.method} · ${Object.keys(json.words).length.toLocaleString()}-word vocabulary · ${json.heldOutAccuracy}% held-out accuracy`
				run()
			})
			.catch(err => {
				status.textContent = 'Could not load the model (' + err.message + ').'
			})

		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	},
}
