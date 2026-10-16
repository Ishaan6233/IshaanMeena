// Grammar checking with a context-free grammar, following Ishaan6233/Grammar-Checker:
// a sentence's POS-tag sequence is parsed with the project's toy CFG; if no parse exists, it is
// flagged as ungrammatical. Tags come from the HMM tagger demo; parsing is an Earley chart parser
// (it handles left-recursive rules like NP -> NP PP, as NLTK's ChartParser does).
window.DEMOS = window.DEMOS || {}

;(function () {
	const U = window.MLUtils

	// grammars/toy.cfg exactly as in the repo
	const ORIGINAL = `S    -> NP VP Punct | NP VP | S Conj S
NP   -> DT Noun | NP PP | PRP | Noun | NP Conj NP | NP AdjP | PRPS Noun | NP AdvP
AdjP -> JJ | JJR | JJS | AdjP AdjP
VP   -> Verb NP | Verb AdjP | VP PP | VP AdvP | VP Conj VP | Verb | Verb PP | VP AdvP
AdvP -> RB | RBR | RBS | AdvP AdvP | RB PP
PP   -> IN NP | IN AdvP
Conj -> CC
Verb -> VB | VBD | VBG | VBN | VBP | VBZ
Noun -> NN | NNP | NNPS | NNS | CD
DT   -> 'DT'
IN   -> 'IN'
PRP  -> 'PRP'
PRPS -> 'PRP$'
JJ   -> 'JJ'
JJR  -> 'JJR'
JJS  -> 'JJS'
RB   -> 'RB'
RBR  -> 'RBR'
RBS  -> 'RBS'
Punct -> '.' | PUNCT_COMMA | PUNCT_COLON | PUNCT_LRB | PUNCT_RRB | PUNCT_QUOTE
CC -> 'CC'
CD -> 'CD'
EX -> 'EX'
FW -> 'FW'
GW -> 'GW'
HYPH -> 'HYPH'
MD -> 'MD'
PDT -> 'PDT'
POS -> 'POS'
RP -> 'RP'
TO -> 'TO'
UH -> 'UH'
WDT -> 'WDT'
WP -> 'WP'
WRB -> 'WRB'`

	// The same grammar with its bug fixed: verb/noun tags and punctuation quoted as terminals.
	// In the original, VB, NN, PUNCT_COMMA… are nonterminals with no rules, so no verb or noun can match.
	const FIXED = ORIGINAL
		.replace("Verb -> VB | VBD | VBG | VBN | VBP | VBZ", "Verb -> 'VB' | 'VBD' | 'VBG' | 'VBN' | 'VBP' | 'VBZ'")
		.replace("Noun -> NN | NNP | NNPS | NNS | CD", "Noun -> 'NN' | 'NNP' | 'NNPS' | 'NNS' | CD")
		.replace("Punct -> '.' | PUNCT_COMMA | PUNCT_COLON | PUNCT_LRB | PUNCT_RRB | PUNCT_QUOTE", "Punct -> '.' | ',' | ':' | '-LRB-' | '-RRB-' | '``' | \"''\"")

	// My extension for the demo: covers constructions the toy grammar has no rules for
	// (modals, "to"-infinitives, particles, "there", possessives, auxiliaries, fronted phrases…)
	const EXTENDED = FIXED.replace(/^S    -> .*$/m, 'S    -> NP VP Punct | NP VP | S Conj S | S Punct S | Conj S | PP S | AdvP S | S Punct | UH S')
		.replace(/^NP   -> .*$/m, 'NP   -> DT Noun | NP PP | PRP | Noun | NP Conj NP | NP AdjP | PRPS Noun | NP AdvP | EX | WP | DT | PDT NP | DT AdjP Noun | AdjP Noun | PRPS AdjP Noun | Noun Noun | NP POS Noun | NP POS | WDT | DT Noun Noun | CD NP')
		.replace(/^AdjP -> .*$/m, 'AdjP -> JJ | JJR | JJS | AdjP AdjP | AdvP AdjP | AdjP PP')
		.replace(/^VP   -> .*$/m, 'VP   -> Verb NP | Verb AdjP | VP PP | VP AdvP | VP Conj VP | Verb | Verb PP | MD VP | TO VP | Verb VP | Verb RP | Verb RP NP | Verb NP NP | Verb NP PP | Verb S | AdvP VP | Verb TO VP | VP NP')
		.replace(/^AdvP -> .*$/m, 'AdvP -> RB | RBR | RBS | AdvP AdvP | RB PP | WRB')

	// NLTK CFG.fromstring format: "LHS -> a b | 'terminal'"; the first rule's LHS is the start symbol
	function compile(text) {
		const rules = []
		for (const line of text.split(/\r?\n/)) {
			if (!line.trim() || line.trim().startsWith('#')) continue
			const arrow = line.indexOf('->')
			if (arrow < 0) throw new Error(`no "->" in: ${line.trim()}`)
			const lhs = line.slice(0, arrow).trim()
			for (const alt of line.slice(arrow + 2).split('|')) {
				const rhs = (alt.match(/'[^']*'|"[^"]*"|\S+/g) || []).map(s =>
					/^['"]/.test(s) ? { t: true, v: s.slice(1, -1) } : { t: false, v: s })
				if (rhs.length) rules.push({ lhs, rhs })
			}
		}
		if (!rules.length) throw new Error('the grammar has no rules')
		const byLhs = new Map()
		rules.forEach((r, i) => {
			if (!byLhs.has(r.lhs)) byLhs.set(r.lhs, [])
			byLhs.get(r.lhs).push(i)
		})
		return { rules, byLhs, start: rules[0].lhs }
	}

	// Earley recognizer with back-pointers, so one parse tree can be read off the chart
	function parse(g, tokens) {
		const n = tokens.length
		const chart = Array.from({ length: n + 1 }, () => [])
		const seen = Array.from({ length: n + 1 }, () => new Set())
		const add = (i, item) => {
			const key = item.r + ',' + item.dot + ',' + item.start
			if (seen[i].has(key)) return
			seen[i].add(key)
			chart[i].push(item)
		}
		for (const r of g.byLhs.get(g.start) || []) add(0, { r, dot: 0, start: 0, kids: [] })

		for (let i = 0; i <= n; i++) {
			for (let k = 0; k < chart[i].length; k++) {
				const item = chart[i][k]
				const rule = g.rules[item.r]
				if (item.dot === rule.rhs.length) {
					// Completer: advance every item that was waiting for this nonterminal
					for (const waiting of chart[item.start]) {
						const sym = g.rules[waiting.r].rhs[waiting.dot]
						if (sym && !sym.t && sym.v === rule.lhs) add(i, { r: waiting.r, dot: waiting.dot + 1, start: waiting.start, kids: waiting.kids.concat([item]) })
					}
				} else {
					const sym = rule.rhs[item.dot]
					if (sym.t) {
						// Scanner
						if (i < n && tokens[i] === sym.v) add(i + 1, { r: item.r, dot: item.dot + 1, start: item.start, kids: item.kids.concat([i]) })
					} else {
						// Predictor
						for (const r of g.byLhs.get(sym.v) || []) add(i, { r, dot: 0, start: i, kids: [] })
					}
				}
			}
		}
		const done = chart[n].find(it => it.start === 0 && g.rules[it.r].lhs === g.start && it.dot === g.rules[it.r].rhs.length)
		if (!done) return null
		const toTree = item => ({ label: g.rules[item.r].lhs, children: item.kids.map(k => (typeof k === 'number' ? { leaf: k } : toTree(k))) })
		return toTree(done)
	}

	function evaluate(g, rows) {
		const actual = []
		const predicted = []
		for (const row of rows) {
			actual.push(row.label)
			predicted.push(parse(g, row.tags) ? 0 : 1) // 1 = "grammar error detected", as in the project
		}
		return U.metrics(actual, predicted)
	}

	// Exposed so the grammars can be evaluated outside the demo UI
	const engine = { compile, parse, evaluate, ORIGINAL, FIXED, EXTENDED }

	let dataPromise = null
	const loadData = () => (dataPromise = dataPromise || fetch('demos/data/grammar-train.tsv')
		.then(r => {
			if (!r.ok) throw new Error('HTTP ' + r.status)
			return r.text()
		})
		.then(text => text.split(/\r?\n/).slice(1).filter(Boolean).map(line => {
			const [id, label, sentence, pos] = line.split('\t')
			return { id, label: Number(label), sentence, tags: (pos || '').trim().split(/\s+/) }
		})))

	window.DEMOS.grammar = {
		engine,
		title: 'Grammar Checker',
		tagline: 'CFG + chart parsing',
		icon: '✅',
		blurb: 'Type a sentence: the HMM tagger labels each word, then a context-free grammar tries to parse the tag sequence. No parse means the sentence is flagged as ungrammatical.',
		note: 'Uses my project’s toy grammar and its 603 labelled learner sentences. The original grammar file had a bug: verb and noun tags were written as rule names instead of quoted terminals, so nothing with a verb or noun could parse. “Fixed” quotes them; “Extended” adds rules I wrote for modals, infinitives, particles and more. Even then, precision stays close to the 23% base rate: a grammar over part-of-speech tags can’t see most learner errors (wrong word forms, stray articles), which is the real lesson of this approach.',

		mount(root) {
			root.innerHTML = `
				<form class="pos-form gr-form">
					<label class="sr-only" for="gr-input">Sentence to check</label>
					<input id="gr-input" class="demo-input" type="text" autocomplete="off" value="I received your letter yesterday.">
					<button type="submit" class="demo-btn primary">Check</button>
				</form>
				<div class="demo-chips gr-examples" aria-label="Sentences from the dataset"></div>
				<div class="demo-controls gr-mode" role="radiogroup" aria-label="Grammar version">
					<label><input type="radio" name="gr-grammar" value="extended" checked> Extended grammar</label>
					<label><input type="radio" name="gr-grammar" value="fixed"> Fixed grammar</label>
					<label><input type="radio" name="gr-grammar" value="original"> Original (as in the repo)</label>
				</div>
				<p class="demo-status gr-status">Loading the tagger and dataset…</p>
				<div class="gr-output" aria-live="polite"></div>
				<h4 class="gr-heading">Scores on the project’s 603 labelled sentences</h4>
				<table class="heart-scores gr-scores"></table>
				<details class="pos-trellis-wrap gr-editor">
					<summary>Edit the grammar and re-score it</summary>
					<textarea class="demo-input gr-text" rows="12" spellcheck="false"></textarea>
					<p><button type="button" class="demo-btn primary gr-rescore">Re-score my grammar</button> <span class="demo-status gr-edit-status"></span></p>
				</details>`

			const input = root.querySelector('#gr-input')
			const status = root.querySelector('.gr-status')
			const output = root.querySelector('.gr-output')
			const editor = root.querySelector('.gr-text')
			editor.value = EXTENDED

			const grammars = { extended: compile(EXTENDED), fixed: compile(FIXED), original: compile(ORIGINAL), custom: null }
			let tagger = null
			const tagEngine = window.DEMOS['pos-tagger'] && window.DEMOS['pos-tagger'].engine
			let cancelled = false

			function current() {
				const mode = root.querySelector('input[name="gr-grammar"]:checked').value
				return grammars[mode] || grammars.extended
			}

			function renderTree(node, words, tags) {
				if (node.leaf !== undefined) {
					return `<li class="gr-leaf"><span class="pos-tag pos-other">${U.esc(tags[node.leaf])}</span> <em>${U.esc(words[node.leaf])}</em></li>`
				}
				return `<li><span class="gr-node">${U.esc(node.label)}</span><ul>${node.children.map(c => renderTree(c, words, tags)).join('')}</ul></li>`
			}

			function check() {
				if (!tagger) return
				const words = tagEngine.tokenize(input.value)
				if (!words.length) { output.innerHTML = ''; return }
				const tags = tagEngine.viterbi(tagger, words, true).path
				const tree = parse(current(), tags)
				output.innerHTML = `
					<ol class="pos-tokens">${words.map((w, i) => `<li class="pos-token"><span class="pos-word">${U.esc(w)}</span><span class="pos-tag pos-other">${U.esc(tags[i])}</span></li>`).join('')}</ol>
					<div class="sent-result ${tree ? 'is-positive' : 'is-negative'}">
						<div class="sent-verdict"><span class="sent-label">${tree ? '✓ Grammatical' : '✗ Possible grammar error'}</span>
						<span class="sent-prob">${tree ? 'the tag sequence parses with this grammar' : 'no parse exists for this tag sequence'}</span></div>
						${tree ? `<ul class="gr-tree">${renderTree(tree, words, tags)}</ul>` : ''}
					</div>`
			}

			function scores(rows) {
				const rowsFor = [['Original (repo)', grammars.original], ['Fixed', grammars.fixed], ['Extended', grammars.extended]]
				root.querySelector('.gr-scores').innerHTML = `
					<tr><th>Grammar</th><th>Flagged as errors</th><th>Precision</th><th>Recall</th><th>Accuracy</th></tr>
					${rowsFor.map(([name, g]) => [name, evaluate(g, rows)]).map(([name, m]) =>
						`<tr><td>${name}</td><td>${m.tp + m.fp} / ${m.total}</td><td>${U.pct(m.precision)}</td><td>${U.pct(m.recall)}</td><td>${U.pct(m.accuracy)}</td></tr>`).join('')}`
			}

			root.querySelector('.gr-form').addEventListener('submit', e => { e.preventDefault(); check() })
			root.querySelector('.gr-mode').addEventListener('change', check)
			root.querySelector('.gr-examples').addEventListener('click', e => {
				const chip = e.target.closest('.demo-chip')
				if (!chip) return
				input.value = chip.dataset.sentence
				check()
			})

			root.querySelector('.gr-rescore').addEventListener('click', async () => {
				const note = root.querySelector('.gr-edit-status')
				try {
					grammars.custom = compile(editor.value)
					const m = evaluate(grammars.custom, await loadData())
					note.textContent = `Your grammar: precision ${U.pct(m.precision)}, recall ${U.pct(m.recall)}, accuracy ${U.pct(m.accuracy)} (${grammars.custom.rules.length} rules). The checker above now uses it.`
					// Use the edited grammar in place of the extended one
					grammars.extended = grammars.custom
					root.querySelector('input[value="extended"]').checked = true
					check()
				} catch (err) {
					note.textContent = 'Grammar error: ' + err.message
				}
			})

			Promise.all([tagEngine ? tagEngine.load() : Promise.reject(new Error('the POS tagger is not loaded')), loadData()])
				.then(([model, rows]) => {
					if (cancelled) return
					tagger = model
					status.textContent = `Tagging with the HMM tagger, then parsing with ${current().rules.length} grammar rules.`
					const examples = [rows.find(r => r.label === 0 && r.tags.length <= 7), rows.find(r => r.label === 1 && r.tags.length <= 7), rows.filter(r => r.label === 0)[5], rows.filter(r => r.label === 1)[3]].filter(Boolean)
					root.querySelector('.gr-examples').innerHTML = examples.map(r =>
						`<button type="button" class="demo-chip" data-sentence="${U.esc(r.sentence)}" title="Dataset label: ${r.label ? 'contains an error' : 'correct'}">${r.label ? '✗' : '✓'} ${U.esc(r.sentence)}</button>`).join('')
					scores(rows)
					check()
				})
				.catch(err => { status.textContent = 'Could not load the grammar demo (' + err.message + ').' })

			return () => { cancelled = true }
		},
	}
})()
