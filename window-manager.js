// Window manager for the hero desktop. Every .app-window[data-app] gets macOS behaviour:
//   red    close (relaunch from its Dock icon: bounce, then zoom out of the icon)
//   yellow minimize with a genie effect into its Dock icon (click the icon to restore)
//   green  zoom to fill the screen (double-click the title bar too; Esc restores)
// Windows can be dragged by their title bar, and clicking one brings it to the front.
(function () {
	const desktop = document.getElementById('desktop')
	if (!desktop) return

	const appName = document.getElementById('menubar-app')
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
	const phoneLayout = window.matchMedia('(max-width: 700px)')
	const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
	const MENUBAR_H = 26

	const windows = {}
	let zTop = 10

	// ---------- helpers ----------

	function animate(el, keyframes, options) {
		if (reduceMotion || !el.animate) return Promise.resolve()
		return el.animate(keyframes, { easing: EASE, ...options }).finished.catch(() => {})
	}

	function transformOf(el) {
		const t = getComputedStyle(el).transform
		return t === 'none' ? '' : t
	}

	function centreDelta(from, to) {
		return {
			x: to.left + to.width / 2 - (from.left + from.width / 2),
			y: to.top + to.height / 2 - (from.top + from.height / 2),
		}
	}

	// The window funnels down into the Dock icon, then slides into it
	function genieFrames(w) {
		const from = w.el.getBoundingClientRect()
		const to = w.dockItem.getBoundingClientRect()
		const d = centreDelta(from, to)
		const base = transformOf(w.el)
		const px = ((to.left + to.width / 2 - from.left) / from.width) * 100
		const l = px - 10
		const r = px + 10
		return [
			{ offset: 0, transform: base || 'none', clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)', opacity: 1 },
			{ offset: 0.45, transform: `translate(${d.x * 0.1}px, ${d.y * 0.3}px) ${base} scale(0.9, 0.7)`, clipPath: `polygon(0% 0%, 100% 0%, ${r}% 100%, ${l}% 100%)`, opacity: 1 },
			{ offset: 1, transform: `translate(${d.x}px, ${d.y}px) ${base} scale(0.12, 0.04)`, clipPath: `polygon(${l}% 0%, ${r}% 0%, ${r}% 100%, ${l}% 100%)`, opacity: 0.2 },
		]
	}

	function reversed(frames) {
		return frames.slice().reverse().map(f => ({ ...f, offset: 1 - f.offset }))
	}

	function setOffset(w, x, y) {
		w.offset = { x, y }
		w.el.style.setProperty('--dx', x + 'px')
		w.el.style.setProperty('--dy', y + 'px')
	}

	function bounce(w) {
		if (!w.dockItem) return Promise.resolve()
		return animate(w.dockItem.querySelector('.dock-icon'), [
			{ transform: 'translateY(0)' },
			{ transform: 'translateY(-18px)' },
			{ transform: 'translateY(0)' },
			{ transform: 'translateY(-8px)' },
			{ transform: 'translateY(0)' },
		], { duration: 600 })
	}

	function visible(w) { return !w.el.hidden }
	function isZoomed(w) { return w.el.classList.contains('is-zoomed') }

	function syncState() {
		let front = null
		for (const w of Object.values(windows)) {
			if (w.dockItem) w.dockItem.classList.toggle('is-running', visible(w) || w.minimized)
			if (visible(w) && (!front || w.z > front.z)) front = w
		}
		for (const w of Object.values(windows)) w.el.classList.toggle('is-active', w === front)
		if (appName) appName.textContent = front ? front.title : 'Finder'
		// On phones, open sheets cover the screen, so lock page scroll behind them
		const covering = Object.values(windows).some(w => visible(w) && (isZoomed(w) || w.el.dataset.sheet !== undefined))
		document.body.classList.toggle('window-covering', covering && phoneLayout.matches)
	}

	// ---------- actions ----------

	function focus(app) {
		const w = windows[app]
		if (!w || !visible(w)) return
		w.z = ++zTop
		w.el.style.zIndex = w.z
		syncState()
	}

	function setZoomed(w, on) {
		if (on === isZoomed(w)) return Promise.resolve()
		const first = w.el.getBoundingClientRect()
		w.el.classList.toggle('is-zoomed', on)
		syncState()
		const last = w.el.getBoundingClientRect()
		const base = transformOf(w.el)
		return animate(w.el, [
			{
				transformOrigin: 'top left',
				transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height}) ${base}`,
			},
			{ transformOrigin: 'top left', transform: base || 'none' },
		], { duration: 320 })
	}

	async function run(w, task) {
		if (w.busy) return Promise.resolve()
		w.busy = true
		try { await task() } finally { w.busy = false }
	}

	function zoom(app) {
		const w = windows[app]
		if (!w || !visible(w)) return
		return run(w, async () => {
			focus(app)
			await setZoomed(w, !isZoomed(w))
			w.el.dispatchEvent(new CustomEvent('wm:shown'))
		})
	}

	function minimize(app) {
		const w = windows[app]
		if (!w || !visible(w)) return
		return run(w, async () => {
			if (isZoomed(w)) await setZoomed(w, false)
			if (w.dockItem && !phoneLayout.matches) {
				await animate(w.el, genieFrames(w), { duration: 520, easing: 'cubic-bezier(0.55, 0, 0.75, 0.6)' })
			} else {
				await animate(w.el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 200 })
			}
			w.el.hidden = true
			w.minimized = true
			syncState()
		})
	}

	function close(app) {
		const w = windows[app]
		if (!w || !visible(w)) return
		return run(w, async () => {
			if (isZoomed(w)) await setZoomed(w, false)
			const base = transformOf(w.el)
			await animate(w.el, [
				{ transform: base || 'none', opacity: 1 },
				{ transform: `${base} scale(0.92)`, opacity: 0 },
			], { duration: 200 })
			w.el.hidden = true
			w.minimized = false
			syncState()
			w.el.dispatchEvent(new CustomEvent('wm:closed'))
		})
	}

	function open(app) {
		const w = windows[app]
		if (!w) return
		if (visible(w)) {
			focus(app)
			w.el.dispatchEvent(new CustomEvent('wm:shown'))
			return Promise.resolve()
		}
		return run(w, async () => {
			const restoring = w.minimized
			if (!restoring) {
				await bounce(w)
				setOffset(w, 0, 0)
			}
			w.el.hidden = false
			w.minimized = false
			focus(app)
			if (restoring && w.dockItem && !phoneLayout.matches) {
				await animate(w.el, reversed(genieFrames(w)), { duration: 480, easing: 'cubic-bezier(0.25, 0.4, 0.45, 1)' })
			} else if (w.dockItem && !phoneLayout.matches) {
				// Launch: grow out of the Dock icon
				const d = centreDelta(w.el.getBoundingClientRect(), w.dockItem.getBoundingClientRect())
				const base = transformOf(w.el)
				await animate(w.el, [
					{ transform: `translate(${d.x}px, ${d.y}px) ${base} scale(0.1)`, opacity: 0 },
					{ transform: base || 'none', opacity: 1 },
				], { duration: 420 })
			} else {
				await animate(w.el, [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 280 })
			}
			w.el.dispatchEvent(new CustomEvent('wm:shown'))
		})
	}

	// ---------- setup ----------

	function register(el) {
		const app = el.dataset.app
		const w = {
			el,
			app,
			title: el.dataset.title || app,
			dockItem: document.querySelector(`.dock-item[data-app="${app}"]`),
			minimized: false,
			busy: false,
			offset: { x: 0, y: 0 },
			z: ++zTop,
		}
		windows[app] = w
		el.style.zIndex = w.z

		const titleBar = el.querySelector('.titlebar')
		const actions = { close, minimize, maximize: zoom }

		titleBar.querySelectorAll('.light').forEach(light => {
			light.addEventListener('click', e => {
				e.stopPropagation()
				actions[light.dataset.action](app)
			})
		})

		titleBar.addEventListener('dblclick', e => {
			if (!e.target.closest('button, input')) zoom(app)
		})

		// Clicking anywhere in a window brings it to the front
		el.addEventListener('pointerdown', () => { if (w.z !== zTop) focus(app) }, true)

		// Dragging by the title bar, kept inside the desktop
		let drag = null
		titleBar.addEventListener('pointerdown', e => {
			if (e.button !== 0 || e.target.closest('button, input') || isZoomed(w) || phoneLayout.matches || !finePointer.matches) return
			const win = el.getBoundingClientRect()
			const desk = desktop.getBoundingClientRect()
			drag = {
				x: e.clientX,
				y: e.clientY,
				origin: { ...w.offset },
				minX: w.offset.x + desk.left - win.left - win.width + 80,
				maxX: w.offset.x + desk.right - win.right + win.width - 80,
				minY: w.offset.y + desk.top + MENUBAR_H - win.top,
				maxY: w.offset.y + desk.bottom - 40 - win.top,
			}
			titleBar.setPointerCapture(e.pointerId)
			el.classList.add('is-dragging')
		})
		titleBar.addEventListener('pointermove', e => {
			if (!drag) return
			setOffset(w,
				Math.min(drag.maxX, Math.max(drag.minX, drag.origin.x + e.clientX - drag.x)),
				Math.min(drag.maxY, Math.max(drag.minY, drag.origin.y + e.clientY - drag.y)))
		})
		const endDrag = () => { drag = null; el.classList.remove('is-dragging') }
		titleBar.addEventListener('pointerup', endDrag)
		titleBar.addEventListener('pointercancel', endDrag)

		if (w.dockItem) w.dockItem.addEventListener('click', () => open(app))
	}

	desktop.querySelectorAll('.app-window[data-app]').forEach(register)
	syncState()

	document.addEventListener('keydown', e => {
		if (e.key !== 'Escape') return
		// Overlays (Quick Look, Spotlight, menus) handle Esc first
		if (document.querySelector('.quicklook:not([hidden]), .spotlight:not([hidden]), #settings-panel:not([hidden]), .menu-dropdown:not([hidden])')) return
		const front = Object.values(windows).filter(w => visible(w) && isZoomed(w)).sort((a, b) => b.z - a.z)[0]
		if (front) zoom(front.app)
	})

	// Dragged positions don't make sense after the layout changes size
	window.addEventListener('resize', () => Object.values(windows).forEach(w => setOffset(w, 0, 0)))

	window.wm = {
		open,
		close,
		minimize,
		zoom,
		focus,
		isOpen: app => !!windows[app] && visible(windows[app]),
	}
})()
