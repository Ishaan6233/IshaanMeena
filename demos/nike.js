// Nike Air Jordan 1 analysis (Ishaan6233/Nike-DataAnalysis.github.io): the project's own charts and
// findings, with a link to the full published page. (The published page is a Wix export that
// doesn't render inside a frame, so it opens in a new tab instead.)
window.DEMOS = window.DEMOS || {}

window.DEMOS.nike = {
	title: 'Nike Air Jordan 1 Analysis',
	tagline: 'Price index across 49 countries',
	icon: '👟',
	blurb: 'What an Air Jordan 1 costs around the world once it is converted to CAD and adjusted for local sales tax, and whether median income explains the differences.',
	note: 'Data joined across shoe-price, sales-tax, exchange-rate and median-income tables using country as the key, then analysed with pandas and plotted with Matplotlib.',

	mount(root) {
		const url = 'https://ishaan6233.github.io/Nike-DataAnalysis.github.io/'
		root.innerHTML = `
			<div class="nike-findings">
				<div><strong>$121</strong><span>cheapest: United States (CAD, after tax)</span></div>
				<div><strong>$251</strong><span>most expensive: Argentina</span></div>
				<div><strong>≈ 0</strong><span>correlation between price and median income (weakly negative)</span></div>
			</div>
			<div class="demo-chips nike-tabs" role="tablist">
				<button type="button" class="demo-chip" role="tab" aria-selected="true" data-chart="0">Price in each country</button>
				<button type="button" class="demo-chip" role="tab" aria-selected="false" data-chart="1">Difference vs. Canada</button>
			</div>
			<figure class="nike-chart">
				<img src="demos/data/nike-Visualization.png" alt="Bar chart of Air Jordan 1 prices in CAD by country, from Argentina (highest, about $251) down to the United States (lowest, about $121)">
				<figcaption>Air Jordan 1 price by country, converted to CAD and including local sales tax.</figcaption>
			</figure>
			<p><a class="demo-btn primary" href="${url}" target="_blank" rel="noopener">Open the full published analysis ↗</a></p>`

		const CHARTS = [
			['demos/data/nike-Visualization.png', 'Bar chart of Air Jordan 1 prices in CAD by country, from Argentina (highest, about $251) down to the United States (lowest, about $121)', 'Air Jordan 1 price by country, converted to CAD and including local sales tax.'],
			['demos/data/nike-Visualization2.png', 'Bar chart of each country’s price difference from Canada, from Argentina (about $106 more) to the United States (about $24 less)', 'How much more (or less) each country pays than Canada, in CAD.'],
		]
		root.querySelector('.nike-tabs').addEventListener('click', e => {
			const tab = e.target.closest('[data-chart]')
			if (!tab) return
			const [src, alt, caption] = CHARTS[Number(tab.dataset.chart)]
			const img = root.querySelector('.nike-chart img')
			img.src = src
			img.alt = alt
			root.querySelector('.nike-chart figcaption').textContent = caption
			root.querySelectorAll('.nike-tabs [role="tab"]').forEach(t => t.setAttribute('aria-selected', t === tab))
		})
	},
}
