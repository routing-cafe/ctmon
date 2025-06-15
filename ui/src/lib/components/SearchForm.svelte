<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SearchQuery } from '$lib/types/certificate.js';

	interface Props {
		onSearch?: (query: SearchQuery) => void;
		loading?: boolean;
	}

	let { onSearch, loading = false }: Props = $props();

	let query = $state('');
	let queryType = $state<SearchQuery['queryType']>('domain');
	let isNavigating = $state(false);

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (query.trim()) {
			// If onSearch is provided, use the old behavior (for backwards compatibility)
			if (onSearch) {
				onSearch({ query: query.trim(), queryType });
			} else {
				// Navigate to search results page
				isNavigating = true;
				const searchParams = new URLSearchParams({
					type: queryType,
					limit: '1000'
				});
				const encodedQuery = encodeURIComponent(query.trim());
				goto(`/search/${encodedQuery}?${searchParams}`);
			}
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
						placeholder="example.com"
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
					<option value="domain">Domain/SAN</option>
					<option value="sha256">SHA-256</option>
				</select>
			</div>
		</div>
	</form>
</div>