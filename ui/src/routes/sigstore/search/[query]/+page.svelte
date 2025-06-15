<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;

  const { query, queryType, entries, error, statistics } = data;

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toISOString().replace("T", " ").substring(0, 19);
    } catch {
      return dateStr;
    }
  }

  function getSearchTypeLabel(type: string): string {
    switch (type) {
      case "hash":
        return "Data Hash";
      case "x509_san":
        return "X.509 SAN";
      case "pgp_fingerprint":
        return "PGP Fingerprint";
      case "pgp_email":
        return "PGP Email";
      case "github_repository":
        return "GitHub Repository";
      case "github_organization":
        return "GitHub Organization";
      default:
        return "Unknown";
    }
  }

  function getSubjectOrSigner(entry: (typeof entries)[0]): string {
    if (queryType === "github_repository" || queryType === "github_organization") {
      return entry.repository_name || "-";
    }
    if (entry.x509_subject_cn) {
      return entry.x509_subject_cn;
    } else if (entry.pgp_signer_name) {
      return entry.pgp_signer_name;
    } else if (entry.pgp_signer_email) {
      return entry.pgp_signer_email;
    } else {
      return "-";
    }
  }

  function getEntryType(entry: (typeof entries)[0]): string {
    if (entry.x509_certificate_sha256) {
      return "X.509";
    } else if (entry.pgp_public_key_fingerprint) {
      return "PGP";
    } else {
      return entry.kind;
    }
  }
</script>

<svelte:head>
  <title>Sigstore Search Results - {query}</title>
</svelte:head>

{#if error}
  <div class="min-h-screen" style="background: var(--background); color: var(--foreground);">
    <div class="container max-w-7xl px-6 py-8">
      <div>
        <h1 class="mb-4 text-2xl font-semibold" style="color: var(--foreground);">Search Error</h1>
        <p class="mb-8 text-lg" style="color: var(--muted-foreground);">
          {error}
        </p>
      </div>
    </div>
  </div>
{:else}
  <div class="min-h-screen" style="background: var(--background); color: var(--foreground);">
    <div class="container max-w-7xl px-6 py-4">
      <div class="mb-8">
        <div class="mb-4 flex items-center gap-3">
          <div>
            <p class="text-lg font-semibold" style="color: var(--foreground);">
              Sigstore Search Results
            </p>
            <div class="mt-1 flex items-center gap-2">
              <span class="text-sm" style="color: var(--muted-foreground);">
                {getSearchTypeLabel(queryType)}:
              </span>
              <span class="font-mono text-sm font-medium" style="color: var(--foreground);">
                {query}
              </span>
            </div>
          </div>
        </div>
      </div>

      {#if statistics}
        <div class="mb-6 space-y-3">
          <h3 class="text-lg font-semibold" style="color: var(--foreground);">Query Statistics</h3>
          <div class="overflow-x-auto">
            <table class="font-mono text-xs leading-tight">
              <thead>
                <tr class="border-b" style="border-color: var(--border);">
                  <th
                    class="py-1 pr-4 text-left font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Rows Read
                  </th>
                  <th
                    class="py-1 pr-4 text-left font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Bytes Read
                  </th>
                  <th class="py-1 text-right font-medium" style="color: var(--muted-foreground);">
                    Elapsed Time
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr class="hover:bg-opacity-50" style="color: var(--foreground);">
                  <td class="py-0.5 pr-4">
                    {statistics.rows_read?.toLocaleString() || "N/A"}
                  </td>
                  <td class="py-0.5 pr-4">
                    {statistics.bytes_read
                      ? `${(statistics.bytes_read / 1024 / 1024).toFixed(2)} MB`
                      : "N/A"}
                  </td>
                  <td class="py-0.5 text-right">
                    {statistics.elapsed ? `${(statistics.elapsed * 1000).toFixed(0)} ms` : "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      {#if entries.length === 0}
        <div>
          <h3 class="mb-2 text-lg font-semibold" style="color: var(--foreground);">
            No entries found
          </h3>
          <p style="color: var(--muted-foreground);">
            Try adjusting your search query or search type.
          </p>
        </div>
      {:else}
        <div class="space-y-3">
          <h2 class="text-lg font-semibold" style="color: var(--foreground);">
            Found {entries.length} entries
          </h2>

          <div class="overflow-x-auto">
            <table class="font-mono text-xs leading-tight">
              <thead>
                <tr class="border-b" style="border-color: var(--border);">
                  {#if queryType !== "github_repository" && queryType !== "github_organization"}
                    <th
                      class="py-1 pr-4 text-left font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Type
                    </th>
                  {/if}
                  <th
                    class="py-1 pr-4 text-left font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    {queryType === "github_repository" || queryType === "github_organization"
                      ? "Repository"
                      : "Subject/Signer"}
                  </th>
                  <th
                    class="py-1 pr-4 text-left font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Integrated Time (UTC)
                  </th>
                  {#if queryType !== "github_repository" && queryType !== "github_organization"}
                    <th
                      class="py-1 pr-4 text-left font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Data Hash
                    </th>
                  {/if}
                  <th
                    class="w-32 py-1 text-right font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Entry UUID
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each entries as entry, index}
                  <tr class="hover:bg-opacity-50" style="color: var(--foreground);">
                    {#if queryType !== "github_repository" && queryType !== "github_organization"}
                      <td class="py-0.5 pr-4">
                        <span
                          class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                          style="background-color: var(--accent); color: var(--accent-foreground);"
                        >
                          {getEntryType(entry)}
                        </span>
                      </td>
                    {/if}
                    <td class="max-w-xs truncate py-0.5 pr-4">
                      {getSubjectOrSigner(entry)}
                    </td>
                    <td class="py-0.5 pr-4">
                      {formatDate(entry.integrated_time)}
                    </td>
                    {#if queryType !== "github_repository" && queryType !== "github_organization"}
                      <td class="max-w-xs truncate py-0.5 pr-4">
                        {entry.data_hash_value
                          ? `${entry.data_hash_algorithm}:${entry.data_hash_value.substring(0, 16)}...`
                          : "-"}
                      </td>
                    {/if}
                    <td class="w-32 py-0.5 text-right">
                      <a
                        href="/sigstore/entry/{entry.entry_uuid}"
                        class="underline transition-colors duration-150 ease-out hover:opacity-75"
                        style="color: var(--primary);"
                      >
                        {entry.entry_uuid.substring(0, 16)}...
                      </a>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
