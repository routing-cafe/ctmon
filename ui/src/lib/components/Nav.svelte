<script lang="ts">
	import { page } from '$app/stores';

	$: path = $page.url.pathname;
</script>

<div class="flex flex-row gap-2">
	<div>
		<a
			href="/"
			class="block px-3 py-2 rounded-md text-sm text-white hover:text-blue-900 hover:bg-gray-100 {path === '/'
				? 'text-shadow-[0.75px_0_0_currentColor]'
				: 'underline'}"
		>
			Certificate Transparency
		</a>
	</div>
	<div>
		<a
			href="/sigstore"
			class="block px-3 py-2 rounded-md text-sm text-white hover:text-blue-900 hover:bg-gray-100 {path === '/sigstore'
				? 'text-shadow-[0.75px_0_0_currentColor]'
				: 'underline'}"
		>
			Sigstore
		</a>
	</div>
</div>