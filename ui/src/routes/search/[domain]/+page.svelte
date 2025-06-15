<script lang="ts">
  import type { PageData } from './$types';
  import CertificateList from '$lib/components/CertificateList.svelte';
  
  export let data: PageData;
  
  $: ({ domain, queryType, limit, certificates, error, statistics } = data);
  
  function getSearchTypeLabel(type: string) {
    switch (type) {
      case "domain":
        return "Domain/SAN";
      case "sha256":
        return "SHA-256";
      default:
        return "Domain/SAN";
    }
  }
</script>

<svelte:head>
  <title>Search Results - {decodeURIComponent(domain)}</title>
</svelte:head>

{#if error}
  <div
    class="min-h-screen"
    style="background: var(--background); color: var(--foreground);"
  >
    <div class="container px-6 py-8 max-w-7xl">
      <div>
        <h1
          class="text-2xl font-semibold mb-4"
          style="color: var(--foreground);"
        >
          Search Error
        </h1>
        <p
          class="text-lg mb-8"
          style="color: var(--muted-foreground);"
        >
          {error}
        </p>
      </div>
    </div>
  </div>
{:else}
  <div
    class="min-h-screen"
    style="background: var(--background); color: var(--foreground);"
  >
    <div class="container px-6 py-4 max-w-7xl">
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-4">
          <div>
            <p
              class="text-lg font-semibold"
              style="color: var(--foreground);"
            >
              Search Results
            </p>
            <div class="flex items-center gap-2 mt-1">
              <span
                class="text-sm"
                style="color: var(--muted-foreground);"
              >
                {getSearchTypeLabel(queryType)}:
              </span>
              <span
                class="text-sm font-medium font-mono"
                style="color: var(--foreground);"
              >
                {decodeURIComponent(domain)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {#if statistics}
        <div class="space-y-3 mb-6">
          <h3
            class="text-lg font-semibold"
            style="color: var(--foreground);"
          >
            Query Statistics
          </h3>
          <div class="overflow-x-auto">
            <table class="text-xs leading-tight font-mono">
              <thead>
                <tr
                  class="border-b"
                  style="border-color: var(--border);"
                >
                  <th
                    class="text-left py-1 pr-4 font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Rows Read
                  </th>
                  <th
                    class="text-left py-1 pr-4 font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Bytes Read
                  </th>
                  <th
                    class="text-right py-1 font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Elapsed Time
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  class="hover:bg-opacity-50"
                  style="color: var(--foreground);"
                >
                  <td class="py-0.5 pr-4">
                    {statistics.rows_read?.toLocaleString() || "N/A"}
                  </td>
                  <td class="py-0.5 pr-4">
                    {statistics.bytes_read
                      ? `${(statistics.bytes_read / 1024 / 1024).toFixed(2)} MB`
                      : "N/A"}
                  </td>
                  <td class="py-0.5 text-right">
                    {statistics.elapsed
                      ? `${(statistics.elapsed * 1000).toFixed(0)} ms`
                      : "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <CertificateList {certificates} />
    </div>
  </div>
{/if}