import type { PageServerLoad } from "./$types";
import { client } from "$lib/server/clickhouse";

interface CtStatsRow {
  log_id: number;
  max_timestamp: string;
  total: number;
}

interface RekorStatsRow {
  log_id: number;
  max_timestamp: string;
  total: number;
}

async function getCtStats(): Promise<CtStatsRow[]> {
  const sql = `
    SELECT 
      log_id,
      max_timestamp,
      total
    FROM ct_log_stats_by_log_id 
    ORDER BY log_id
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
  `;

  const result = await client.query({
    query: sql,
    format: "JSONEachRow",
  });

  return result.json();
}

async function getRekorStats(): Promise<RekorStatsRow[]> {
  const sql = `
    SELECT 
      tree_id as log_id,
      max(integrated_time) as max_timestamp,
      count() as total
    FROM rekor_log_entries
    WHERE integrated_time >= now() - INTERVAL 30 DAY
    GROUP BY tree_id 
    ORDER BY tree_id
    SETTINGS max_execution_time = 5, max_threads = 1, max_memory_usage = 134217728
  `;

  const result = await client.query({
    query: sql,
    format: "JSONEachRow",
  });

  return result.json();
}

export const load: PageServerLoad = async () => {
  try {
    const [ctStats, rekorStats] = await Promise.all([getCtStats(), getRekorStats()]);

    return {
      ctStats,
      rekorStats,
    };
  } catch (error) {
    console.error("Failed to load stats:", error);
    return {
      ctStats: [] as CtStatsRow[],
      rekorStats: [] as RekorStatsRow[],
    };
  }
};
