<script lang="ts">
  import type { PageData } from "./$types";

  export let data: PageData;

  const { entry } = data;

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toISOString().replace("T", " ").substring(0, 19);
    } catch {
      return dateStr;
    }
  }

  const isPgpEntry = !!entry.pgp_public_key_fingerprint;
  const isX509Entry = !!entry.x509_certificate_sha256;
</script>

<svelte:head>
  <title>Sigstore Entry Details - {entry.entry_uuid}</title>
</svelte:head>

<div class="min-h-screen" style="background: var(--background); color: var(--foreground);">
  <div class="container max-w-7xl px-6 py-8">
    <div class="max-w-6xl">
      <div class="space-y-8">
        <!-- Header -->
        <div class="mb-8">
          <div class="mb-4 flex items-center gap-3">
            <h1 class="text-2xl font-semibold" style="color: var(--foreground);">
              Sigstore Entry Details
            </h1>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium"
              style="background-color: var(--accent); color: var(--accent-foreground);"
            >
              {entry.signature_format}
            </span>
          </div>
          <p class="font-mono text-sm">
            UUID: {entry.entry_uuid}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <!-- Entry Information -->
          <div class="space-y-8">
            <div>
              <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                Entry Information
              </h2>
              <div class="space-y-4">
                <div>
                  <div class="mb-2 block text-sm font-medium">Kind</div>
                  <div class="rounded-lg font-mono text-sm">
                    {entry.kind}
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <div class="mb-2 block text-sm font-medium">Tree ID</div>
                    <div class="rounded-lg font-mono text-sm">
                      {entry.tree_id}
                    </div>
                  </div>
                  <div>
                    <div class="mb-2 block text-sm font-medium">Log Index</div>
                    <div class="rounded-lg font-mono text-sm">
                      {entry.log_index}
                    </div>
                  </div>
                </div>

                <div>
                  <div class="mb-2 block text-sm font-medium">Integrated Time (UTC)</div>
                  <div class="rounded-lg font-mono text-sm">
                    {formatDate(entry.integrated_time)}
                  </div>
                </div>

                {#if entry.data_hash_value}
                  <div>
                    <div class="mb-2 block text-sm font-medium">Data Hash</div>
                    <div class="rounded-lg font-mono text-sm break-all">
                      {entry.data_hash_algorithm}:{entry.data_hash_value}
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Signature Details -->
          <div class="space-y-8">
            {#if isPgpEntry}
              <div>
                <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                  PGP Signature
                </h2>
                <div class="space-y-4">
                  {#if entry.pgp_signer_name}
                    <div>
                      <div class="mb-2 block text-sm font-medium">Signer Name</div>
                      <div class="rounded-lg font-mono text-sm">
                        {entry.pgp_signer_name}
                      </div>
                    </div>
                  {/if}

                  {#if entry.pgp_signer_email}
                    <div>
                      <div class="mb-2 block text-sm font-medium">Signer Email</div>
                      <div class="rounded-lg font-mono text-sm">
                        {entry.pgp_signer_email}
                      </div>
                    </div>
                  {/if}

                  <div>
                    <div class="mb-2 block text-sm font-medium">Key ID</div>
                    <div class="rounded-lg font-mono text-sm">
                      {entry.pgp_key_id}
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 block text-sm font-medium">Public Key Fingerprint</div>
                    <div class="rounded-lg font-mono text-xs break-all">
                      {entry.pgp_public_key_fingerprint}
                    </div>
                  </div>

                  {#if entry.pgp_key_algorithm}
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <div class="mb-2 block text-sm font-medium">Algorithm</div>
                        <div class="rounded-lg font-mono text-sm">
                          {entry.pgp_key_algorithm}
                        </div>
                      </div>
                      {#if entry.pgp_key_size}
                        <div>
                          <div class="mb-2 block text-sm font-medium">Key Size (bits)</div>
                          <div class="rounded-lg font-mono text-sm">
                            {entry.pgp_key_size}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if isX509Entry}
              <div>
                <h2 class="mb-4 text-xl font-semibold" style="color: var(--foreground);">
                  X.509 Certificate
                </h2>
                <div class="space-y-4">
                  {#if entry.x509_subject_cn}
                    <div>
                      <div class="mb-2 block text-sm font-medium">Subject Common Name</div>
                      <div class="rounded-lg font-mono text-sm">
                        {entry.x509_subject_cn}
                      </div>
                    </div>
                  {/if}

                  {#if entry.x509_issuer_cn}
                    <div>
                      <div class="mb-2 block text-sm font-medium">Issuer Common Name</div>
                      <div class="rounded-lg font-mono text-sm">
                        {entry.x509_issuer_cn}
                      </div>
                    </div>
                  {/if}

                  <div>
                    <div class="mb-2 block text-sm font-medium">Serial Number</div>
                    <div class="rounded-lg font-mono text-sm break-all">
                      {entry.x509_serial_number}
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 block text-sm font-medium">Certificate SHA-256</div>
                    <div class="rounded-lg font-mono text-sm break-all">
                      {entry.x509_certificate_sha256}
                    </div>
                  </div>

                  {#if entry.x509_not_before && entry.x509_not_after}
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <div class="mb-2 block text-sm font-medium">Valid From (UTC)</div>
                        <div class="rounded-lg font-mono text-sm">
                          {formatDate(entry.x509_not_before)}
                        </div>
                      </div>
                      <div>
                        <div class="mb-2 block text-sm font-medium">Valid Until (UTC)</div>
                        <div class="rounded-lg font-mono text-sm">
                          {formatDate(entry.x509_not_after)}
                        </div>
                      </div>
                    </div>
                  {/if}

                  {#if entry.x509_signature_algorithm}
                    <div>
                      <div class="mb-2 block text-sm font-medium">Signature Algorithm</div>
                      <div class="rounded-lg font-mono text-sm">
                        {entry.x509_signature_algorithm}
                      </div>
                    </div>
                  {/if}

                  {#if entry.x509_public_key_algorithm}
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <div class="mb-2 block text-sm font-medium">Public Key Algorithm</div>
                        <div class="rounded-lg font-mono text-sm">
                          {entry.x509_public_key_algorithm}
                        </div>
                      </div>
                      {#if entry.x509_public_key_size}
                        <div>
                          <div class="mb-2 block text-sm font-medium">Key Size (bits)</div>
                          <div class="rounded-lg font-mono text-sm">
                            {entry.x509_public_key_size}
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Subject Alternative Names -->
        {#if isX509Entry && entry.x509_sans && entry.x509_sans.length > 0}
          <div>
            <div class="space-y-3">
              <h3 class="text-lg font-semibold" style="color: var(--foreground);">
                Subject Alternative Names ({entry.x509_sans.length})
              </h3>
              <div class="overflow-x-auto">
                <table class="font-mono text-xs leading-tight">
                  <tbody>
                    {#each entry.x509_sans as san (san)}
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
