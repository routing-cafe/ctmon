import type { PageServerLoad } from './$types';
import { client } from '$lib/server/clickhouse';

interface RekorStatsRow {
  log_id: number;
  max_timestamp: string;
  total: number;
}

async function getRekorStats(): Promise<RekorStatsRow[]> {
  const sql = `
    SELECT 
      tree_id as log_id,
      max_timestamp,
      total
    FROM rekor_log_stats_by_tree_id 
    ORDER BY tree_id
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
  `;

  const result = await client.query({
    query: sql,
    format: 'JSONEachRow',
  });

  return result.json();
}

export const load: PageServerLoad = async () => {
  try {
    const rekorStats = await getRekorStats();

    return {
      rekorStats
    };
  } catch (error) {
    console.error('Failed to load Rekor stats:', error);
    return {
      rekorStats: [] as RekorStatsRow[]
    };
  }
};