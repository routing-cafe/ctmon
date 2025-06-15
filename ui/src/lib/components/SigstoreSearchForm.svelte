<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SigstoreSearchQuery } from '$lib/types/sigstore.js';

	interface Props {
		onSearch?: (query: SigstoreSearchQuery) => void;
		loading?: boolean;
	}

	let { onSearch, loading = false }: Props = $props();

	let query = $state('');
	let queryType = $state<SigstoreSearchQuery['queryType']>('github_repository');
	let isNavigating = $state(false);

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (query.trim()) {
			if (queryType === 'entry_uuid') {
				isNavigating = true;
				goto(`/sigstore/entry/${encodeURIComponent(query.trim())}`);
			} else if (onSearch) {
				onSearch({ query: query.trim(), queryType });
			} else {
				isNavigating = true;
				const searchParams = new URLSearchParams({
					type: queryType,
					limit: '1000'
				});
				const encodedQuery = encodeURIComponent(query.trim());
				goto(`/sigstore/search/${encodedQuery}?${searchParams}`);
			}
		}
	}

	function getPlaceholder() {
		switch (queryType) {
			case 'hash':
				return 'Enter data hash (SHA256)...';
			case 'x509_san':
				return 'Enter X.509 SAN (e.g., example.com)...';
			case 'pgp_fingerprint':
				return 'Enter PGP key fingerprint...';
			case 'pgp_email':
				return 'Enter PGP signer email...';
			case 'entry_uuid':
				return 'Enter entry UUID...';
			case 'github_repository':
				return 'Enter GitHub repository (e.g., owner/repo)...';
			case 'github_organization':
				return 'Enter GitHub organization (e.g., microsoft)...';
			default:
				return 'Enter search query...';
		}
	}

	function handleSelectFocus(e: Event) {
		(e.target as HTMLSelectElement).style.borderColor = 'var(--primary)';
	}

	function handleSelectBlur(e: Event) {
		(e.target as HTMLSelectElement).style.borderColor = 'var(--border)';
	}
</script>

<div>
	<p class="mb-4 font-bold">Search</p>
	<form onsubmit={handleSubmit} class="space-y-6">
		<div class="flex flex-col gap-3">
			<div class="flex flex-row gap-3">
				<div>
					<input
						type="text"
						bind:value={query}
						placeholder={getPlaceholder()}
						class="border-b-1 border-white focus:ring-offset-0 focus:ring-0 focus:outline-none font-mono"
						disabled={loading || isNavigating}
					/>
				</div>
				<div>
					<button
						type="submit"
						disabled={loading || isNavigating || !query.trim()}
						class="cursor-pointer"
					>
						{#if loading || isNavigating}
							<span class="opacity-50">
								Searching...
							</span>
						{:else}
							<span
								class="underline {query.trim() ? '' : 'opacity-50'}"
							>
								Go
							</span>
						{/if}
					</button>
				</div>
			</div>
			<div>
				<select
					bind:value={queryType}
					class="focus:ring-offset-0 focus:ring-0 focus:outline-none"
					onfocus={handleSelectFocus}
					onblur={handleSelectBlur}
				>
					<option value="hash">Data Hash</option>
					<option value="x509_san">X.509 SAN</option>
					<option value="pgp_fingerprint">PGP Fingerprint</option>
					<option value="pgp_email">PGP Email</option>
					<option value="entry_uuid">Entry UUID</option>
					<option value="github_repository">GitHub Repository</option>
					<option value="github_organization">GitHub Organization</option>
				</select>
			</div>
		</div>
	</form>
</div>