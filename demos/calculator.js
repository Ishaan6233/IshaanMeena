// Calculator: a port of Ishaan6233/Enhanced-GUI-Calculator (Tkinter). Buttons build an expression
// string, "=" evaluates it and pushes "expression = result" onto a history stack, errors show "error".
// Results follow Python's rules like the original (6/3 → 2.0, 2*3 → 6), but with a small safe
// parser instead of eval().
window.DEMOS = window.DEMOS || {}

;(function () {
	// Recursive-descent parser for + - * / with decimals and unary minus.
	// Values carry an isFloat flag so results print like Python's str().
	function evaluate(expression) {
		const src = expression.replace(/\s+/g, '')
		let i = 0
		const peek = () => src[i]

		function number() {
			const m = /^\d*\.?\d+|^\d+\./.exec(src.slice(i))
			if (!m) throw new Error('syntax')
			i += m[0].length
			return { v: parseFloat(m[0]), isFloat: m[0].includes('.') }
		}
		function factor() {
			if (peek() === '-') { i++; const f = factor(); return { v: -f.v, isFloat: f.isFloat } }
			if (peek() === '+') { i++; return factor() }
			return number()
		}
		function term() {
			let left = factor()
			while (peek() === '*' || peek() === '/') {
				const op = src[i++]
				const right = factor()
				if (op === '/') {
					if (right.v === 0) throw new Error('division by zero')
					left = { v: left.v / right.v, isFloat: true } // Python 3: / is true division
				} else {
					left = { v: left.v * right.v, isFloat: left.isFloat || right.isFloat }
				}
			}
			return left
		}
		function expr() {
			let left = term()
			while (peek() === '+' || peek() === '-') {
				const op = src[i++]
				const right = term()
				left = { v: op === '+' ? left.v + right.v : left.v - right.v, isFloat: left.isFloat || right.isFloat }
			}
			return left
		}
		const result = expr()
		if (i !== src.length || !Number.isFinite(result.v)) throw new Error('syntax')
		return result.isFloat && Number.isInteger(result.v) ? result.v.toFixed(1) : String(result.v)
	}

	window.DEMOS.calculator = {
		title: 'Calculator',
		tagline: 'Port of my Tkinter calculator',
		icon: '🧮',
		blurb: 'A port of my Python/Tkinter calculator: buttons build an expression, = evaluates it and pushes it onto a history stack. Results follow Python’s rules, so 6 / 3 gives 2.0.',
		note: 'Same behaviour as <code>gui_calculator.py</code> (expression building, Clear, “error” on invalid input, history stack). The original used <code>eval()</code>; this version uses a small arithmetic parser instead, which is safer in a browser. You can type on your keyboard too.',

		mount(root) {
			const KEYS = [
				['C', 'clear', 'fn'], ['⌫', 'back', 'fn'], ['History', 'history', 'fn'], ['÷', '/', 'op'],
				['7', '7'], ['8', '8'], ['9', '9'], ['×', '*', 'op'],
				['4', '4'], ['5', '5'], ['6', '6'], ['−', '-', 'op'],
				['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
				['0', '0', 'wide'], ['.', '.'], ['=', '=', 'op eq'],
			]
			root.innerHTML = `
				<div class="calc-layout">
					<div class="calc" tabindex="0" aria-label="Calculator. Type numbers and operators, Enter to evaluate, Escape to clear.">
						<div class="calc-display" aria-live="polite"><span class="calc-expr"></span><span class="calc-value">0</span></div>
						<div class="calc-keys">${KEYS.map(([label, value, kind = '']) =>
							`<button type="button" class="calc-key ${kind}" data-key="${value}" aria-label="${{ '/': 'divide', '*': 'multiply', '-': 'minus', '+': 'plus', back: 'backspace' }[value] || label}">${label}</button>`).join('')}</div>
					</div>
					<div class="calc-history">
						<h4>History</h4>
						<ol class="calc-history-list"><li class="none">No calculations yet</li></ol>
					</div>
				</div>`

			const calc = root.querySelector('.calc')
			const exprEl = root.querySelector('.calc-expr')
			const valueEl = root.querySelector('.calc-value')
			const historyEl = root.querySelector('.calc-history-list')
			const history = [] // the stack: newest on top
			let expression = ''

			function show(value) {
				valueEl.textContent = value
			}

			function press(key) {
				if (key === 'clear') {
					expression = ''
					exprEl.textContent = ''
					show('0')
				} else if (key === 'back') {
					expression = expression.slice(0, -1)
					show(expression || '0')
				} else if (key === 'history') {
					root.querySelector('.calc-history').classList.toggle('flash')
					setTimeout(() => root.querySelector('.calc-history').classList.remove('flash'), 600)
				} else if (key === '=') {
					if (!expression) return
					try {
						const total = evaluate(expression)
						history.unshift(`${expression} = ${total}`)
						renderHistory()
						exprEl.textContent = expression.replace(/\*/g, '×').replace(/\//g, '÷') + ' ='
						expression = ''
						valueEl.textContent = total
					} catch (e) {
						exprEl.textContent = ''
						expression = ''
						valueEl.textContent = 'error'
					}
				} else {
					expression += key
					exprEl.textContent = ''
					show(expression.replace(/\*/g, '×').replace(/\//g, '÷'))
				}
			}

			function renderHistory() {
				historyEl.innerHTML = history.map(h => `<li><button type="button" data-result="${h.split(' = ').pop()}">${h.replace(/\*/g, '×').replace(/\//g, '÷')}</button></li>`).join('')
			}

			root.querySelector('.calc-keys').addEventListener('click', e => {
				const key = e.target.closest('[data-key]')
				if (key) press(key.dataset.key)
				calc.focus({ preventScroll: true })
			})
			// Clicking a history entry continues from its result
			historyEl.addEventListener('click', e => {
				const item = e.target.closest('[data-result]')
				if (!item) return
				expression = item.dataset.result
				show(expression)
			})
			calc.addEventListener('keydown', e => {
				const map = { Enter: '=', '=': '=', Escape: 'clear', Backspace: 'back', Delete: 'clear' }
				const key = map[e.key] || (/^[0-9.+\-*/]$/.test(e.key) ? e.key : null)
				if (!key) return
				e.preventDefault()
				press(key)
				const button = root.querySelector(`.calc-key[data-key="${CSS.escape(key)}"]`)
				if (button) {
					button.classList.add('pressed')
					setTimeout(() => button.classList.remove('pressed'), 120)
				}
			})
			calc.focus({ preventScroll: true })
		},
	}
})()
