<script lang="ts">
	import CtStats from '$lib/components/CtStats.svelte';
	import SearchForm from '$lib/components/SearchForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-full">
	<div class="container px-6 pt-6 pb-12 max-w-4xl">
		<div class="space-y-8">
			<div class="text-sm flex flex-col gap-2">
				<p>
					Certificate Transparency (CT) is a public logging system that
					records SSL/TLS certificates issued by Certificate Authorities.
					These logs help detect misissued certificates and improve web
					security by making certificate issuance transparent and auditable.
				</p>
				<p>
					Our system continuously ingests and indexes multiple CT logs.
				</p>
			</div>

			<SearchForm />
			<div>
				<p class="mb-4 font-bold">RSS Feed</p>
				<p>
					<code class="text-sm">
						https://transparency.cafe/api/ct/feed/[domain]
					</code>
				</p>
			</div>
			<CtStats stats={data.ctStats} />
		</div>
	</div>
</div>
