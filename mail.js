// Mail app: visitors write a message that is delivered straight to Ishaan's inbox.
// The site is static (GitHub Pages), so delivery goes through FormSubmit (formsubmit.co),
// a free form-to-email relay. The address comes from projects.json (profile.contact.email).
(function () {
	const win = document.getElementById('mail-window')
	if (!win) return
	const form = win.querySelector('.mail-form')
	const status = win.querySelector('.mail-status')
	const send = win.querySelector('.mail-send')
	const RELAY = 'https://formsubmit.co/ajax/'

	function setStatus(text, kind) {
		status.textContent = text
		status.className = 'mail-status' + (kind ? ' ' + kind : '')
	}

	function address() {
		const p = window.PORTFOLIO && window.PORTFOLIO.profile
		return (p && p.contact && p.contact.email) || ''
	}

	form.addEventListener('submit', async e => {
		e.preventDefault()
		const data = Object.fromEntries(new FormData(form))
		if (data._honey) return // a bot filled the hidden field
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) return setStatus('Please enter a valid email address so I can reply.', 'error')
		if (!(data.message || '').trim()) return setStatus('Please write a message.', 'error')
		const to = address()
		if (!to) return setStatus('Mail is not configured.', 'error')

		send.disabled = true
		setStatus('Sending…')
		try {
			const res = await fetch(RELAY + encodeURIComponent(to), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					_subject: data.subject ? `Portfolio: ${data.subject}` : 'New message from your portfolio',
					_replyto: data.email,
					_template: 'table',
					_captcha: 'false',
					name: data.name || '(not given)',
					email: data.email,
					message: data.message,
				}),
			})
			const json = await res.json().catch(() => ({}))
			if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || 'HTTP ' + res.status)
			setStatus('Sent! Thanks, I’ll get back to you soon. ✓', 'ok')
			form.reset()
		} catch (err) {
			setStatus(`Couldn’t send (${err.message}). You can email ${to} directly.`, 'error')
		} finally {
			send.disabled = false
		}
	})

	// Focus the first field when the window opens
	win.addEventListener('wm:shown', () => form.querySelector('input[name="email"]').focus({ preventScroll: true }))

	window.mailApp = { open: () => window.wm.open('mail') }
})()
