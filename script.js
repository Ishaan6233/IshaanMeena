// The initial theme is applied by the inline script in index.html's <head>.
// This file wires up the settings menu (menu bar + Dock) and theme switching.

const THEMES = [
	{ mode: 'light', name: 'light' },
	{ mode: 'dark', name: 'dark' },
	{ mode: 'navy', name: 'navy' },
	{ mode: 'green', name: 'sage' },
	{ mode: 'purple', name: 'plum' },
]

const root = document.documentElement
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const settingsButton = document.getElementById('settings-button')
const settingsPanel = document.getElementById('settings-panel')
const themeGrid = settingsPanel.querySelector('.theme-grid')
const appearanceButtons = settingsPanel.querySelectorAll('[data-appearance]')

// The theme the visitor has committed to (hover previews temporarily override root.dataset.theme)
let currentTheme = root.dataset.theme || 'light'

function isDark(mode) {
	return mode !== 'light'
}

function savedTheme() {
	try { return localStorage.getItem('theme') } catch (e) { return null }
}

function systemTheme() {
	return darkQuery.matches ? 'dark' : 'light'
}

function applyTheme(mode) {
	root.dataset.theme = mode
}

function setTheme(mode, save = true) {
	currentTheme = mode
	applyTheme(mode)
	if (save) {
		try { localStorage.setItem('theme', mode) } catch (e) {}
	}
	syncSettings()
}

function followSystem() {
	try { localStorage.removeItem('theme') } catch (e) {}
	setTheme(systemTheme(), false)
}

// ---------- settings panel ----------

for (const { mode, name } of THEMES) {
	const swatch = document.createElement('button')
	swatch.type = 'button'
	swatch.className = 'theme-swatch'
	swatch.dataset.mode = mode
	swatch.setAttribute('role', 'radio')
	swatch.setAttribute('aria-label', name + ' theme')
	// The mini window gets its own data-theme, so it renders in that theme's colours
	swatch.innerHTML = `
		<span class="swatch-window" data-theme="${mode}" aria-hidden="true">
			<span class="swatch-bar"><i></i><i></i><i></i></span>
			<span class="swatch-body">
				<span class="swatch-line"></span>
				<span class="swatch-line short"></span>
				<span class="swatch-card"></span>
			</span>
		</span>
		<span class="swatch-name">${name}</span>`
	themeGrid.appendChild(swatch)
}

function syncSettings() {
	const following = !savedTheme()
	for (const btn of appearanceButtons) {
		const a = btn.dataset.appearance
		const on = following ? a === 'system' : a === (isDark(currentTheme) ? 'dark' : 'light')
		btn.setAttribute('aria-checked', on)
	}
	for (const swatch of themeGrid.children) {
		swatch.setAttribute('aria-checked', swatch.dataset.mode === currentTheme)
	}
}

function openSettings() {
	settingsPanel.hidden = false
	settingsButton.setAttribute('aria-expanded', 'true')
	const selected = themeGrid.querySelector('[aria-checked="true"]') || themeGrid.firstElementChild
	selected.focus({ preventScroll: true })
}

function closeSettings() {
	if (settingsPanel.hidden) return
	settingsPanel.hidden = true
	settingsButton.setAttribute('aria-expanded', 'false')
	applyTheme(currentTheme) // drop any hover preview
}

settingsButton.addEventListener('click', () => {
	settingsPanel.hidden ? openSettings() : closeSettings()
})

document.addEventListener('click', e => {
	if (!e.target.closest('.settings-menu, [data-app="settings"]')) closeSettings()
})

document.addEventListener('keydown', e => {
	if (e.key === 'Escape' && !settingsPanel.hidden) {
		closeSettings()
		settingsButton.focus()
	}
})

// Hover or keyboard-focus a swatch to preview it on the whole page; click to keep it
themeGrid.addEventListener('pointerover', e => {
	const swatch = e.target.closest('.theme-swatch')
	if (swatch) applyTheme(swatch.dataset.mode)
})
themeGrid.addEventListener('pointerleave', () => applyTheme(currentTheme))
themeGrid.addEventListener('focusin', e => {
	const swatch = e.target.closest('.theme-swatch')
	if (swatch && swatch.matches(':focus-visible')) applyTheme(swatch.dataset.mode)
})
themeGrid.addEventListener('focusout', () => applyTheme(currentTheme))
themeGrid.addEventListener('click', e => {
	const swatch = e.target.closest('.theme-swatch')
	if (swatch) setTheme(swatch.dataset.mode)
})

// Arrow keys move between swatches, like a native radio group
themeGrid.addEventListener('keydown', e => {
	const swatches = Array.from(themeGrid.children)
	const i = swatches.indexOf(document.activeElement)
	if (i === -1) return
	const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
	if (!step) return
	e.preventDefault()
	swatches[(i + step + swatches.length) % swatches.length].focus()
})

for (const btn of appearanceButtons) {
	btn.addEventListener('click', () => {
		const a = btn.dataset.appearance
		if (a === 'system') followSystem()
		else setTheme(a)
	})
}

// The Dock's Settings icon opens the same panel
const dockSettings = document.querySelector('.dock-item[data-app="settings"]')
if (dockSettings) {
	dockSettings.addEventListener('click', () => {
		settingsPanel.hidden ? openSettings() : closeSettings()
	})
}

// Follow the OS setting until the visitor picks a theme themselves
darkQuery.addEventListener('change', function () {
	if (!savedTheme()) setTheme(systemTheme(), false)
})

setTheme(currentTheme, false)
