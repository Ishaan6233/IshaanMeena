// Small helpers shared by the in-browser ML demos: seeded randomness (so splits are reproducible),
// a CSV parser, train/test splitting and classification metrics.
window.MLUtils = (function () {
	// mulberry32: a tiny seeded PRNG
	function rng(seed) {
		let a = seed >>> 0
		return function () {
			a = (a + 0x6D2B79F5) >>> 0
			let t = a
			t = Math.imul(t ^ (t >>> 15), t | 1)
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296
		}
	}

	function shuffle(items, random) {
		const a = items.slice()
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]]
		}
		return a
	}

	// Stratified split: keeps the class balance the same in train and test
	function split(rows, labelOf, testFraction, seed) {
		const random = rng(seed)
		const byLabel = new Map()
		for (const row of rows) {
			const key = labelOf(row)
			if (!byLabel.has(key)) byLabel.set(key, [])
			byLabel.get(key).push(row)
		}
		const train = []
		const test = []
		for (const group of byLabel.values()) {
			const shuffled = shuffle(group, random)
			const cut = Math.round(shuffled.length * testFraction)
			test.push(...shuffled.slice(0, cut))
			train.push(...shuffled.slice(cut))
		}
		return { train: shuffle(train, random), test: shuffle(test, random) }
	}

	// RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes
	function parseCSV(text) {
		const rows = []
		let row = []
		let field = ''
		let quoted = false
		for (let i = 0; i < text.length; i++) {
			const c = text[i]
			if (quoted) {
				if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
				else if (c === '"') quoted = false
				else field += c
			} else if (c === '"') {
				quoted = true
			} else if (c === ',') {
				row.push(field)
				field = ''
			} else if (c === '\n' || c === '\r') {
				if (c === '\r' && text[i + 1] === '\n') i++
				row.push(field)
				if (row.some(f => f !== '')) rows.push(row)
				row = []
				field = ''
			} else {
				field += c
			}
		}
		if (field !== '' || row.length) {
			row.push(field)
			rows.push(row)
		}
		return rows
	}

	// Binary metrics with 1 as the positive class
	function metrics(actual, predicted) {
		let tp = 0, tn = 0, fp = 0, fn = 0
		actual.forEach((y, i) => {
			const p = predicted[i]
			if (y === 1 && p === 1) tp++
			else if (y === 0 && p === 0) tn++
			else if (y === 0 && p === 1) fp++
			else fn++
		})
		const total = actual.length
		return {
			accuracy: (tp + tn) / total,
			precision: tp + fp ? tp / (tp + fp) : 0,
			recall: tp + fn ? tp / (tp + fn) : 0,
			tp, tn, fp, fn, total,
		}
	}

	const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))))

	function pct(x, digits = 1) {
		return (x * 100).toFixed(digits) + '%'
	}

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
	}

	// Lets a long-running loop yield to the browser so the page stays responsive
	const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0))

	return { rng, shuffle, split, parseCSV, metrics, sigmoid, pct, esc, nextFrame }
})()
