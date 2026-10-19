// Desktop widgets: movable, resizable (S / M / L) cards on the Mac's desktop, plus a Widgets app
// (a gallery) for adding more. The layout is saved in this visitor's browser only.
// The profile card is a widget too (the existing markup, filled in by profile.js); it is the default
// layout, and phones always show the widgets in a simple stack.
(function () {
	const desktop = document.getElementById('desktop')
	const profileEl = desktop && desktop.querySelector('.widget')
	const gallery = document.getElementById('widgets-window')
	if (!desktop || !profileEl) return

	const STORE = 'widgets.v1'
	const MENUBAR = 26
	const phone = window.matchMedia('(max-width: 700px)')
	const data = () => window.PORTFOLIO || { profile: {}, projects: [] }
	const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

	// ---------- widget types ----------
	// render(el, size) fills the widget body; tick (optional) refreshes it periodically.
	const TYPES = {
		profile: {
			name: 'Profile', icon: '👤', sizes: ['s', 'm', 'l'],
			desc: 'Who I am, my current role, stats and focus areas.',
		},
		clock: {
			name: 'Clock', icon: '🕒', sizes: ['s', 'm'],
			desc: 'Local time and date.',
			render(el, size) {
				const now = new Date()
				const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
				const deg = (v, max) => (v / max) * 360
				const h = now.getHours() % 12 + now.getMinutes() / 60
				el.innerHTML = size === 's'
					? `<div class="dw-clock-s"><strong>${esc(time)}</strong><span>${now.toLocaleDateString([], { weekday: 'long' })}</span></div>`
					: `<div class="dw-clock-m">
						<svg viewBox="0 0 100 100" class="dw-dial" aria-hidden="true">
							<circle cx="50" cy="50" r="46" class="face"/>
							${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="8" x2="50" y2="${i % 3 ? 13 : 16}" transform="rotate(${i * 30} 50 50)" class="tick"/>`).join('')}
							<line x1="50" y1="50" x2="50" y2="27" class="hour" transform="rotate(${deg(h, 12)} 50 50)"/>
							<line x1="50" y1="50" x2="50" y2="15" class="min" transform="rotate(${deg(now.getMinutes(), 60)} 50 50)"/>
							<circle cx="50" cy="50" r="2.5" class="pin"/>
						</svg>
						<div><strong>${esc(time)}</strong><span>${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>
					</div>`
			},
			tick: 15000,
		},
		demo: {
			name: 'Demo of the Day', icon: '▶', sizes: ['s', 'm', 'l'],
			desc: 'A different live project demo every day.',
			render(el, size) {
				if (!window.demos) return
				const ids = window.demos.ids()
				const day = Math.floor(Date.now() / 86400000)
				const id = ids[day % ids.length]
				const d = window.demos.get(id)
				el.innerHTML = `
					<p class="dw-label">Demo of the day</p>
					<div class="dw-row"><span class="dw-big-icon">${d.icon || '▶'}</span><div><strong>${esc(d.title)}</strong>${size !== 's' ? `<span class="dw-sub">${esc(d.tagline || '')}</span>` : ''}</div></div>
					${size === 'l' ? `<p class="dw-text">${esc(d.blurb)}</p>` : ''}
					${size !== 's' ? `<button type="button" class="dw-btn" data-demo-open="${esc(id)}">▶ Try it</button>` : ''}`
				el.querySelector('[data-demo-open]')?.addEventListener('click', () => window.demos.open(id))
				if (size === 's') el.onclick = () => window.demos.open(id)
			},
		},
		project: {
			name: 'Featured Project', icon: '⭐', sizes: ['s', 'm', 'l'],
			desc: 'Cycles through my projects, with a Quick Look shortcut.',
			state: { i: 0 },
			render(el, size) {
				const list = data().projects.filter(p => p.image && !p.image.startsWith('data:'))
				if (!list.length) return
				const p = list[this.state.i % list.length]
				el.innerHTML = `
					<p class="dw-label">Project</p>
					<img class="dw-img" src="${esc(p.image)}" alt="">
					<strong class="dw-title">${esc(p.title)}</strong>
					${size !== 's' ? `<p class="dw-text">${esc(p.desc)}</p>` : ''}
					${size === 'l' ? `<p class="dw-sub">${esc(p.stack)}</p><button type="button" class="dw-btn" data-ql>Quick Look</button>` : ''}`
				el.querySelector('[data-ql]')?.addEventListener('click', () => window.finder && window.finder.quickLook(p.slug))
				if (size !== 'l') el.onclick = () => window.finder && window.finder.quickLook(p.slug)
			},
			tick: 9000,
			advance() { this.state.i++ },
		},
		skills: {
			name: 'Skills', icon: '🧠', sizes: ['m', 'l'],
			desc: 'Languages, frameworks and tools I use.',
			render(el, size) {
				const groups = Object.entries(data().profile.skills || {}).slice(0, size === 'l' ? 7 : 3)
				el.innerHTML = `<p class="dw-label">Skills</p>${groups.map(([g, items]) =>
					`<div class="dw-skill"><b>${esc(g)}</b><span>${esc(items.slice(0, size === 'l' ? 8 : 5).join(' · '))}</span></div>`).join('')}`
			},
		},
		experience: {
			name: 'Experience', icon: '💼', sizes: ['s', 'm', 'l'],
			desc: 'My current role, or all roles at the large size.',
			render(el, size) {
				const jobs = data().profile.experience || []
				if (!jobs.length) return
				const shown = size === 'l' ? jobs : jobs.slice(0, 1)
				el.innerHTML = `<p class="dw-label">${size === 'l' ? 'Experience' : 'Now'}</p>${shown.map(j => `
					<div class="dw-job"><strong>${esc(j.role.split(',')[0])}</strong><span class="dw-sub">${esc(j.org)} · ${esc(j.dates)}</span>
					${size === 'm' ? `<p class="dw-text">${esc((j.bullets || [])[0] || '')}</p>` : ''}</div>`).join('')}
					${size !== 's' ? '<button type="button" class="dw-btn" data-open="resume">Résumé</button>' : ''}`
			},
		},
		github: {
			name: 'GitHub', icon: '🐙', sizes: ['s', 'm'],
			desc: 'Public repos and recently updated projects.',
			render(el, size) {
				const url = (data().profile.contact || {}).github || 'https://github.com/Ishaan6233'
				const user = url.split('/').filter(Boolean).pop()
				const info = githubCache
				el.innerHTML = `
					<p class="dw-label">GitHub</p>
					<a class="dw-row dw-link" href="${esc(url)}" target="_blank" rel="noopener"><span class="dw-big-icon">🐙</span><div><strong>@${esc(user)}</strong><span class="dw-sub">${info ? `${info.repos} public repos` : 'Open profile ↗'}</span></div></a>
					${size === 'm' && info && info.recent.length ? `<ul class="dw-list">${info.recent.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a></li>`).join('')}</ul>` : ''}`
				if (!info && !githubLoading) loadGithub(user)
			},
		},
	}

	let githubCache = null
	let githubLoading = false
	async function loadGithub(user) {
		githubLoading = true
		try {
			const cached = JSON.parse(sessionStorage.getItem('gh.' + user) || 'null')
			if (cached) githubCache = cached
			else {
				const [u, repos] = await Promise.all([
					fetch(`https://api.github.com/users/${user}`).then(r => r.json()),
					fetch(`https://api.github.com/users/${user}/repos?sort=pushed&per_page=4`).then(r => r.json()),
				])
				if (u && u.public_repos != null && Array.isArray(repos)) {
					githubCache = { repos: u.public_repos, recent: repos.filter(r => !r.fork).slice(0, 3).map(r => ({ name: r.name, url: r.html_url })) }
					try { sessionStorage.setItem('gh.' + user, JSON.stringify(githubCache)) } catch (e) {}
				}
			}
		} catch (e) { /* offline or rate-limited: the widget just links to the profile */ }
		if (githubCache) renderAll('github')
	}

	// ---------- layout state ----------

	const DEFAULT = [{ id: 'profile', type: 'profile', size: 'l' }]
	let layout = load()
	const els = new Map() // id -> element

	function load() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORE))
			// One of each type (older saved layouts could contain duplicates)
			if (Array.isArray(saved)) return saved.filter((w, i) => TYPES[w.type] && saved.findIndex(x => x.type === w.type) === i)
		} catch (e) {}
		return DEFAULT.map(w => ({ ...w }))
	}

	function save() {
		try { localStorage.setItem(STORE, JSON.stringify(layout)) } catch (e) {}
		document.dispatchEvent(new Event('widgets:changed'))
		renderGallery()
	}

	// ---------- rendering ----------

	function controls(w) {
		const t = TYPES[w.type]
		// macOS-style remove button, plus a resize corner (only if the widget has more than one size)
		return `<button type="button" class="dw-remove" title="Remove widget" aria-label="Remove ${esc(t.name)} widget">−</button>
		${t.sizes.length > 1 ? `<span class="dw-grip" aria-hidden="true" title="Drag to resize"><svg viewBox="0 0 16 16"><path d="M14 4 4 14M14 9l-5 5"/></svg></span>
		<span class="dw-size-badge" aria-hidden="true"></span>` : ''}`
	}

	function create(w) {
		let el
		if (w.type === 'profile') {
			el = profileEl
			el.hidden = false
		} else {
			el = document.createElement('section')
			el.className = 'dw dw-' + w.type
			el.innerHTML = '<div class="dw-body"></div>'
			el.setAttribute('aria-label', TYPES[w.type].name + ' widget')
			desktop.insertBefore(el, profileEl.nextSibling)
		}
		el.classList.add('dw')
		el.dataset.widgetId = w.id
		el.querySelectorAll(':scope > .dw-remove, :scope > .dw-grip, :scope > .dw-size-badge').forEach(n => n.remove())
		el.insertAdjacentHTML('beforeend', controls(w))
		els.set(w.id, el)
		grow.observe(el)
		bindDrag(el, w)
		return el
	}

	function apply(w) {
		const el = els.get(w.id)
		el.dataset.size = w.size
		if (w.x != null && !phone.matches) {
			el.style.left = (w.x * 100).toFixed(2) + '%'
			el.style.top = (w.y * 100).toFixed(2) + '%'
		} else {
			el.style.left = ''
			el.style.top = ''
		}
		const t = TYPES[w.type]
		if (t.render) t.render.call(t, el.querySelector('.dw-body'), w.size)
	}

	function renderAll(type) {
		for (const w of layout) if (!type || w.type === type) apply(w)
	}

	function build() {
		profileEl.hidden = !layout.some(w => w.type === 'profile')
		for (const el of desktop.querySelectorAll('.dw:not(.widget)')) el.remove()
		els.clear()
		for (const w of layout) create(w)
		renderAll()
		document.dispatchEvent(new Event('widgets:changed'))
		renderGallery()
	}

	// ---------- layout engine: no overlaps, prefer alignment ----------
	// All geometry is in desktop pixels. Widgets use offset boxes (they ignore animation transforms).

	const GAP = 12 // spacing between neighbouring widgets
	const MARGIN = 14 // distance from the desktop edges
	const SNAP = 22 // how close an edge must be to snap while dragging
	const GRID = 24 // drops in open space snap to this grid
	const ALIGN_PULL = 90 // drops this close to an aligned spot snap to it

	// Width of each size, as a fraction of the desktop (heights follow the content)
	const WIDTH = { s: 0.13, m: 0.19, l: 0.24 }
	const SIZE_NAME = { s: 'Small', m: 'Medium', l: 'Large' }
	const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b))

	function deskSize() { return { W: desktop.clientWidth, H: desktop.clientHeight } }

	const boxOfWidget = el => ({ el, left: el.offsetLeft, top: el.offsetTop, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight })

	function dockBox() {
		const dock = desktop.querySelector('.dock')
		if (!dock) return null
		const d = desktop.getBoundingClientRect(), r = dock.getBoundingClientRect()
		return { left: r.left - d.left, top: r.top - d.top, right: r.right - d.left, bottom: r.bottom - d.top }
	}

	// Everything a widget must not overlap: the other widgets and the Dock (windows float above, so they don't count)
	function obstacles(except) {
		const list = [...els.values()].filter(el => el !== except && !el.hidden && el.offsetParent).map(boxOfWidget)
		const dock = dockBox()
		if (dock) list.push(dock)
		return list
	}

	function fits(x, y, w, h, obs) {
		const { W, H } = deskSize()
		if (x < MARGIN - 0.5 || y < MENUBAR + 8 - 0.5 || x + w > W - MARGIN + 0.5 || y + h > H - 8 + 0.5) return false
		return obs.every(b => x + w + GAP <= b.left + 0.5 || x >= b.right + GAP - 0.5 || y + h + GAP <= b.top + 0.5 || y >= b.bottom + GAP - 0.5)
	}

	// Aligned positions next to other widgets (edges lined up, GAP apart) and against the desktop edges
	function alignedCandidates(w, h, obs) {
		const { W, H } = deskSize()
		const xs = new Set([MARGIN, W - MARGIN - w])
		const ys = new Set([MENUBAR + 12, H - 8 - h])
		for (const b of obs) {
			if (!b.el) continue // the Dock isn't an alignment target
			xs.add(b.left); xs.add(b.right - w); xs.add(b.right + GAP); xs.add(b.left - GAP - w)
			ys.add(b.top); ys.add(b.bottom - h); ys.add(b.bottom + GAP); ys.add(b.top - GAP - h)
		}
		const out = []
		for (const x of xs) for (const y of ys) out.push({ x, y })
		return out
	}

	// Nearest free place to (x0, y0): aligned spots win unless a plain spot is much closer
	function nearestFree(el, x0, y0, obs = obstacles(el)) {
		const w = el.offsetWidth, h = el.offsetHeight
		if (fits(x0, y0, w, h, obs)) return { x: x0, y: y0 }
		const dist = p => Math.hypot(p.x - x0, p.y - y0)
		let best = null
		for (const p of alignedCandidates(w, h, obs)) {
			if (fits(p.x, p.y, w, h, obs) && (!best || dist(p) < best.d)) best = { ...p, d: dist(p) }
		}
		const { W, H } = deskSize()
		let plain = null
		for (let y = MENUBAR + 12; y + h <= H - 8; y += 8) {
			for (let x = MARGIN; x + w <= W - MARGIN; x += 8) {
				const p = { x, y }
				if (fits(x, y, w, h, obs) && (!plain || dist(p) < plain.d)) plain = { ...p, d: dist(p) }
			}
		}
		if (best && (!plain || best.d <= plain.d + 120)) return best
		return plain || best || { x: clamp(x0, MARGIN, W - MARGIN - w), y: clamp(y0, MENUBAR + 12, H - 8 - h) }
	}

	// Where a dropped widget lands: always snapped, never overlapping.
	// 1) the closest free aligned spot (edges lined up, GAP apart) if it is near the drop point,
	// 2) otherwise the drop point rounded to the grid, moved to the nearest free spot if needed.
	function dropSpot(el, x0, y0) {
		const w = el.offsetWidth, h = el.offsetHeight
		const obs = obstacles(el)
		const dist = p => Math.hypot(p.x - x0, p.y - y0)
		const aligned = alignedCandidates(w, h, obs).filter(p => fits(p.x, p.y, w, h, obs)).sort((a, b) => dist(a) - dist(b))[0]
		if (aligned && dist(aligned) <= ALIGN_PULL) return aligned
		const { W, H } = deskSize()
		const gx = clamp(MARGIN + Math.round((x0 - MARGIN) / GRID) * GRID, MARGIN, W - MARGIN - w)
		const gy = clamp(MENUBAR + 12 + Math.round((y0 - MENUBAR - 12) / GRID) * GRID, MENUBAR + 12, H - 8 - h)
		return fits(gx, gy, w, h, obs) ? { x: gx, y: gy } : nearestFree(el, gx, gy, obs)
	}

	// For a new widget: the first aligned spot in reading order (top-left first)
	function firstAligned(el) {
		const w = el.offsetWidth, h = el.offsetHeight
		const obs = obstacles(el)
		// windows are respected here, so a new widget doesn't appear under an open app
		for (const win of desktop.querySelectorAll('.app-window:not([hidden])')) {
			const d = desktop.getBoundingClientRect(), r = win.getBoundingClientRect()
			obs.push({ left: r.left - d.left, top: r.top - d.top, right: r.right - d.left, bottom: r.bottom - d.top })
		}
		const spots = alignedCandidates(w, h, obs).filter(p => fits(p.x, p.y, w, h, obs))
		spots.sort((a, b) => a.y - b.y || a.x - b.x)
		return spots[0] || nearestFree(el, MARGIN, MENUBAR + 12)
	}

	function place(w, x, y, animate) {
		const el = els.get(w.id)
		const { W, H } = deskSize()
		const fromL = el.offsetLeft, fromT = el.offsetTop
		w.x = x / W
		w.y = y / H
		el.style.left = (w.x * 100) + '%'
		el.style.top = (w.y * 100) + '%'
		if (animate && el.animate && (Math.abs(fromL - x) > 1 || Math.abs(fromT - y) > 1)) {
			el.animate([{ transform: `translate(${fromL - x}px, ${fromT - y}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
		}
	}

	// Make the whole layout valid: `pinned` keeps its place, everything else moves to the nearest free spot
	function settle(pinned) {
		if (phone.matches) return
		const order = layout.filter(w => els.get(w.id) && !els.get(w.id).hidden)
		if (pinned) order.sort((a, b) => (a.id === pinned.id ? -1 : b.id === pinned.id ? 1 : 0))
		const placed = []
		const dock = dockBox()
		for (const w of order) {
			const el = els.get(w.id)
			const obs = placed.map(boxOfWidget)
			if (dock) obs.push(dock)
			const x = el.offsetLeft, y = el.offsetTop
			if (!fits(x, y, el.offsetWidth, el.offsetHeight, obs)) {
				const p = nearestFree(el, x, y, obs)
				place(w, p.x, p.y, true)
			}
			placed.push(el)
		}
	}

	// ---------- alignment guides while dragging ----------

	const guides = [document.createElement('div'), document.createElement('div')]
	guides[0].className = 'dw-guide v'
	guides[1].className = 'dw-guide h'
	guides.forEach(g => { g.hidden = true; desktop.appendChild(g) })

	function snap(el, x, y) {
		const w = el.offsetWidth, h = el.offsetHeight
		const others = obstacles(el).filter(b => b.el)
		let bx = null, by = null
		for (const b of others) {
			for (const [cand, line] of [[b.left, b.left], [b.right - w, b.right], [b.right + GAP, null], [b.left - GAP - w, null]]) {
				if (Math.abs(cand - x) < SNAP && (!bx || Math.abs(cand - x) < Math.abs(bx.v - x))) bx = { v: cand, line: line ?? (cand === b.right + GAP ? b.right + GAP / 2 : b.left - GAP / 2) }
			}
			for (const [cand, line] of [[b.top, b.top], [b.bottom - h, b.bottom], [b.bottom + GAP, null], [b.top - GAP - h, null]]) {
				if (Math.abs(cand - y) < SNAP && (!by || Math.abs(cand - y) < Math.abs(by.v - y))) by = { v: cand, line: line ?? (cand === b.bottom + GAP ? b.bottom + GAP / 2 : b.top - GAP / 2) }
			}
		}
		const { W, H } = deskSize()
		guides[0].hidden = !bx
		guides[1].hidden = !by
		if (bx) Object.assign(guides[0].style, { left: bx.line + 'px', top: '0', height: H + 'px' })
		if (by) Object.assign(guides[1].style, { top: by.line + 'px', left: '0', width: W + 'px' })
		return { x: bx ? bx.v : x, y: by ? by.v : y }
	}

	function hideGuides() { guides.forEach(g => { g.hidden = true }) }

	// ---------- interaction: drag to move, drag the corner to resize, ⊖ to remove ----------

	function bindDrag(el, w) {
		el.onpointerdown = e => {
			if (phone.matches || e.button !== 0) return
			const grip = e.target.closest('.dw-grip')
			if (!grip && e.target.closest('button, a, input, select, textarea, [data-open]')) return
			e.preventDefault()
			const { W, H } = deskSize()
			const start = { x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth }
			const t = TYPES[w.type]
			const minW = WIDTH[t.sizes[0]] * W * 0.85
			const maxW = WIDTH[t.sizes[t.sizes.length - 1]] * W * 1.12
			let moved = false
			el.setPointerCapture(e.pointerId)
			el.classList.add(grip ? 'resizing' : 'dragging')
			const badge = grip ? el.querySelector('.dw-size-badge') : null

			el.onpointermove = ev => {
				const dx = ev.clientX - start.x, dy = ev.clientY - start.y
				if (Math.hypot(dx, dy) > 4) moved = true
				if (!moved) return
				if (grip) {
					// The widget follows the corner smoothly; content and the badge preview the size it will snap to
					const width = clamp(start.width + dx, minW, maxW)
					el.style.width = width + 'px'
					const want = width / W
					const best = t.sizes.reduce((a, b) => (Math.abs(WIDTH[b] - want) < Math.abs(WIDTH[a] - want) ? b : a))
					badge.textContent = SIZE_NAME[best]
					if (best !== w.size) { w.size = best; apply(w) }
				} else {
					const raw = {
						x: clamp(start.left + dx, MARGIN, W - MARGIN - el.offsetWidth),
						y: clamp(start.top + dy, MENUBAR + 8, H - 8 - el.offsetHeight),
					}
					const p = snap(el, raw.x, raw.y)
					el.style.left = (p.x / W * 100) + '%'
					el.style.top = (p.y / H * 100) + '%'
					el.classList.toggle('dw-blocked', !fits(p.x, p.y, el.offsetWidth, el.offsetHeight, obstacles(el)))
				}
			}
			el.onpointerup = el.onpointercancel = () => {
				el.onpointermove = el.onpointerup = el.onpointercancel = null
				el.classList.remove('dragging', 'resizing', 'dw-blocked')
				hideGuides()
				if (grip) {
					// Release: glide from the dragged width to the snapped size, then push neighbours out of the way
					el.classList.add('dw-snapping')
					el.style.width = ''
					setTimeout(() => {
						el.classList.remove('dw-snapping')
						const p = nearestFree(el, el.offsetLeft, el.offsetTop, obstacles(el).filter(b => !b.el)) // stay inside the desktop
						place(w, p.x, p.y, true)
						settle(w)
						save()
					}, 260)
				} else if (moved) {
					// Snap into place: an aligned spot nearby, or the grid; slides off anything it would overlap
					const p = dropSpot(el, el.offsetLeft, el.offsetTop)
					place(w, p.x, p.y, true)
					save()
				}
				if (moved) {
					// Swallow the click that follows a drag so widgets don't also activate
					el.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault() }, { capture: true, once: true })
				}
			}
		}
		el.querySelector(':scope > .dw-remove').onclick = e => {
			e.stopPropagation()
			remove(w.id)
		}
	}

	function remove(id) {
		layout = layout.filter(w => w.id !== id)
		const el = els.get(id)
		if (el) {
			el.classList.add('dw-leaving')
			setTimeout(() => {
				if (el === profileEl) { profileEl.hidden = true; el.classList.remove('dw-leaving') }
				else el.remove()
				document.dispatchEvent(new Event('widgets:changed'))
			}, 180)
		}
		els.delete(id)
		save()
	}

	// Content can grow after placement (images, data arriving): keep the layout valid
	let settleTimer = 0
	const grow = new ResizeObserver(() => {
		clearTimeout(settleTimer)
		settleTimer = setTimeout(() => {
			if (desktop.querySelector('.dw.dragging, .dw.resizing, .dw.dw-snapping')) return
			settle()
			save()
		}, 120)
	})

	function add(type, size) {
		const t = TYPES[type]
		if (layout.some(w => w.type === type)) return // one of each widget on the desktop
		const w = { id: type + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, size: size || (t.sizes.includes('m') ? 'm' : t.sizes[0]) }
		if (type === 'profile') w.id = 'profile'
		layout.push(w)
		const el = create(w)
		apply(w)
		if (!phone.matches) {
			const p = firstAligned(el)
			place(w, p.x, p.y, false)
		}
		save()
		el.classList.add('dw-new')
		setTimeout(() => el.classList.remove('dw-new'), 700)
	}

	// ---------- the Widgets app (gallery) ----------

	function renderGallery() {
		if (!gallery) return
		const list = gallery.querySelector('.wg-list')
		list.innerHTML = Object.entries(TYPES).map(([type, t]) => {
			const placed = layout.find(w => w.type === type)
			return `<li class="wg-item${placed ? ' is-placed' : ''}">
				<span class="wg-icon" aria-hidden="true">${t.icon}</span>
				<div class="wg-text"><strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span></div>
				<div class="wg-add">
					${placed
						? `<span class="wg-status">✓ On desktop</span><button type="button" class="demo-btn" data-wg-remove="${esc(placed.id)}">Remove</button>`
						: `<button type="button" class="demo-btn primary" data-add="${type}">+ Add</button>`}
				</div>
			</li>`
		}).join('')
	}

	if (gallery) {
		gallery.addEventListener('click', e => {
			const b = e.target.closest('[data-add]')
			if (b) add(b.dataset.add)
			const r = e.target.closest('[data-wg-remove]')
			if (r) remove(r.dataset.wgRemove)
			if (e.target.closest('[data-wg-reset]')) {
				layout = DEFAULT.map(w => ({ ...w }))
				build()
				save()
			}
		})
	}

	// ---------- periodic refresh, responsive ----------

	setInterval(() => {
		for (const [type, t] of Object.entries(TYPES)) {
			if (!t.tick) continue
			const due = (t.lastTick || 0) + t.tick <= Date.now()
			if (!due) continue
			t.lastTick = Date.now()
			if (t.advance) t.advance()
			renderAll(type)
		}
	}, 3000)

	phone.addEventListener('change', () => { renderAll(); settle() })
	let resizeTimer = 0
	window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { settle(); save() }, 200) })

	// Content widgets need the portfolio data and demo list
	build()
	if (data().ready) data().ready.then(() => { renderAll(); requestAnimationFrame(() => settle()) })

	window.widgets = { add, remove, reset: () => { layout = DEFAULT.map(w => ({ ...w })); build(); save() }, types: () => Object.keys(TYPES) }
})()
