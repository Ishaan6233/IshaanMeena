// Interactive shell for the Terminal app on the hero desktop.
// Project data comes from projects.json (via projects-data.js), so new projects show up here automatically.
(function () {
	const terminal = document.getElementById('terminal')
	if (!terminal) return

	const output = document.getElementById('term-output')
	const form = document.getElementById('term-form')
	const input = document.getElementById('term-input')
	const promptEl = document.getElementById('term-prompt')
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

	const THEMES = ['light', 'dark', 'navy', 'green', 'purple']
	const SECTIONS = { top: 'front-page', contact: 'contact' }

	const FILES = {
		'about.txt': () => [
			esc(window.PORTFOLIO.profile.summary || ''),
			'',
			`Try ${cmd('experience')}, ${cmd('projects')} or ${cmd('resume')}, or ${cmd('contact')} to say hi.`,
		].join('\n'),
		'skills.txt': () => {
			const skills = window.PORTFOLIO.profile.skills || {}
			const width = Math.max(0, ...Object.keys(skills).map(g => g.length)) + 2
			return Object.entries(skills).map(([group, items]) => accent(group.toLowerCase()) + ' '.repeat(width - group.length) + esc(items.join(', '))).join('\n')
		},
		'contact.txt': () => {
			const c = window.PORTFOLIO.profile.contact || {}
			const short = url => url.replace(/^https?:\/\/(www\.)?/, '')
			return [
				c.email ? `${accent('email')}     ${link('mailto:' + c.email, c.email)}` : '',
				c.linkedin ? `${accent('linkedin')}  ${link(c.linkedin, short(c.linkedin))}` : '',
				c.github ? `${accent('github')}    ${link(c.github, short(c.github))}` : '',
				cmd('mail', '→ open the Contact app'),
			].filter(Boolean).join('\n')
		},
	}

	// ---------- helpers ----------

	function esc(s) {
		return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
	}

	function cmd(c, label) {
		return `<span class="t-cmd" role="button" tabindex="0" data-cmd="${esc(c)}">${esc(label || c)}</span>`
	}

	function link(href, text) {
		return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text || href)}</a>`
	}

	function accent(s) { return `<span class="t-accent">${esc(s)}</span>` }
	function muted(s) { return `<span class="t-muted">${esc(s)}</span>` }
	function dir(s) { return `<span class="t-dir">${esc(s)}/</span>` }

	function print(html, className) {
		const line = document.createElement('div')
		line.className = 't-line' + (className ? ' ' + className : '')
		line.innerHTML = html
		output.appendChild(line)
		output.scrollTop = output.scrollHeight
	}

	function error(text) { print(esc(text), 't-error') }

	// ---------- project data (projects-data.js) ----------

	const projects = window.PORTFOLIO.projects
	const dirs = window.PORTFOLIO.dirs
	const findProject = window.PORTFOLIO.find

	// ---------- shell state ----------

	let cwd = '~'
	const history = []
	let historyIndex = 0

	function promptText() {
		return `ishaan@portfolio:${cwd === '~' ? '~' : '~/' + cwd}$`
	}

	function updatePrompt() { promptEl.textContent = promptText() }

	function normalizePath(path) {
		if (!path || path === '~' || path === '/' || path === '~/') return '~'
		if (path === '..') return '~'
		if (path === '.') return cwd
		return path.replace(/^~\//, '').replace(/^\.\//, '').replace(/\/$/, '')
	}

	// ---------- commands ----------

	const commands = {
		help: {
			desc: 'list available commands',
			run() {
				const width = Math.max(...visibleCommands().map(n => n.length)) + 2
				print(visibleCommands().map(n => cmd(n) + ' '.repeat(width - n.length) + muted(commands[n].desc)).join('\n'))
				print(muted('tab completes, ↑/↓ browse history, ctrl+l clears. some commands are not listed…'))
			},
		},
		whoami: {
			desc: 'who is this guy?',
			run() {
				const p = window.PORTFOLIO.profile
				print(`${accent(p.name || 'Ishaan Meena')}: ${esc(p.headline || '')}`)
				print(`Try ${cmd('experience')}, ${cmd('projects')}, ${cmd('demo')} or ${cmd('resume')}.`)
			},
		},
		drive: {
			desc: 'game mode: drive a car, park on buttons to click',
			run() {
				if (!window.driveMode) return error('drive: not available')
				print(`${accent('🏎 game mode')}: arrows / WASD to drive, park on anything clickable for 1.5 s to click it, Esc to exit.`)
				setTimeout(() => window.driveMode.start(), 50)
			},
		},
		race: {
			desc: 'race the AI around a circuit (+ parking)',
			run() {
				if (!window.raceMode) return error('race: not available')
				print(`${accent('🏁 race mode')}: 2 laps against the AI, then try parking in the infield. Esc to exit.`)
				setTimeout(() => window.raceMode.start(), 50)
			},
		},
		play: {
			desc: 'play a game (hangman, pokemon)',
			run(args) {
				const games = window.GAMES ? Object.keys(window.GAMES) : []
				if (!args[0] || !games.includes(args[0])) {
					return print(`usage: ${games.map(g => cmd('play ' + g)).join(' | ')}`)
				}
				startGame(args[0])
			},
		},
		demo: {
			desc: 'run a live project demo',
			run(args) {
				if (!window.demos) return error('demo: not available')
				const ids = window.demos.ids()
				if (!args[0]) {
					return print(ids.map(id => {
						const d = window.demos.get(id)
						return `${cmd('demo ' + id, id)}${' '.repeat(Math.max(1, 15 - id.length))}${muted(d.title + ': ' + (d.tagline || ''))}`
					}).join('\n'))
				}
				const id = ids.find(i => i === args[0]) || ids.find(i => i.startsWith(args[0]))
				if (!id) return error(`demo: no demo called '${args[0]}'. Type 'demo' on its own for a list.`)
				window.demos.open(id)
				print(muted(`→ ${window.demos.get(id).title}`))
			},
		},
		experience: {
			desc: 'work and research experience',
			run() {
				const jobs = window.PORTFOLIO.profile.experience || []
				print(jobs.map(job => [
					`${accent(job.role)} ${muted('@')} ${esc(job.org)}  ${muted(job.dates)}`,
					...(job.bullets || []).map(b => `  ${muted('•')} ${esc(b)}`),
				].join('\n')).join('\n\n'))
			},
		},
		resume: {
			desc: 'open my résumé',
			run(args) {
				const pdf = window.PORTFOLIO.profile.resume
				if (args[0] === 'pdf' && pdf) {
					window.open(pdf, '_blank', 'noopener')
					return print(`opening ${link(pdf, 'Ishaan_Meena_Resume.pdf')}`)
				}
				if (window.wm) window.wm.open('resume')
				print(`${muted('→ Résumé')}${pdf ? `  ${link(pdf, 'download PDF')}` : ''}`)
			},
		},
		ls: {
			desc: 'list files and project folders',
			run(args) {
				const target = normalizePath(args[0] || cwd)
				if (target === '~') {
					print(dirs.map(dir).join('  ') + '  ' + Object.keys(FILES).map(f => cmd('cat ' + f, f)).join('  '))
				} else if (dirs.includes(target)) {
					print(projects.filter(p => p.dir === target).map(p => cmd('cat ' + p.slug, p.slug)).join('\n'))
				} else {
					error(`ls: cannot access '${args[0]}': No such file or directory`)
				}
			},
		},
		cd: {
			desc: 'change folder (try cd ml)',
			run(args) {
				const target = normalizePath(args[0])
				if (target === '~' || dirs.includes(target)) {
					cwd = target
					updatePrompt()
				} else {
					error(`cd: no such file or directory: ${args[0]}`)
				}
			},
		},
		cat: {
			desc: 'print a file or project',
			run(args) {
				if (!args[0]) return error('cat: missing file operand')
				const name = args[0].replace(/^~\//, '')
				if (FILES[name]) return print(FILES[name]())
				const p = findProject(name.split('/').pop())
				if (!p) return error(`cat: ${args[0]}: No such file or directory`)
				print([
					accent(p.title),
					esc(p.desc),
					`${muted('folder')}  ${dir(p.dir)}  ${muted(p.category)}`,
					p.stack ? `${muted('stack')}   ${esc(p.stack)}` : '',
					p.url ? `${muted('repo')}    ${link(p.url, p.url.replace(/^https?:\/\//, ''))}` : '',
					`${cmd('open ' + p.slug, '→ quick look')}  ${p.url ? cmd('repo ' + p.slug, '→ open repo') : ''}`,
				].filter(Boolean).join('\n'))
			},
		},
		projects: {
			desc: 'tree of every project',
			run() {
				const lines = [accent('~')]
				dirs.forEach((d, di) => {
					const lastDir = di === dirs.length - 1
					lines.push((lastDir ? '└── ' : '├── ') + dir(d))
					const items = projects.filter(p => p.dir === d)
					items.forEach((p, pi) => {
						lines.push((lastDir ? '    ' : '│   ') + (pi === items.length - 1 ? '└── ' : '├── ') + cmd('cat ' + p.slug, p.slug))
					})
				})
				lines.push(muted(`\n${dirs.length} directories, ${projects.length} projects`))
				print(lines.join('\n'))
			},
		},
		open: {
			desc: 'preview a project in Quick Look',
			run(args) {
				const p = findProject(args[0])
				if (!p) return error(args[0] ? `open: no project matching '${args[0]}'` : 'usage: open <project>')
				if (window.finder) window.finder.quickLook(p.slug)
				print(muted(`→ ${p.title}`))
			},
		},
		finder: {
			desc: 'open the Projects app',
			run(args) {
				if (!window.finder) return error('finder: not available')
				window.finder.show(args[0])
				print(muted('→ Projects'))
			},
		},
		repo: {
			desc: 'open a project on GitHub',
			run(args) {
				const p = findProject(args[0])
				if (!p) return error(args[0] ? `repo: no project matching '${args[0]}'` : 'usage: repo <project>')
				window.open(p.url, '_blank', 'noopener')
				print(`opening ${link(p.url)}`)
			},
		},
		skills: { desc: 'languages and tools', run() { print(FILES['skills.txt']()) } },
		contact: { desc: 'how to reach me', run() { print(FILES['contact.txt']()) } },
		theme: {
			desc: 'switch colour theme',
			run(args) {
				if (!args[0]) {
					return print(`current: ${accent(document.documentElement.dataset.theme)}\nthemes:  ${THEMES.map(t => cmd('theme ' + t, t)).join('  ')}`)
				}
				if (!THEMES.includes(args[0])) return error(`theme: unknown theme '${args[0]}'`)
				setTheme(args[0])
				print(muted(`theme set to ${args[0]}`))
			},
		},
		goto: {
			desc: 'jump to a section of the page',
			run(args) {
				const id = SECTIONS[args[0]]
				if (!id) return print(`usage: goto ${Object.keys(SECTIONS).map(s => cmd('goto ' + s, s)).join(' | ')}`)
				document.getElementById(id).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' })
			},
		},
		neofetch: {
			desc: 'system info, but it is me',
			run() {
				const logo = [
					'██╗███╗   ███╗',
					'██║████╗ ████║',
					'██║██╔████╔██║',
					'██║██║╚██╔╝██║',
					'██║██║ ╚═╝ ██║',
					'╚═╝╚═╝     ╚═╝',
				].join('\n')
				const profile = window.PORTFOLIO.profile
				const job = (profile.experience || [])[0]
				const edu = (profile.education || [])[0]
				const info = [
					`${accent('ishaan')}@${accent('portfolio')}`,
					muted('----------------'),
					job ? `${accent('role')}      ${esc(job.role.split(',')[0])} @ ${esc(job.org)}` : '',
					edu ? `${accent('school')}    ${esc(edu.school)}, class of ${esc(edu.dates.split('–').pop().trim())}` : '',
					edu ? `${accent('program')}   ${esc(edu.degree.replace('Bachelor of Science in', 'BSc'))}` : '',
					`${accent('focus')}     CV, ML research, full-stack`,
					`${accent('projects')}  ${projects.length}`,
					`${accent('theme')}     ${esc(document.documentElement.dataset.theme)}`,
					`${accent('shell')}     portfolio-sh 1.0`,
				].filter(Boolean).join('\n')
				print(`<div class="t-neofetch"><div class="t-logo">${logo}</div><div>${info}</div></div>`)
			},
		},
		history: { desc: 'previous commands', run() { print(history.map((h, i) => muted(String(i + 1).padStart(3)) + '  ' + esc(h)).join('\n')) } },
		echo: { desc: 'print text', run(args) { print(esc(args.join(' '))) } },
		date: { desc: 'current date and time', run() { print(esc(new Date().toString())) } },
		clear: { desc: 'clear the screen', run() { output.innerHTML = '' } },

		// Hidden ones, for the curious
		sudo: { hidden: true, run() { error('ishaan is not in the sudoers file. This incident will be reported.') } },
		rm: { hidden: true, run() { error('rm: permission denied. nice try though.') } },
		exit: {
			hidden: true,
			run() {
				if (!window.wm) return print(`there is no escape. (try ${cmd('help')})`)
				print(muted('logout'))
				setTimeout(() => window.wm.close('terminal'), 300)
			},
		},
		vim: { hidden: true, run() { print(muted('you are now trapped in vim forever. just kidding, type :q') ) } },
		':q': { hidden: true, run() { print(muted('see? easy.')) } },
		hire: { hidden: true, run() { print(`${accent('excellent decision.')}\n` + FILES['contact.txt']()) } },
		mail: { hidden: true, run() { if (window.wm) window.wm.open('contact'); print(muted('→ Contact')) } },
		hello: { hidden: true, run() { print('hey! 👋 thanks for stopping by.') } },
		pwd: { hidden: true, run() { print(esc(cwd === '~' ? '/home/ishaan' : '/home/ishaan/' + cwd)) } },
	}
	commands.hi = commands.hello
	commands.about = { hidden: true, run() { print(FILES['about.txt']()) } }
	commands.tree = { hidden: true, run() { commands.projects.run() } }

	function visibleCommands() {
		return Object.keys(commands).filter(n => !commands[n].hidden)
	}

	function execute(line, { echoLine = true } = {}) {
		const trimmed = line.trim()
		if (echoLine) print(`<span class="t-prompt">${esc(promptText())}</span> ${esc(trimmed)}`)
		if (!trimmed) return
		history.push(trimmed)
		historyIndex = history.length

		const [name, ...rest] = trimmed.split(/\s+/)
		const args = rest.filter(a => !/^-/.test(a)) // flags like -la are accepted and ignored
		const command = commands[name.toLowerCase()]
		if (command) command.run(args)
		else error(`command not found: ${name}. type 'help' for a list.`)
	}

	// ---------- tab completion ----------

	function candidatesFor(name, partial) {
		switch (name) {
			case 'cd': return dirs.concat('~', '..')
			case 'ls': return cwd === '~' ? dirs : dirs.concat('~', '..')
			case 'cat': return Object.keys(FILES).concat(projects.filter(p => cwd === '~' || p.dir === cwd).map(p => p.slug))
			case 'open': case 'repo': return projects.map(p => p.slug)
			case 'finder': return dirs
			case 'demo': return window.demos ? window.demos.ids() : []
			case 'play': return window.GAMES ? Object.keys(window.GAMES) : []
			case 'theme': return THEMES
			case 'goto': return Object.keys(SECTIONS)
			case 'help': return []
			default: return partial === undefined ? visibleCommands() : []
		}
	}

	function complete() {
		const value = input.value
		const parts = value.split(/\s+/)
		const completingCommand = parts.length === 1
		const partial = parts[parts.length - 1]
		const pool = completingCommand ? visibleCommands() : candidatesFor(parts[0], partial)
		const matches = pool.filter(c => c.startsWith(partial))
		if (matches.length === 0) return

		let completion = matches[0]
		if (matches.length > 1) {
			completion = matches.reduce((prefix, m) => {
				let i = 0
				while (i < prefix.length && prefix[i] === m[i]) i++
				return prefix.slice(0, i)
			})
			if (completion === partial) {
				print(`<span class="t-prompt">${esc(promptText())}</span> ${esc(value)}`)
				print(matches.map(esc).join('  '))
				return
			}
		}
		parts[parts.length - 1] = completion + (matches.length === 1 ? ' ' : '')
		input.value = parts.join(' ')
	}

	// ---------- input wiring ----------

	let introTimer = null
	function cancelIntro() {
		clearTimeout(introTimer)
		introTimer = null
	}

	// ---------- game mode ("play hangman"): input goes to the game until it ends ----------

	let game = null

	function startGame(name) {
		const timers = new Set()
		game = { handler: null, label: '', timers }
		const classes = { muted: 't-muted', accent: 't-accent', error: 't-error', success: 't-success' }
		const io = {
			print: (text, kind) => print(esc(text), classes[kind] || ''),
			ask: (label, fn) => {
				if (!game) return
				game.label = label
				game.handler = fn
				promptEl.textContent = label
			},
			later: (ms, fn) => {
				const t = setTimeout(() => { timers.delete(t); if (game) fn() }, ms)
				timers.add(t)
			},
			end: () => endGame(),
		}
		window.GAMES[name].start(io)
	}

	function endGame() {
		if (!game) return
		game.timers.forEach(clearTimeout)
		game = null
		updatePrompt()
		print(muted('game over · back to the shell'))
	}

	form.addEventListener('submit', e => {
		e.preventDefault()
		cancelIntro()
		if (game) {
			const value = input.value
			input.value = ''
			print(`<span class="t-prompt">${esc(game.label)}</span> ${esc(value)}`)
			if (value.trim().toLowerCase() === 'quit') return endGame()
			const fn = game.handler
			if (!fn) return
			game.handler = null
			fn(value)
			return
		}
		execute(input.value)
		input.value = ''
	})

	input.addEventListener('keydown', e => {
		if (e.key === 'Tab') {
			e.preventDefault()
			complete()
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			if (historyIndex > 0) input.value = history[--historyIndex]
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			historyIndex = Math.min(history.length, historyIndex + 1)
			input.value = history[historyIndex] || ''
		} else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
			e.preventDefault()
			output.innerHTML = ''
		} else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection().toString()) {
			print(`<span class="t-prompt">${esc(game ? game.label : promptText())}</span> ${esc(input.value)}^C`)
			input.value = ''
			if (game) endGame()
		} else {
			cancelIntro()
		}
	})

	output.addEventListener('click', e => {
		const chip = e.target.closest('.t-cmd')
		if (chip) {
			cancelIntro()
			execute(chip.dataset.cmd)
		}
	})

	output.addEventListener('keydown', e => {
		const chip = e.target.closest('.t-cmd')
		if (chip && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault()
			execute(chip.dataset.cmd)
		}
	})

	// Clicking empty space in the terminal focuses the prompt (but don't steal text selections)
	terminal.addEventListener('click', e => {
		if (e.target.closest('a, .t-cmd') || window.getSelection().toString()) return
		input.focus({ preventScroll: true })
	})

	// ---------- boot ----------

	updatePrompt()
	print(muted('portfolio-sh 1.0: an interactive way to look around.'))
	print(`type a command or click one: ${cmd('help')}  ${cmd('ls')}  ${cmd('projects')}  ${cmd('neofetch')}`)

	// Type out a first command so it's obvious this is a working shell
	function typeIntro(text, i = 0) {
		if (i <= text.length) {
			input.value = text.slice(0, i)
			introTimer = setTimeout(() => typeIntro(text, i + 1), 90)
		} else {
			introTimer = null
			execute(text)
			input.value = ''
		}
	}

	// Start once the desktop has finished booting (desktop.js)
	function startIntro() {
		// whoami prints profile data, so wait for projects.json too
		window.PORTFOLIO.ready.then(() => {
			if (reduceMotion) execute('whoami')
			else introTimer = setTimeout(() => typeIntro('whoami'), 500)
		})
	}

	if (window.__desktopReady) startIntro()
	else document.addEventListener('desktop:ready', startIntro, { once: true })

	// Let other apps run commands here (e.g. the logo menu's "About")
	window.terminalShell = { run: line => { cancelIntro(); execute(line) } }

	// Focus the prompt whenever the Terminal window is opened, restored or zoomed
	const terminalWindow = terminal.closest('.app-window')
	if (terminalWindow) terminalWindow.addEventListener('wm:shown', () => input.focus({ preventScroll: true }))
})()
