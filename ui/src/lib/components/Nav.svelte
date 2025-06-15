<script lang="ts">
  import { page } from "$app/state";

  const path = $derived(page.url.pathname);
</script>

<div class="flex flex-row gap-2">
  <div>
    <a
      href="/"
      class="block rounded-md px-3 py-2 text-sm text-white hover:bg-gray-100 hover:text-blue-900 {path ===
      '/'
        ? 'text-shadow-[0.75px_0_0_currentColor]'
        : 'underline'}"
    >
      Certificate Transparency
    </a>
  </div>
  <div>
    <a
      href="/sigstore"
      class="block rounded-md px-3 py-2 text-sm text-white hover:bg-gray-100 hover:text-blue-900 {path ===
      '/sigstore'
        ? 'text-shadow-[0.75px_0_0_currentColor]'
        : 'underline'}"
    >
      Sigstore
    </a>
  </div>
</div>
