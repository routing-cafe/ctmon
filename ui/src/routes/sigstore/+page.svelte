<script lang="ts">
	import SigstoreSearchForm from '$lib/components/SigstoreSearchForm.svelte';
	import RekorStats from '$lib/components/RekorStats.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="min-h-full">
	<div class="container px-6 pt-6 pb-12 max-w-4xl">
		<div class="space-y-8">
			<div class="text-sm flex flex-col gap-2">
				<p>
					Sigstore is a public transparency log for software signing that
					provides cryptographic signatures and attestations for open source
					software packages. Rekor creates tamper-resistant records of
					metadata about software artifacts.
				</p>
				<p>
					Our system continuously ingests and indexes Sigstore Rekor log
					entries.
				</p>
			</div>

			<SigstoreSearchForm />
			<div>
				<p class="mb-4 font-bold">RSS Feed</p>
				<p>
					<code class="text-sm">
						https://transparency.cafe/api/sigstore/feed/[github_organization]
					</code>
					<br />
					<code class="text-sm">
						https://transparency.cafe/api/sigstore/feed/[github_organization]/[github_repository]
					</code>
				</p>
			</div>
			<RekorStats stats={data.rekorStats} />
		</div>
	</div>
</div>