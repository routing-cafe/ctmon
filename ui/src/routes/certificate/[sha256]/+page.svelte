<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;

  $: certificate = data.certificate;
</script>

<div class="min-h-screen" style="background: var(--background); color: var(--foreground);">
  <div class="container max-w-7xl px-6 py-8">
    <div class="max-w-6xl">
      <div class="space-y-8">
        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div class="space-y-8">
            <div>
              <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                Subject Information
              </h2>
              <div class="space-y-4">
                <div>
                  <div
                    class="mb-2 block text-sm font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Common Name
                  </div>
                  <div
                    class="rounded-lg p-2 font-mono text-sm break-all"
                    style="background: var(--muted);"
                  >
                    {certificate.subject_common_name}
                  </div>
                </div>

                {#if certificate.subject_organization.length > 0}
                  <div>
                    <div
                      class="mb-2 block text-sm font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Organization
                    </div>
                    <div class="rounded-lg p-2 font-mono text-sm" style="background: var(--muted);">
                      {certificate.subject_organization.join(", ")}
                    </div>
                  </div>
                {/if}
              </div>
            </div>

            <div>
              <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                Issuer Information
              </h2>
              <div class="space-y-4">
                <div>
                  <div
                    class="mb-2 block text-sm font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Common Name
                  </div>
                  <div
                    class="rounded-lg p-2 font-mono text-sm break-all"
                    style="background: var(--muted);"
                  >
                    {certificate.issuer_common_name}
                  </div>
                </div>

                {#if certificate.issuer_organization.length > 0}
                  <div>
                    <div
                      class="mb-2 block text-sm font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Organization
                    </div>
                    <div class="rounded-lg p-2 font-mono text-sm" style="background: var(--muted);">
                      {certificate.issuer_organization.join(", ")}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <div class="space-y-8">
            <div>
              <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                Certificate Details
              </h2>
              <div class="space-y-4">
                <div>
                  <div
                    class="mb-2 block text-sm font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Serial Number
                  </div>
                  <div
                    class="rounded-lg p-2 font-mono text-sm break-all"
                    style="background: var(--muted);"
                  >
                    {certificate.serial_number}
                  </div>
                </div>

                <div>
                  <div
                    class="mb-2 block text-sm font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    SHA-256 Fingerprint
                  </div>
                  <div
                    class="rounded-lg p-2 font-mono text-sm break-all"
                    style="background: var(--muted);"
                  >
                    {certificate.certificate_sha256}
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <div
                      class="mb-2 block text-sm font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Valid From (UTC)
                    </div>
                    <div class="rounded-lg p-2 font-mono text-sm" style="background: var(--muted);">
                      {certificate.not_before}
                    </div>
                  </div>
                  <div>
                    <div
                      class="mb-2 block text-sm font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Valid Until (UTC)
                    </div>
                    <div class="rounded-lg p-2 font-mono text-sm" style="background: var(--muted);">
                      {certificate.not_after}
                    </div>
                  </div>
                </div>

                <div>
                  <div
                    class="mb-2 block text-sm font-medium"
                    style="color: var(--muted-foreground);"
                  >
                    Entry Type
                  </div>
                  <span class="inline-flex items-center rounded-lg font-mono text-sm">
                    {certificate.entry_type === "x509_entry" ? "Certificate" : "Precertificate"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="space-y-3">
            <h3 class="text-lg font-semibold" style="color: var(--foreground);">CT Log Entries</h3>
            <div class="overflow-x-auto">
              <table class="font-mono text-xs leading-tight">
                <thead>
                  <tr class="border-b" style="border-color: var(--border);">
                    <th
                      class="py-1 pr-4 text-left font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Log ID
                    </th>
                    <th
                      class="py-1 pr-4 text-left font-medium"
                      style="color: var(--muted-foreground);"
                    >
                      Index
                    </th>
                    <th class="py-1 text-right font-medium" style="color: var(--muted-foreground);">
                      Timestamp (UTC)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {#each certificate.ct_logs ?? [] as log, index}
                    <tr class="hover:bg-opacity-50" style="color: var(--foreground);">
                      <td class="py-0.5 pr-4">
                        {log.log_id}
                      </td>
                      <td class="py-0.5 pr-4">
                        {log.log_index}
                      </td>
                      <td class="py-0.5 text-right">
                        {log.entry_timestamp}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {#if certificate.subject_alternative_names.length > 0}
          <div>
            <div class="space-y-3">
              <h3 class="text-lg font-semibold" style="color: var(--foreground);">
                Subject Alternative Names ({certificate.subject_alternative_names.length})
              </h3>
              <div class="overflow-x-auto">
                <table class="font-mono text-xs leading-tight">
                  <tbody>
                    {#each certificate.subject_alternative_names as san, index}
                      <tr class="hover:bg-opacity-50" style="color: var(--foreground);">
                        <td class="py-0.5">
                          {san}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
