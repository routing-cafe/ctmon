import type { PageServerLoad } from "./$types";
import { client } from "$lib/server/clickhouse";
import type { Certificate, SearchQuery } from "$lib/types/certificate";

interface QueryStatistics {
  rows_read?: number;
  bytes_read?: number;
  elapsed?: number;
}

async function getSearchResults(
  query: string,
  queryType: SearchQuery["queryType"],
  limit: number,
): Promise<{ certificates: Certificate[]; error?: string; statistics?: QueryStatistics }> {
  try {
    let whereClause = "";
    const queryParam = query;
    const additionalParams: Record<string, string> = {};

    let sql: string = "";

    switch (queryType) {
      case "domain":
        sql = `
      SELECT 
        certificate_sha256,
        log_id,
        log_index,
        entry_timestamp,
        not_after,
        subject_common_name,
        issuer_common_name,
        issuer_organization
      FROM ct_log_entries_by_name
      WHERE name_rev = reverse({query:String}) OR
            name_rev LIKE reverse({wildcard:String})
      ORDER BY entry_timestamp DESC
      LIMIT {limit:UInt32}
      SETTINGS max_execution_time = 10, max_threads = 1, max_memory_usage = 134217728`;
        additionalParams.wildcard = `%.${query}`;
        break;
      case "sha256":
        whereClause = `(
            (log_id, log_index) IN (
              SELECT log_id, log_index FROM ct_log_entries_by_sha256
              WHERE certificate_sha256 = {query:String}
            )
          )`;
        break;
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }

    if (!sql) {
      sql = `
      SELECT 
        log_id,
        log_index,
        certificate_sha256,
        not_before,
        not_after,
        entry_timestamp,
        subject_common_name,
        issuer_common_name,
        issuer_organization,
        serial_number,
        subject_alternative_names
      FROM ct_log_entries 
      WHERE ${whereClause}
      AND entry_type = 'x509_entry'
      ORDER BY entry_timestamp DESC 
      LIMIT {limit:UInt32}
      SETTINGS max_execution_time = 10, max_threads = 1, max_memory_usage = 134217728
    `;
    }

    const resultSet = await client.query({
      query: sql,
      query_params: {
        query: queryParam,
        limit: limit,
        ...additionalParams,
      },
      format: "JSONEachRow",
    });

    const rows = await resultSet.json();
    const rawData = rows as Certificate[];

    // Merge entries with the same certificate_sha256 and count distinct log entries
    const certMap = new Map<string, { cert: Certificate; logEntries: Set<string> }>();

    for (const current of rawData) {
      const sha256 = current.certificate_sha256;
      const logKey = `${current.log_id}-${current.log_index}`;

      if (certMap.has(sha256)) {
        // Add this log entry to the existing certificate
        const existing = certMap.get(sha256)!;
        if (current.entry_timestamp < existing.cert.entry_timestamp) {
          existing.cert.entry_timestamp = current.entry_timestamp;
        }
        certMap.get(sha256)!.logEntries.add(logKey);
      } else {
        // Create new entry
        certMap.set(sha256, {
          cert: { ...current, ct_log_count: 1 },
          logEntries: new Set([logKey]),
        });
      }
    }

    // Convert back to array and set the correct counts
    const data = Array.from(certMap.values()).map(({ cert, logEntries }) => ({
      ...cert,
      ct_log_count: logEntries.size,
    }));
    data.sort(
      (a, b) => new Date(b.entry_timestamp).getTime() - new Date(a.entry_timestamp).getTime(),
    );

    const headers = resultSet.response_headers;
    const summaryHeader = headers["x-clickhouse-summary"];
    const summaryValue = Array.isArray(summaryHeader) ? summaryHeader[0] : summaryHeader;

    let statistics: QueryStatistics | undefined = undefined;

    if (summaryValue) {
      try {
        const summary = JSON.parse(summaryValue);
        statistics = {
          elapsed: parseFloat(summary.elapsed_ns || "0") / 1000000000, // Convert nanoseconds to seconds
          rows_read: parseInt(summary.read_rows || "0"),
          bytes_read: parseInt(summary.read_bytes || "0"),
        };
      } catch (error) {
        console.error("Failed to parse ClickHouse summary:", error);
      }
    }

    return { certificates: data, statistics };
  } catch (error) {
    console.error("Search error:", error);
    return {
      certificates: [],
      error: "Failed to perform search",
      statistics: undefined,
    };
  }
}

export const load: PageServerLoad = async ({ params, url }) => {
  const domain = decodeURIComponent(params.domain);
  const queryType = (url.searchParams.get("type") as SearchQuery["queryType"]) || "domain";
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const { certificates, error, statistics } = await getSearchResults(domain, queryType, limit);

  return {
    domain,
    queryType,
    limit,
    certificates,
    error,
    statistics,
  };
};
