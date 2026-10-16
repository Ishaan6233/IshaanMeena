// Project data shared by the Terminal and Projects (Finder) apps, loaded from projects.json.
//
// projects.json format:
//   profile:    { name, headline, school, location, photo, resume, summary, education: [..], experience: [{ role, org, dates, tags, bullets }],
//                 skills: { group: [..] }, highlights: [..],
//                 contact: { email, linkedin, github }, availability? }   availability = optional line on the contact card
//   categories: [{ id, name, stack }]                  stack = comma-separated tech shown as tags
//   projects:   [{ title, category, description, image?, repo?, tags?, details? }]
//               category is a category id; tags (optional array) overrides the category's stack;
//               details (optional array) = résumé-style bullet points; no image = a generated icon tile;
//               demo (optional) = id of a live demo in demos/ (see demos/demos.js)
//
// The arrays below are filled in place once the file loads, so other scripts can keep
// references to them. Wait on PORTFOLIO.ready (or the 'portfolio:ready' event) before rendering.
window.PORTFOLIO = (function () {
	const projects = []
	const folders = []
	const dirs = []
	const profile = {}

	// A generated icon tile (initials on a gradient) for projects without an image
	const TILE_COLOURS = [['#4f46e5', '#06b6d4'], ['#db2777', '#f59e0b'], ['#059669', '#84cc16'], ['#7c3aed', '#ec4899'], ['#0369a1', '#22d3ee'], ['#b45309', '#ef4444']]

	function placeholder(title) {
		// Use the name before any subtitle ("LexiServe: AI-Powered…" -> "LexiServe")
		const name = title.split(':')[0]
		const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w))
		const second = words[1] ? words[1][0] : ((words[0] || '').slice(1).match(/[A-Z]/) || [(words[0] || '')[1] || ''])[0]
		const initials = (words[0] ? words[0][0] : '?') + second
		let hash = 0
		for (const c of title) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
		const [a, b] = TILE_COLOURS[hash % TILE_COLOURS.length]
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="120" fill="url(#g)"/><text x="80" y="62" fill="#fff" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="46" font-weight="700" text-anchor="middle" dominant-baseline="middle">${initials.toUpperCase()}</text></svg>`
		return 'data:image/svg+xml,' + encodeURIComponent(svg)
	}

	function slugify(s) {
		return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
	}

	function load(json) {
		Object.assign(profile, json.profile || {})
		const categories = json.categories || []
		const list = (json.projects || []).map(p => {
			const category = categories.find(c => c.id === p.category) || { id: p.category || 'other', name: 'Other', stack: '' }
			return {
				title: p.title,
				slug: slugify(p.title),
				desc: p.description || '',
				url: p.repo || '',
				image: p.image || placeholder(p.title),
				details: Array.isArray(p.details) ? p.details : [],
				demo: p.demo || '',
				category: category.name,
				dir: category.id,
				stack: Array.isArray(p.tags) && p.tags.length ? p.tags.join(', ') : category.stack || '',
			}
		})

		projects.splice(0, projects.length, ...list)
		folders.splice(0, folders.length)
		for (const c of categories) {
			const count = list.filter(p => p.dir === c.id).length
			if (count) folders.push({ dir: c.id, name: c.name, stack: c.stack || '', count })
		}
		// Projects whose category isn't listed still get a folder
		for (const p of list) {
			if (!folders.some(f => f.dir === p.dir)) folders.push({ dir: p.dir, name: p.category, stack: '', count: list.filter(q => q.dir === p.dir).length })
		}
		dirs.splice(0, dirs.length, ...folders.map(f => f.dir))
	}

	// Find a project by exact slug, then slug prefix, then a unique partial match
	function find(query) {
		if (!query) return null
		const q = slugify(query)
		if (!q) return null
		const partial = projects.filter(p => p.slug.includes(q))
		return projects.find(p => p.slug === q)
			|| projects.find(p => p.slug.startsWith(q))
			|| (partial.length === 1 ? partial[0] : null)
	}

	// Free-text search across title, description, category and stack
	function search(text) {
		const terms = text.toLowerCase().split(/\s+/).filter(Boolean)
		if (!terms.length) return projects.slice()
		return projects.filter(p => {
			const haystack = `${p.title} ${p.desc} ${p.category} ${p.dir} ${p.stack}`.toLowerCase()
			return terms.every(t => haystack.includes(t))
		})
	}

	const ready = fetch('projects.json', { cache: 'no-cache' })
		.then(res => {
			if (!res.ok) throw new Error(`projects.json: HTTP ${res.status}`)
			return res.json()
		})
		.then(json => {
			load(json)
			document.dispatchEvent(new Event('portfolio:ready'))
			return true
		})
		.catch(err => {
			console.error('Could not load projects:', err)
			return false
		})

	return { profile, projects, folders, dirs, find, search, slugify, ready }
})()
