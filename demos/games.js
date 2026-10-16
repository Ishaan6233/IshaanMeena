// Text games ported from my Python projects. Each game talks to a small I/O interface, so the
// same code runs in the Terminal app ("play hangman") and in the Live Demos window:
//   io.print(text, kind?)   kind: 'muted' | 'accent' | 'error' | 'success'
//   io.ask(label, handler)  wait for one line of input
//   io.later(ms, fn)        run fn after a delay (the host cancels these if the game is closed)
//   io.end()                the game has finished
window.GAMES = (function () {
	const pick = list => list[Math.floor(Math.random() * list.length)]

	// ---------- Hangman (Ishaan6233/Hangman-Game) ----------

	// The gallows drawings from hangman_template.py, one per wrong guess
	const GALLOWS = [
		'',
		'  _____\n  |\n  |\n  |\n  |\n /|\\',
		'  _____\n  |/\n  |\n  |\n  |\n /|\\',
		'  _____\n  |/    |\n  |\n  |\n  |\n /|\\',
		'  _____\n  |/    |\n  |     o\n  |\n  |\n /|\\',
		'  _____\n  |/    |\n  |     o\n  |    /|\\\n  |    / \\\n /|\\',
	]

	let wordsPromise = null
	const loadWords = () => (wordsPromise = wordsPromise || fetch('demos/data/hangman-words.txt')
		.then(r => r.text())
		.then(text => text.split(/\r?\n/).filter(Boolean).map(line => {
			const [word, hint] = line.split(',')
			return { word: word.trim(), hint: (hint || '').trim() }
		})))

	const hangman = {
		title: 'Hangman',
		async start(io) {
			const words = await loadWords()
			io.print('HANGMAN: guess the word one letter at a time. 5 wrong guesses and it’s over. (type quit to stop)', 'accent')

			function round() {
				const { word, hint } = pick(words)
				const dashes = Array(word.length).fill('_')
				const incorrect = []
				let step = 0
				io.print(`here is the hint: ${hint}`, 'muted')

				function turn(again) {
					io.print(dashes.join(' '))
					io.ask(again ? 'Enter guess again:' : 'Enter guess:', raw => {
						const guess = raw.trim().toLowerCase()
						if (guess.length !== 1 || !/[a-z]/.test(guess)) {
							io.print('Please enter a single letter.', 'error')
							return turn(true)
						}
						if (incorrect.includes(guess) || dashes.includes(guess)) {
							io.print(`You already tried "${guess}".`, 'muted')
							return turn(true)
						}
						let found = false
						word.split('').forEach((letter, i) => {
							if (letter === guess) { dashes[i] = guess; found = true }
						})
						if (found) {
							io.print('Correct!', 'success')
						} else {
							incorrect.push(guess)
							step++
							io.print('incorrect', 'error')
							io.print(GALLOWS[step])
						}
						if (!dashes.includes('_')) {
							io.print(dashes.join(' '))
							io.print('Well Done', 'success')
							return finish()
						}
						if (step === 5) {
							io.print('R.I.P', 'error')
							return finish()
						}
						turn(false)
					})
				}

				function finish() {
					io.print(`The word was ${word}`, 'muted')
					io.ask('Play again? y/n:', reply => {
						if (reply.trim().toLowerCase() === 'y') round()
						else io.end()
					})
				}

				turn(false)
			}

			round()
		},
	}

	// ---------- Pokémon battle (Ishaan6233/Pokemon-Battle-Simulator) ----------

	// The repo's all_pokemon.txt isn't committed, so this roster uses the games' base stats
	// (attack, defense, HP) in the same name|attack|defense|health shape.
	const ROSTER = [
		['Pikachu', 55, 40, 35], ['Charizard', 84, 78, 78], ['Blastoise', 83, 100, 79], ['Venusaur', 82, 83, 80],
		['Gengar', 65, 60, 60], ['Machamp', 130, 80, 90], ['Snorlax', 110, 65, 160], ['Gyarados', 125, 79, 95],
		['Dragonite', 134, 95, 91], ['Lucario', 110, 70, 70], ['Eevee', 55, 50, 55], ['Jigglypuff', 45, 20, 115],
		['Arcanine', 110, 80, 90], ['Mewtwo', 110, 90, 106], ['Garchomp', 130, 95, 108], ['Tyranitar', 134, 110, 100],
	]

	class Pokemon {
		constructor([name, attack, defense, health]) {
			Object.assign(this, { name, attack, defense, maxHealth: health, health })
		}
		toString() { return `${this.name} (health: ${this.health}/${this.maxHealth})` }
		isAlive() { return this.health !== 0 }
		// Same rule as attempt_attack: damage = attack × luck (0.7–1.2); it only lands if it beats defense
		attemptAttack(other, io) {
			const luck = pick([0.7, 0.8, 0.9, 1.0, 1.1, 1.2])
			const damage = Math.round(this.attack * luck)
			io.print(`${this.name} attacks ${other.name} for ${damage} damage!`)
			if (damage > other.defense) {
				other.health = Math.max(0, other.health - damage)
				return true
			}
			return false
		}
	}

	const pokemon = {
		title: 'Pokémon Battle',
		start(io) {
			io.print('POKÉMON BATTLE: two random Pokémon fight for up to 10 rounds. (type quit to stop)', 'accent')

			function battle() {
				const first = pick(ROSTER)
				let second = pick(ROSTER)
				while (second === first) second = pick(ROSTER)
				const p1 = new Pokemon(first)
				const p2 = new Pokemon(second)
				io.print(`Welcome, ${p1} and ${p2}!`, 'accent')

				let round = 1
				const lines = [] // battle log, printed with a little delay for drama

				function hit(attacker, defender) {
					if (attacker.attemptAttack(defender, { print: t => lines.push([t]) })) {
						lines.push([`Attack is successful! ${defender.name} has ${defender.health} remaining!`, 'success'])
						if (!defender.isAlive()) {
							if (Math.random() < 0.5) {
								defender.health = defender.maxHealth
								lines.push([`${defender.name} has been revived!`, 'accent'])
							} else {
								lines.push([`${attacker} has won in ${round} rounds!`, 'success'])
								return true
							}
						}
					} else {
						lines.push(['Attack is blocked', 'muted'])
					}
					return false
				}

				for (; round <= 10; round++) {
					lines.push([`Round ${round} begins! ${p1} and ${p2}`, 'muted'])
					if (hit(p1, p2) || hit(p2, p1)) break
					// The original kept looping forever after round 10; here the tie ends the battle
					if (round === 10) lines.push([`It's a tie between ${p1} and ${p2}`, 'accent'])
				}

				let k = 0
				const next = () => {
					if (k < lines.length) {
						io.print(...lines[k++])
						io.later(lines[k - 1][0].startsWith('Round') ? 450 : 220, next)
					} else {
						io.ask('Battle again? y/n:', reply => {
							if (reply.trim().toLowerCase() === 'y') battle()
							else io.end()
						})
					}
				}
				next()
			}

			battle()
		},
	}

	return { hangman, pokemon }
})()

// ---------- Live Demos entries: a small console that hosts a game ----------
window.DEMOS = window.DEMOS || {}

;(function () {
	function consoleDemo(id, meta) {
		window.DEMOS[id] = {
			...meta,
			mount(root) {
				root.innerHTML = `
					<div class="game-console" role="log" aria-live="polite"></div>
					<form class="game-form" autocomplete="off">
						<label class="game-prompt" for="game-input-${id}"></label>
						<input id="game-input-${id}" class="demo-input" type="text" spellcheck="false" autocapitalize="off">
						<button type="submit" class="demo-btn primary">Enter</button>
					</form>
					<p class="demo-status">Also playable in the Terminal app: type <code>play ${id}</code>.</p>`
				const out = root.querySelector('.game-console')
				const form = root.querySelector('.game-form')
				const input = form.querySelector('input')
				const label = form.querySelector('.game-prompt')
				const timers = new Set()
				let handler = null
				let finished = false

				const io = {
					print(text, kind) {
						const line = document.createElement('div')
						line.className = 'game-line' + (kind ? ' ' + kind : '')
						line.textContent = text
						out.appendChild(line)
						out.scrollTop = out.scrollHeight
					},
					ask(text, fn) {
						label.textContent = text
						handler = fn
						input.disabled = false
					},
					later(ms, fn) {
						const t = setTimeout(() => { timers.delete(t); fn() }, ms)
						timers.add(t)
					},
					end() {
						finished = true
						handler = null
						label.textContent = ''
						io.print('Game over. Press Enter to play again.', 'muted')
					},
				}

				function start() {
					finished = false
					out.innerHTML = ''
					window.GAMES[id].start(io)
				}

				form.addEventListener('submit', e => {
					e.preventDefault()
					const value = input.value
					input.value = ''
					if (finished) return start()
					if (!handler) return
					io.print(`${label.textContent} ${value}`, 'muted')
					if (value.trim().toLowerCase() === 'quit') return io.end()
					const fn = handler
					handler = null
					fn(value)
				})

				start()
				input.focus({ preventScroll: true })
				return () => timers.forEach(clearTimeout)
			},
		}
	}

	consoleDemo('hangman', {
		title: 'Hangman',
		tagline: 'Python CLI game, ported',
		icon: '🪢',
		blurb: 'My Python Hangman game: guess the word letter by letter from a hint before the gallows is complete.',
		note: 'Ported from <code>hangman.py</code>: same word list and hints, same ASCII gallows, five wrong guesses and you lose.',
	})

	consoleDemo('pokemon', {
		title: 'Pokémon Battle',
		tagline: 'OOP battle simulator, ported',
		icon: '⚔️',
		blurb: 'My object-oriented Pokémon battle simulator: two random Pokémon trade attacks with a luck multiplier, defence can block, and a fainted Pokémon may be revived.',
		note: 'Ported from <code>pokemon.py</code>. The repo’s <code>all_pokemon.txt</code> isn’t committed, so the roster uses the games’ base stats. The original also never ended after a 10-round tie; this version stops there.',
	})
})()
