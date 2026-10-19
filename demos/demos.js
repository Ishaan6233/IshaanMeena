// The "Live Demos" app: a window with a list of demos on the left and the running demo on the right.
// Each demo file registers itself in window.DEMOS:
//   window.DEMOS[id] = { title, icon, blurb, note?, mount(container) -> cleanup function }
// and a project in projects.json links to it with "demo": "<id>".
window.DEMOS = window.DEMOS || {}

;(function () {
	const win = document.getElementById('demos-window')
	if (!win) return

	const list = win.querySelector('.demos-list')
	const stage = win.querySelector('.demos-stage')
	const titleEl = stage.querySelector('.demo-title')
	const blurbEl = stage.querySelector('.demo-blurb')
	const noteEl = stage.querySelector('.demo-note')
	const codeLink = stage.querySelector('.demo-code')
	const detailsButton = stage.querySelector('.demo-details')
	const mountEl = stage.querySelector('.demo-mount')
	const windowTitle = win.querySelector('.titlebar-title')

	// Display order; anything else registered is appended
	const ORDER = ['sudoku', 'cliff-walking', 'spam', 'heart', 'pos-tagger', 'grammar', 'sentiment', 'summarizer', 'ngram', 'relation', 'calculator', 'hangman', 'pokemon', 'nike']

	let current = null
	let cleanup = null

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
	}

	function ids() {
		const all = Object.keys(window.DEMOS)
		return ORDER.filter(id => all.includes(id)).concat(all.filter(id => !ORDER.includes(id)))
	}

	function projectFor(id) {
		return window.PORTFOLIO ? window.PORTFOLIO.projects.find(p => p.demo === id) : null
	}

	function renderList() {
		list.innerHTML = ids().map(id => {
			const d = window.DEMOS[id]
			return `<button type="button" class="demo-item" data-demo="${esc(id)}" aria-current="${id === current}">
				<span class="demo-item-icon" aria-hidden="true">${d.icon || '▶'}</span>
				<span class="demo-item-text"><strong>${esc(d.title)}</strong><em>${esc(d.tagline || '')}</em></span>
			</button>`
		}).join('')
	}

	function stop() {
		if (cleanup) {
			try { cleanup() } catch (e) { console.error(e) }
		}
		cleanup = null
		mountEl.innerHTML = ''
	}

	function show(id) {
		const demo = window.DEMOS[id]
		if (!demo) return
		stop()
		current = id
		const project = projectFor(id)
		titleEl.textContent = demo.title
		blurbEl.textContent = demo.blurb || ''
		noteEl.innerHTML = demo.note || ''
		noteEl.hidden = !demo.note
		windowTitle.textContent = `Live Demos — ${demo.title}`
		codeLink.hidden = !(project && project.url)
		if (project && project.url) codeLink.href = project.url
		detailsButton.hidden = !project
		detailsButton.dataset.slug = project ? project.slug : ''
		list.querySelectorAll('.demo-item').forEach(b => b.setAttribute('aria-current', b.dataset.demo === id))
		try {
			cleanup = demo.mount(mountEl) || null
		} catch (e) {
			console.error(e)
			mountEl.innerHTML = '<p class="demo-error">Sorry, this demo failed to start.</p>'
		}
	}

	list.addEventListener('click', e => {
		const item = e.target.closest('.demo-item')
		if (item) show(item.dataset.demo)
	})

	detailsButton.addEventListener('click', () => {
		if (window.finder && detailsButton.dataset.slug) window.finder.quickLook(detailsButton.dataset.slug)
	})

	// Opened from the Dock or menu bar: start the first demo if nothing is running yet
	win.addEventListener('wm:shown', () => {
		if (current) return
		renderList()
		show(ids()[0])
	})

	// Stop timers and animations when the window goes away
	win.addEventListener('wm:closed', () => {
		stop()
		current = null
	})

	async function open(id) {
		renderList()
		const target = id && window.DEMOS[id] ? id : current || ids()[0]
		if (target !== current || !mountEl.childElementCount) show(target)
		await window.wm.open('demos')
	}

	window.demos = { open, ids, get: id => window.DEMOS[id] }
})()
