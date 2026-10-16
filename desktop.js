// The hero desktop itself: boot animation, menu-bar clock, the logo menu
// (About / Spotlight / Sleep / Restart) and the Dock's magnification.
(function () {
	const desktop = document.getElementById('desktop')
	if (!desktop) return

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

	function ready() {
		window.__desktopReady = true
		document.dispatchEvent(new Event('desktop:ready'))
	}

	// ---------- boot (once per browser session; "Restart…" replays it) ----------

	const bootScreen = document.getElementById('boot-screen')

	function alreadyBooted() {
		try { return sessionStorage.getItem('booted') === '1' } catch (e) { return true }
	}

	async function boot() {
		const simpleView = document.documentElement.dataset.view === 'simple'
		if (reduceMotion || !bootScreen || alreadyBooted() || simpleView) return ready()
		try { sessionStorage.setItem('booted', '1') } catch (e) {}

		desktop.classList.add('is-booting')
		bootScreen.hidden = false

		// Kept short so nobody waits; any click or key press skips it
		let skip
		const skipped = new Promise(resolve => { skip = resolve })
		document.addEventListener('pointerdown', skip, { once: true })
		document.addEventListener('keydown', skip, { once: true })
		await Promise.race([wait(1000), skipped]) // the progress bar fills via CSS
		document.removeEventListener('pointerdown', skip)
		document.removeEventListener('keydown', skip)

		// Never let the fade hold the boot screen up (animations can be paused in background tabs)
		await Promise.race([bootScreen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease' }).finished.catch(() => {}), wait(400)])
		bootScreen.hidden = true
		desktop.classList.remove('is-booting')
		desktop.classList.add('is-waking') // menu bar, dock and windows animate in (CSS)
		ready()
		await wait(800)
		desktop.classList.remove('is-waking')
	}

	boot()

	// ---------- sleep ----------

	function sleep() {
		desktop.classList.add('is-asleep')
		// Wake on the next click or key press (skip the click that chose "Sleep")
		setTimeout(() => {
			const wake = () => {
				desktop.classList.remove('is-asleep')
				document.removeEventListener('pointerdown', wake, true)
				document.removeEventListener('keydown', wake, true)
			}
			document.addEventListener('pointerdown', wake, true)
			document.addEventListener('keydown', wake, true)
		}, 50)
	}

	// ---------- logo menu ----------

	const logoButton = document.getElementById('logo-button')
	const logoMenu = document.getElementById('logo-menu')

	function setLogoMenu(open) {
		logoMenu.hidden = !open
		logoButton.setAttribute('aria-expanded', open)
		if (open) logoMenu.querySelector('button').focus({ preventScroll: true })
	}

	const menuActions = {
		about() {
			window.wm.open('terminal').then(() => window.terminalShell && window.terminalShell.run('neofetch'))
		},
		spotlight() { window.finder && window.finder.openSpotlight() },
		simple() { window.portfolioView && window.portfolioView.set('simple', { focus: true }) },
		sleep,
		restart() {
			try { sessionStorage.removeItem('booted') } catch (e) {}
			window.scrollTo(0, 0)
			location.reload()
		},
	}

	if (logoButton && logoMenu) {
		logoButton.addEventListener('click', () => setLogoMenu(logoMenu.hidden))
		logoMenu.addEventListener('click', e => {
			const item = e.target.closest('[data-action]')
			if (!item) return
			setLogoMenu(false)
			menuActions[item.dataset.action]()
		})
		document.addEventListener('click', e => {
			if (!logoMenu.hidden && !e.target.closest('.logo-menu')) setLogoMenu(false)
		})
		document.addEventListener('keydown', e => {
			if (e.key === 'Escape' && !logoMenu.hidden) {
				setLogoMenu(false)
				logoButton.focus()
			}
		})
	}

	// ---------- wallpaper: the page's aurora, continued through the screen ----------
	// The layer is sized and offset to match the hero section exactly, so its blobs
	// (same viewport-based sizes and keyframes as the backdrop) line up with the ones outside.
	const hero = document.getElementById('hero')
	const screenAurora = desktop.querySelector('.screen-aurora')

	function alignAurora() {
		if (!hero || !screenAurora) return
		const h = hero.getBoundingClientRect()
		const d = desktop.getBoundingClientRect()
		screenAurora.style.left = (h.left - d.left) + 'px'
		screenAurora.style.top = (h.top - d.top) + 'px'
		screenAurora.style.width = h.width + 'px'
		screenAurora.style.height = h.height + 'px'
	}

	if (hero && screenAurora) {
		alignAurora()
		new ResizeObserver(alignAurora).observe(hero)
		new ResizeObserver(alignAurora).observe(desktop)
		window.addEventListener('resize', alignAurora)
	}

	// ---------- menu-bar clock ----------

	const clock = document.getElementById('menubar-clock')
	const compact = window.matchMedia('(max-width: 700px)')

	function tick() {
		const now = new Date()
		const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
		const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
		clock.textContent = compact.matches ? time : `${date}  ${time}`
		clock.dateTime = now.toISOString()
	}

	if (clock) {
		tick()
		setInterval(tick, 15000)
		compact.addEventListener('change', tick)
	}

	// ---------- Dock magnification ----------

	const dock = document.querySelector('.dock')
	const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
	if (!dock || !canHover || reduceMotion) return

	const items = Array.from(dock.querySelectorAll('.dock-item'))
	const MAX_EXTRA = 26 // px added to the icon right under the cursor
	const RANGE = 110 // px from the cursor at which magnification fades out
	let base = 46
	let centers = null // resting icon centres, measured before anything grows

	dock.addEventListener('pointerenter', () => {
		base = parseFloat(getComputedStyle(items[0]).getPropertyValue('--size')) || base
		centers = items.map(item => {
			const rect = item.getBoundingClientRect()
			return rect.left + rect.width / 2
		})
	})

	dock.addEventListener('pointermove', e => {
		if (!centers) return
		dock.classList.add('magnifying')
		for (let i = 0; i < items.length; i++) {
			const t = Math.max(0, 1 - Math.abs(e.clientX - centers[i]) / RANGE)
			// Smooth falloff so neighbours grow a little too
			items[i].style.setProperty('--size', base + MAX_EXTRA * (t * t * (3 - 2 * t)) + 'px')
		}
	})

	dock.addEventListener('pointerleave', () => {
		centers = null
		dock.classList.remove('magnifying')
		for (const item of items) item.style.removeProperty('--size')
	})
})()
