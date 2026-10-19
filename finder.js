// The Projects app (a Finder-style window), Quick Look previews and Spotlight search.
(function () {
	const data = window.PORTFOLIO
	const win = document.getElementById('projects-window')
	if (!data || !win) return

	const sidebar = win.querySelector('.finder-sidebar')
	const grid = win.querySelector('.finder-grid')
	const status = win.querySelector('.finder-status')
	const pathLabel = win.querySelector('.finder-path')
	const searchBox = win.querySelector('.finder-search')
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

	let folder = 'all'
	let query = ''
	let shown = [] // projects currently in the grid
	let selected = null // slug

	function esc(s) {
		return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
	}

	function animate(el, keyframes, duration) {
		if (reduceMotion || !el.animate) return Promise.resolve()
		return el.animate(keyframes, { duration, easing: EASE }).finished.catch(() => {})
	}

	const FOLDER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2h7A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/></svg>'
	const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.1v13.8a1 1 0 0 0 1.5.86l11-6.9a1 1 0 0 0 0-1.72l-11-6.9A1 1 0 0 0 8 5.1Z"/></svg>'

	// ---------- sidebar ----------

	function buildSidebar() {
		sidebar.innerHTML = `
			<p class="finder-heading">Favorites</p>
			<button type="button" class="finder-place" data-folder="all">${FOLDER_ICON}<span>All Projects</span><em>${data.projects.length}</em></button>
			<button type="button" class="finder-place" data-folder="demos">${PLAY_ICON}<span>Live Demos</span><em>${data.projects.filter(p => p.demo).length}</em></button>
			<p class="finder-heading">Folders</p>
			${data.folders.map(f => `<button type="button" class="finder-place" data-folder="${esc(f.dir)}" title="${esc(f.name)}">${FOLDER_ICON}<span>${esc(f.dir)}</span><em>${f.count}</em></button>`).join('')}`
	}

	sidebar.addEventListener('click', e => {
		const place = e.target.closest('.finder-place')
		if (place) setFolder(place.dataset.folder)
	})

	// ---------- grid ----------

	function render() {
		shown = data.search(query).filter(p => folder === 'all' || (folder === 'demos' ? p.demo : p.dir === folder))
		grid.innerHTML = shown.map(p => `
			<button type="button" class="finder-item" role="option" data-slug="${esc(p.slug)}" aria-selected="${p.slug === selected}" title="${esc(p.title)}${p.demo ? ' · live demo' : ''}">
				<span class="finder-thumb"><img src="${esc(p.image)}" alt="" loading="lazy">${p.demo ? '<i class="finder-badge" aria-label="has a live demo">▶</i>' : ''}</span>
				<span>${esc(p.title)}</span>
			</button>`).join('') || `<p class="finder-empty">${query ? `No projects match “${esc(query)}”` : 'No projects here yet'}</p>`

		const current = data.folders.find(f => f.dir === folder)
		pathLabel.textContent = current ? current.name : folder === 'demos' ? 'Live Demos' : 'All Projects'
		status.textContent = `${shown.length} item${shown.length === 1 ? '' : 's'}${current && current.stack ? ' · ' + current.stack : ''}`
		sidebar.querySelectorAll('.finder-place').forEach(b => b.classList.toggle('is-selected', b.dataset.folder === folder))
	}

	function setFolder(dir) {
		folder = dir
		render()
		animate(grid, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 220)
	}

	function select(slug, scroll = true) {
		selected = slug
		grid.querySelectorAll('.finder-item').forEach(item => {
			const on = item.dataset.slug === slug
			item.setAttribute('aria-selected', on)
			if (on && scroll) item.scrollIntoView({ block: 'nearest' })
		})
	}

	function itemFor(slug) {
		return grid.querySelector(`.finder-item[data-slug="${CSS.escape(slug)}"]`)
	}

	grid.addEventListener('click', e => {
		const item = e.target.closest('.finder-item')
		if (item) select(item.dataset.slug, false)
		else select(null)
	})

	grid.addEventListener('dblclick', e => {
		const item = e.target.closest('.finder-item')
		if (item) quickLook(item.dataset.slug)
	})

	// On touch screens a single tap opens the preview
	grid.addEventListener('pointerup', e => {
		const item = e.target.closest('.finder-item')
		if (item && e.pointerType === 'touch') quickLook(item.dataset.slug)
	})

	grid.addEventListener('keydown', e => {
		if (!shown.length) return
		const i = Math.max(0, shown.findIndex(p => p.slug === selected))
		const columns = Math.max(1, Math.round(grid.clientWidth / (grid.firstElementChild.offsetWidth || 1)))
		const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }
		if (moves[e.key] !== undefined) {
			e.preventDefault()
			const next = shown[Math.min(shown.length - 1, Math.max(0, i + (selected ? moves[e.key] : 0)))]
			select(next.slug)
			itemFor(next.slug).focus()
		} else if ((e.key === ' ' || e.key === 'Enter') && selected) {
			e.preventDefault()
			quickLook(selected)
		}
	})

	searchBox.addEventListener('input', () => {
		query = searchBox.value.trim()
		render()
	})

	grid.innerHTML = '<p class="finder-empty">Loading projects…</p>'
	data.ready.then(ok => {
		buildSidebar()
		render()
		if (!ok) grid.innerHTML = '<p class="finder-empty">Couldn’t load projects.json</p>'
	})

	// ---------- Quick Look ----------

	const ql = document.getElementById('quicklook')
	const qlTitle = document.getElementById('ql-title')
	const qlImage = ql.querySelector('.ql-image')
	const qlDesc = ql.querySelector('.ql-desc')
	const qlDetails = ql.querySelector('.ql-details')
	const qlMeta = ql.querySelector('.ql-meta')
	const qlTags = ql.querySelector('.ql-tags')
	const qlOpen = ql.querySelector('.ql-open')
	const qlDemo = ql.querySelector('.ql-demo')
	const qlCount = ql.querySelector('.ql-count')
	let qlProject = null
	let qlReturnFocus = null

	function fillQuickLook(p) {
		qlProject = p
		qlTitle.textContent = p.title
		qlImage.src = p.image
		qlImage.alt = p.title
		qlDesc.textContent = p.desc
		qlDetails.innerHTML = p.details.map(d => `<li>${esc(d)}</li>`).join('')
		qlDetails.hidden = !p.details.length
		qlMeta.textContent = `${p.category} · ${p.dir}/`
		qlTags.innerHTML = p.stack.split(',').map(t => t.trim()).filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')
		qlOpen.href = p.url
		qlOpen.hidden = !p.url
		qlDemo.hidden = !p.demo
		const list = shown.some(s => s.slug === p.slug) ? shown : data.projects
		qlCount.textContent = `${list.indexOf(p) + 1} of ${list.length}`
	}

	// Zoom the panel out of the project's icon (or its spotlight row), like macOS
	function originRect(slug) {
		const item = win.hidden ? null : itemFor(slug)
		return item ? item.querySelector('img').getBoundingClientRect() : null
	}

	function zoomFrames(from) {
		const to = ql.getBoundingClientRect()
		if (!from) return [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }]
		const dx = from.left + from.width / 2 - (to.left + to.width / 2)
		const dy = from.top + from.height / 2 - (to.top + to.height / 2)
		return [
			{ opacity: 0.2, transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})` },
			{ opacity: 1, transform: 'none' },
		]
	}

	function quickLook(slug) {
		const p = data.find(slug)
		if (!p) return
		if (!ql.hidden) {
			fillQuickLook(p)
			select(p.slug)
			return
		}
		qlReturnFocus = document.activeElement
		select(p.slug)
		fillQuickLook(p)
		ql.hidden = false
		animate(ql, zoomFrames(originRect(p.slug)), 300)
		ql.querySelector('.ql-close').focus({ preventScroll: true })
	}

	async function closeQuickLook() {
		if (ql.hidden) return
		const back = qlProject ? originRect(qlProject.slug) : null
		await animate(ql, zoomFrames(back).reverse(), 220)
		ql.hidden = true
		if (qlReturnFocus && document.contains(qlReturnFocus)) qlReturnFocus.focus({ preventScroll: true })
	}

	function step(delta) {
		if (!qlProject) return
		const list = shown.some(s => s.slug === qlProject.slug) ? shown : data.projects
		const i = list.indexOf(qlProject)
		const next = list[(i + delta + list.length) % list.length]
		fillQuickLook(next)
		select(next.slug)
		animate(qlImage, [{ opacity: 0.3, transform: `translateX(${delta * 20}px)` }, { opacity: 1, transform: 'none' }], 200)
	}

	ql.querySelector('.ql-close').addEventListener('click', closeQuickLook)
	qlDemo.addEventListener('click', async () => {
		const id = qlProject && qlProject.demo
		await closeQuickLook()
		if (id && window.demos) window.demos.open(id)
	})
	ql.querySelector('.ql-prev').addEventListener('click', () => step(-1))
	ql.querySelector('.ql-next').addEventListener('click', () => step(1))

	document.addEventListener('keydown', e => {
		if (ql.hidden) return
		if (e.key === 'Escape' || (e.key === ' ' && !e.target.closest('input, a, button'))) {
			e.preventDefault()
			closeQuickLook()
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault()
			step(1)
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault()
			step(-1)
		}
	})

	// ---------- Spotlight ----------

	const spotlight = document.getElementById('spotlight')
	const spotInput = document.getElementById('spotlight-input')
	const spotResults = document.getElementById('spotlight-results')
	const APPS = [
		{ name: 'Terminal', hint: 'Application', run: () => window.wm.open('terminal') },
		{ name: 'Projects', hint: 'Application', run: () => show() },
		{ name: 'Live Demos', hint: 'Application', run: () => window.demos && window.demos.open() },
		{ name: 'Contact', hint: 'Application', run: () => window.wm.open('contact') },
		{ name: 'Mail', hint: 'Application', run: () => window.wm.open('mail') },
		{ name: 'Résumé', hint: 'Document', run: () => window.wm.open('resume') },
		{ name: 'Settings', hint: 'System', run: () => document.querySelector('.dock-item[data-app="settings"]').click() },
	]
	let spotItems = []
	let spotIndex = 0

	function renderSpotlight() {
		const q = spotInput.value.trim().toLowerCase()
		const apps = APPS.filter(a => !q || a.name.toLowerCase().includes(q)).map(a => ({ ...a, kind: 'app' }))
		const projects = (q ? data.search(q) : data.projects.slice(0, 5)).slice(0, 7).map(p => ({
			name: p.title, hint: p.dir + '/' + (p.demo ? ' · ▶ demo' : ''), kind: 'project', image: p.image, run: () => quickLook(p.slug),
		}))
		spotItems = q ? projects.concat(apps) : apps.concat(projects)
		spotIndex = 0
		spotResults.innerHTML = spotItems.length
			? spotItems.map((item, i) => `
				<li role="option" id="spot-${i}" data-index="${i}" aria-selected="${i === 0}">
					${item.image ? `<img src="${esc(item.image)}" alt="">` : `<span class="spot-app">${item.name === 'Terminal' ? '&gt;_' : item.name[0]}</span>`}
					<span class="spot-name">${esc(item.name)}</span>
					<span class="spot-hint">${esc(item.hint)}</span>
				</li>`).join('')
			: '<li class="spot-empty">No results</li>'
		spotInput.setAttribute('aria-activedescendant', spotItems.length ? 'spot-0' : '')
	}

	function moveSpot(delta) {
		if (!spotItems.length) return
		spotIndex = (spotIndex + delta + spotItems.length) % spotItems.length
		spotResults.querySelectorAll('li[data-index]').forEach(li => li.setAttribute('aria-selected', Number(li.dataset.index) === spotIndex))
		spotInput.setAttribute('aria-activedescendant', 'spot-' + spotIndex)
	}

	function openSpotlight() {
		if (!spotlight.hidden) return
		spotlight.hidden = false
		spotInput.value = ''
		renderSpotlight()
		spotInput.setAttribute('aria-expanded', 'true')
		animate(spotlight, [{ opacity: 0, transform: 'translateX(-50%) scale(0.96)' }, { opacity: 1, transform: 'translateX(-50%)' }], 160)
		spotInput.focus({ preventScroll: true })
	}

	function closeSpotlight() {
		spotlight.hidden = true
		spotInput.setAttribute('aria-expanded', 'false')
	}

	function chooseSpot(i) {
		const item = spotItems[i]
		if (!item) return
		closeSpotlight()
		item.run()
	}

	spotInput.addEventListener('input', renderSpotlight)
	spotInput.addEventListener('keydown', e => {
		if (e.key === 'ArrowDown') { e.preventDefault(); moveSpot(1) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); moveSpot(-1) }
		else if (e.key === 'Enter') { e.preventDefault(); chooseSpot(spotIndex) }
		else if (e.key === 'Escape') { e.preventDefault(); closeSpotlight() }
	})
	spotResults.addEventListener('click', e => {
		const li = e.target.closest('li[data-index]')
		if (li) chooseSpot(Number(li.dataset.index))
	})
	document.addEventListener('pointerdown', e => {
		if (!spotlight.hidden && !e.target.closest('.spotlight, .menubar-spotlight')) closeSpotlight()
	})
	document.addEventListener('keydown', e => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault()
			spotlight.hidden ? openSpotlight() : closeSpotlight()
		}
	})
	document.querySelector('.menubar-spotlight')?.addEventListener('click', () => {
		spotlight.hidden ? openSpotlight() : closeSpotlight()
	})

	// ---------- public API (Terminal, menu bar, Spotlight) ----------

	function show(dir) {
		if (dir && (dir === 'all' || dir === 'demos' || data.folders.some(f => f.dir === dir))) {
			folder = dir
			render()
		}
		return window.wm.open('projects')
	}

	win.addEventListener('wm:shown', () => {
		const target = (selected && itemFor(selected)) || grid.querySelector('.finder-item')
		if (target && ql.hidden) target.focus({ preventScroll: true })
	})

	window.finder = { show, quickLook, openSpotlight }
})()
