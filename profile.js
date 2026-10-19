// Recruiter-facing pieces, all filled from projects.json: the profile widget's skills,
// the Résumé and Contacts apps, and the "Simple view" (a plain, linear version of the whole page).
(function () {
	const data = window.PORTFOLIO
	const root = document.documentElement
	const simpleView = document.getElementById('simple-view')
	const toggle = document.getElementById('view-toggle')

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
	}

	function shortUrl(url) {
		return String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
	}

	// ---------- opening apps from links and buttons ([data-open]) ----------

	document.addEventListener('click', e => {
		const trigger = e.target.closest('[data-open]')
		if (!trigger || !window.wm) return
		e.preventDefault()
		if (root.dataset.view === 'simple') setView('mac')
		const app = trigger.dataset.open
		if (app === 'projects' && window.finder) window.finder.show()
		else if (app === 'demos' && window.demos) window.demos.open()
		else window.wm.open(app)
	})

	// ---------- view toggle (Mac desktop <-> simple page) ----------

	function setView(view, { focus = false } = {}) {
		const simple = view === 'simple'
		root.dataset.view = simple ? 'simple' : 'mac'
		simpleView.hidden = !simple
		toggle.setAttribute('aria-pressed', simple)
		try { localStorage.setItem('view', root.dataset.view) } catch (e) {}
		if (simple) {
			window.scrollTo(0, 0)
			if (focus) simpleView.focus({ preventScroll: true })
		}
	}

	toggle.addEventListener('click', () => setView('simple', { focus: true }))

	// The skip link jumps straight into the simple view
	document.querySelector('.skip-link')?.addEventListener('click', e => {
		e.preventDefault()
		setView('simple', { focus: true })
	})

	simpleView.addEventListener('click', e => {
		// Demos run inside the Mac, so switch views first
		const demoButton = e.target.closest('[data-demo]')
		if (demoButton && window.demos) {
			setView('mac')
			window.demos.open(demoButton.dataset.demo)
			return
		}
		if (!e.target.closest('[data-view-back]')) return
		setView('mac')
		toggle.focus({ preventScroll: true })
	})

	window.portfolioView = { set: setView }

	// ---------- copy-to-clipboard ----------

	async function copy(text, button) {
		try {
			await navigator.clipboard.writeText(text)
		} catch (e) {
			const area = document.createElement('textarea')
			area.value = text
			document.body.appendChild(area)
			area.select()
			document.execCommand('copy')
			area.remove()
		}
		const label = button.textContent
		button.textContent = 'Copied!'
		setTimeout(() => { button.textContent = label }, 1500)
	}

	document.addEventListener('click', e => {
		const button = e.target.closest('[data-copy]')
		if (button) copy(button.dataset.copy, button)
	})

	// ---------- shared bits ----------

	const ICONS = {
		mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 1.8V17h16V7.8l-8 5.4-8-5.4Zm.9-.8L12 11.8 19.1 7H4.9Z"/></svg>',
		linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.3 9h3.4v11.5H3.3V9Zm5.5 0h3.3v1.6c.5-.9 1.7-1.9 3.5-1.9 3.6 0 4.3 2.4 4.3 5.4v6.4h-3.4v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8H8.8V9Z"/></svg>',
		github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
		resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V8h4.5L13 3.5ZM7 11v1.6h10V11H7Zm0 3.2v1.6h10v-1.6H7Zm0 3.2V19h7v-1.6H7Z"/></svg>',
	}

	function externalAttrs(kind) {
		if (kind === 'mail') return ' data-open="mail"' // opens the Mail app (the href is a mailto: fallback)
		if (kind === 'resume') return ' download="Ishaan_Meena_Resume.pdf"'
		return ' target="_blank" rel="noopener"'
	}

	function contactLinks(profile) {
		const c = profile.contact || {}
		const links = []
		if (c.email) links.push({ icon: 'mail', label: 'Email', value: c.email, href: 'mailto:' + c.email })
		if (c.linkedin) links.push({ icon: 'linkedin', label: 'LinkedIn', value: shortUrl(c.linkedin), href: c.linkedin })
		if (c.github) links.push({ icon: 'github', label: 'GitHub', value: shortUrl(c.github), href: c.github })
		if (profile.resume) links.push({ icon: 'resume', label: 'Résumé', value: 'Download PDF', href: profile.resume })
		return links
	}

	function linkList(profile, className) {
		return `<ul class="${className}">${contactLinks(profile).map(l =>
			`<li><a href="${esc(l.href)}"${externalAttrs(l.icon)}>${ICONS[l.icon]}<span>${esc(l.icon === 'resume' ? 'Résumé (PDF)' : l.value)}</span></a></li>`).join('')}</ul>`
	}

	function tagList(tags) {
		return tags && tags.length ? `<ul class="tag-list">${tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''
	}

	function experienceHtml(profile, headingTag) {
		return (profile.experience || []).map(job => `
			<article class="job-entry">
				<div class="job-head">
					<${headingTag}>${esc(job.role)} <span class="job-org">· ${esc(job.org)}</span></${headingTag}>
					<span class="job-dates">${esc(job.dates)}</span>
				</div>
				<ul class="job-bullets">${(job.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
				${tagList(job.tags)}
			</article>`).join('')
	}

	function educationHtml(profile, headingTag) {
		return (profile.education || []).map(ed => `
			<article class="job-entry">
				<div class="job-head">
					<${headingTag}>${esc(ed.school)} <span class="job-org">· ${esc(ed.location)}</span></${headingTag}>
					<span class="job-dates">${esc(ed.dates)}</span>
				</div>
				<p class="edu-degree">${esc(ed.degree)}${ed.gpa ? ` · GPA ${esc(ed.gpa)}` : ''}</p>
			</article>`).join('')
	}

	function skillsHtml(profile) {
		return `<dl class="skill-table">${Object.entries(profile.skills || {}).map(([group, items]) =>
			`<div><dt>${esc(group)}</dt><dd>${items.map(esc).join(', ')}</dd></div>`).join('')}</dl>`
	}

	// ---------- profile widget ----------

	function renderWidget(profile) {
		const list = document.querySelector('.widget-skills')
		if (list) list.innerHTML = (profile.highlights || []).map(s => `<li>${esc(s)}</li>`).join('')

		const job = (profile.experience || [])[0]
		const edu = (profile.education || [])[0]
		const set = (selector, text) => { const el = document.querySelector(selector); if (el) el.textContent = text }
		if (job) set('.widget-role-text', `${job.role.split(',')[0]} · ${job.org.replace(/ Technologies.*$/, '')}`)
		if (edu) set('.widget-sub', `CS · ${edu.school} · Class of ${edu.dates.split(/[–-]/).pop().trim().replace(/^\w+ /, '')}`)
		set('.stat-projects', data.projects.length)
		set('.stat-demos', data.projects.filter(p => p.demo).length)
		set('.stat-roles', (profile.experience || []).length)
	}

	// ---------- Contacts app ----------

	function renderContact(profile) {
		const card = document.querySelector('#contact-window .contact-card')
		if (!card) return
		const links = contactLinks(profile)
		card.innerHTML = `
			<img class="contact-photo" src="${esc(profile.photo)}" alt="Portrait of ${esc(profile.name)}">
			<h2 class="contact-name">${esc(profile.name)}</h2>
			<p class="contact-role">${esc(profile.headline)}</p>
			<div class="contact-actions">
				${links.map(l => `
					<a class="contact-action" href="${esc(l.href)}"${externalAttrs(l.icon)}>
						<span class="contact-action-icon">${ICONS[l.icon]}</span>
						<span>${esc(l.label)}</span>
					</a>`).join('')}
			</div>
			<dl class="contact-fields">
				${links.filter(l => l.icon !== 'resume').map(l => `
					<div>
						<dt>${esc(l.label)}</dt>
						<dd>
							<a href="${esc(l.href)}"${externalAttrs(l.icon)}>${esc(l.value)}</a>
							${l.icon === 'mail' ? `<button type="button" class="contact-copy" data-copy="${esc(profile.contact.email)}">Copy</button>` : ''}
						</dd>
					</div>`).join('')}
				${profile.location ? `<div><dt>Location</dt><dd>${esc(profile.location)}</dd></div>` : ''}
			</dl>
			${profile.availability ? `<p class="contact-note">${esc(profile.availability)}</p>` : ''}`
	}

	// ---------- Résumé app ----------

	function renderResume(profile) {
		const page = document.querySelector('#resume-window .resume-page')
		if (!page) return
		const featured = data.projects.filter(p => p.dir === 'featured')
		page.innerHTML = `
			<header class="resume-header">
				<h2>${esc(profile.name)}</h2>
				<p>${esc(profile.headline)}</p>
				${linkList(profile, 'resume-links')}
			</header>

			<section aria-labelledby="resume-experience">
				<h3 id="resume-experience">Experience</h3>
				${experienceHtml(profile, 'h4')}
			</section>

			${featured.length ? `
			<section aria-labelledby="resume-projects">
				<h3 id="resume-projects">Projects</h3>
				${featured.map(p => `
					<article class="job-entry">
						<div class="job-head"><h4>${esc(p.title)}</h4></div>
						<ul class="job-bullets">${[p.desc].concat(p.details).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
						${tagList(p.stack.split(',').map(t => t.trim()).filter(Boolean))}
					</article>`).join('')}
				<p class="resume-more"><button type="button" class="resume-link-button" data-open="projects">See all ${data.projects.length} projects →</button></p>
			</section>` : ''}

			<section aria-labelledby="resume-education">
				<h3 id="resume-education">Education</h3>
				${educationHtml(profile, 'h4')}
			</section>

			<section aria-labelledby="resume-skills">
				<h3 id="resume-skills">Technical Skills</h3>
				${skillsHtml(profile)}
			</section>`
	}

	// ---------- Simple view ----------

	function renderSimple(profile) {
		const inner = simpleView.querySelector('.simple-inner')

		inner.innerHTML = `
			<div class="simple-topbar">
				<span>${esc(profile.name)} · Portfolio</span>
				<button type="button" class="view-toggle" data-view-back>Mac view</button>
			</div>

			<header class="simple-header">
				<img src="${esc(profile.photo)}" alt="Portrait of ${esc(profile.name)}" width="128" height="128">
				<div>
					<h2 id="simple-name">${esc(profile.name)}</h2>
					<p class="simple-headline">${esc(profile.headline)}</p>
					<p class="simple-school">${esc([profile.school, profile.location].filter(Boolean).join(' · '))}</p>
					${linkList(profile, 'simple-links')}
				</div>
			</header>

			<section aria-labelledby="simple-about">
				<h3 id="simple-about">About</h3>
				<p>${esc(profile.summary)}</p>
			</section>

			<section aria-labelledby="simple-experience">
				<h3 id="simple-experience">Experience</h3>
				${experienceHtml(profile, 'h4')}
			</section>

			<section aria-labelledby="simple-education">
				<h3 id="simple-education">Education</h3>
				${educationHtml(profile, 'h4')}
			</section>

			<section aria-labelledby="simple-skills">
				<h3 id="simple-skills">Skills</h3>
				${skillsHtml(profile)}
			</section>

			<section aria-labelledby="simple-projects">
				<h3 id="simple-projects">Projects <span class="simple-count">(${data.projects.length})</span></h3>
				${data.folders.map(f => `
					<h4>${esc(f.name)}</h4>
					<ul class="simple-project-list">
						${data.projects.filter(p => p.dir === f.dir).map(p => `
							<li class="simple-project">
								<img src="${esc(p.image)}" alt="" loading="lazy">
								<div>
									<h5>${esc(p.title)}</h5>
									<p>${esc(p.desc)}</p>
									${p.details.length ? `<ul class="simple-details">${p.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
									<p class="simple-stack">${esc(p.stack)}</p>
									<p class="simple-project-links">
										${p.demo ? `<button type="button" class="simple-demo" data-demo="${esc(p.demo)}">▶ Try the live demo<span class="sr-only">: ${esc(p.title)}</span></button>` : ''}
										${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">View on GitHub<span class="sr-only">: ${esc(p.title)}</span></a>` : ''}
									</p>
								</div>
							</li>`).join('')}
					</ul>`).join('')}
			</section>

			<section aria-labelledby="simple-contact">
				<h3 id="simple-contact">Contact</h3>
				${linkList(profile, 'simple-links')}
			</section>

			<p class="simple-back"><button type="button" class="view-toggle" data-view-back>Back to the Mac view</button></p>`
	}

	// Apply the remembered view now; content fills in once the data loads
	setView(root.dataset.view === 'simple' ? 'simple' : 'mac')

	data.ready.then(ok => {
		if (!ok) {
			simpleView.querySelector('.simple-inner').innerHTML = '<p>Sorry, the portfolio data could not be loaded.</p>'
			return
		}
		renderWidget(data.profile)
		renderContact(data.profile)
		renderResume(data.profile)
		renderSimple(data.profile)
	})
})()
