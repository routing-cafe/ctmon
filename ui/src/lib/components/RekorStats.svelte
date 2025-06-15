<script lang="ts">
  interface RekorStatsRow {
    log_id: number;
    max_timestamp: string;
    total: number;
  }

  let { stats }: { stats: RekorStatsRow[] } = $props();
</script>

<div>
  <h2 class="mb-4 text-lg font-semibold">Sigstore Rekor Log Statistics</h2>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="border-b border-gray-700">
          <th class="p-2 text-left">Tree ID</th>
          <th class="p-2 text-left">Latest Entry</th>
          <th class="p-2 text-left">Total Entries</th>
        </tr>
      </thead>
      <tbody>
        {#each stats as stat (stat.log_id)}
          <tr class="border-b border-gray-800 hover:bg-gray-900">
            <td class="p-2 font-mono">{stat.log_id}</td>
            <td class="p-2 font-mono">{stat.max_timestamp}</td>
            <td class="p-2 font-mono">{stat.total.toLocaleString()}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
