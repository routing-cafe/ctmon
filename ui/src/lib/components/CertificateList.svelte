<script lang="ts">
  import type { Certificate } from "$lib/types/certificate.js";

  interface Props {
    certificates: Certificate[];
  }

  let { certificates }: Props = $props();
</script>

{#if certificates.length === 0}
  <div>
    <h3 class="mb-2 text-lg font-semibold" style="color: var(--foreground)">
      No certificates found
    </h3>
    <p style="color: var(--muted-foreground)">Try adjusting your search query or search type.</p>
  </div>
{:else}
  <div class="space-y-3">
    <h2 class="text-lg font-semibold" style="color: var(--foreground)">
      Found {certificates.length} certificates
    </h2>

    <div class="overflow-x-auto">
      <table class="font-mono text-xs leading-tight">
        <thead>
          <tr class="border-b" style="border-color: var(--border)">
            <th class="py-1 pr-4 text-left font-medium" style="color: var(--muted-foreground)">
              Common Name
            </th>
            <th class="py-1 pr-4 text-left font-medium" style="color: var(--muted-foreground)">
              Issuer
            </th>
            <th class="py-1 pr-4 text-left font-medium" style="color: var(--muted-foreground)">
              Timestamp (UTC)
            </th>
            <th class="py-1 pr-4 text-left font-medium" style="color: var(--muted-foreground)">
              Log Entries
            </th>
            <th class="py-1 text-right font-medium" style="color: var(--muted-foreground)">
              SHA-256
            </th>
          </tr>
        </thead>
        <tbody>
          {#each certificates as cert, index}
            <tr class="hover:bg-opacity-50" style="color: var(--foreground)">
              <td class="max-w-xs truncate py-0.5 pr-4">
                {cert.subject_common_name}
              </td>
              <td class="max-w-xs truncate py-0.5 pr-4">
                {`${cert.issuer_organization} ${cert.issuer_common_name}`}
              </td>
              <td class="py-0.5 pr-4">
                {cert.entry_timestamp}
              </td>
              <td class="py-0.5 pr-4">
                {cert.ct_log_count !== undefined ? `${cert.ct_log_count}` : "-"}
              </td>
              <td class="py-0.5 text-right">
                <a
                  href="/certificate/{cert.certificate_sha256}"
                  class="underline transition-colors duration-150 ease-out"
                  style="color: var(--primary)"
                  onmouseenter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                  onmouseleave={(e) => (e.currentTarget.style.color = "var(--primary)")}
                >
                  {cert.certificate_sha256.substring(0, 16)}...
                </a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
