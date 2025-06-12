import CertificateList from "@/components/certificate-list";
import { Certificate, SearchQuery } from "@/types/certificate";
import client from "@/lib/clickhouse";

interface SearchResultsProps {
  params: Promise<{
    domain: string;
  }>;
  searchParams: Promise<{
    type?: SearchQuery["queryType"];
    limit?: string;
  }>;
}

interface QueryStatistics {
  rows_read?: number;
  bytes_read?: number;
  elapsed?: number;
}

async function getSearchResults(
  query: string,
  queryType: SearchQuery["queryType"],
  limit: number,
): Promise<
  { certificates: Certificate[]; error?: string; statistics?: QueryStatistics }
> {
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
    const certMap = new Map<
      string,
      { cert: Certificate; logEntries: Set<string> }
    >();

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
      (a, b) =>
        new Date(b.entry_timestamp).getTime() -
        new Date(a.entry_timestamp).getTime(),
    );

    const headers = resultSet.response_headers;
    const summaryHeader = headers["x-clickhouse-summary"];
    const summaryValue = Array.isArray(summaryHeader)
      ? summaryHeader[0]
      : summaryHeader;

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

export default async function SearchResults(
  { params, searchParams }: SearchResultsProps,
) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const domain = decodeURIComponent(resolvedParams.domain);
  const queryType = resolvedSearchParams.type || "domain";
  const limit = parseInt(resolvedSearchParams.limit || "100");

  const { certificates, error, statistics } = await getSearchResults(
    domain,
    queryType,
    limit,
  );

  const getSearchTypeLabel = (type: string) => {
    switch (type) {
      case "domain":
        return "Domain/SAN";
      case "sha256":
        return "SHA-256";
      default:
        return "Domain/SAN";
    }
  };

  if (error) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="container px-6 py-8 max-w-7xl">
          <div>
            <h1
              className="text-2xl font-semibold mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Search Error
            </h1>
            <p
              className="text-lg mb-8"
              style={{ color: "var(--muted-foreground)" }}
            >
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="container px-6 py-4 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div>
              <p
                className="text-lg font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Search Results
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {getSearchTypeLabel(queryType)}:
                </span>
                <span
                  className="text-sm font-medium font-mono"
                  style={{ color: "var(--foreground)" }}
                >
                  {decodeURIComponent(domain)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {statistics && (
          <div className="space-y-3 mb-6">
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Query Statistics
            </h3>
            <div className="overflow-x-auto">
              <table className="text-xs leading-tight font-mono">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <th
                      className="text-left py-1 pr-4 font-medium"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Rows Read
                    </th>
                    <th
                      className="text-left py-1 pr-4 font-medium"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Bytes Read
                    </th>
                    <th
                      className="text-right py-1 font-medium"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Elapsed Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    className="hover:bg-opacity-50"
                    style={{
                      color: "var(--foreground)",
                    }}
                  >
                    <td className="py-0.5 pr-4">
                      {statistics.rows_read?.toLocaleString() || "N/A"}
                    </td>
                    <td className="py-0.5 pr-4">
                      {statistics.bytes_read
                        ? `${
                          (statistics.bytes_read / 1024 / 1024).toFixed(2)
                        } MB`
                        : "N/A"}
                    </td>
                    <td className="py-0.5 text-right">
                      {statistics.elapsed
                        ? `${(statistics.elapsed * 1000).toFixed(0)} ms`
                        : "N/A"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <CertificateList certificates={certificates} />
      </div>
    </div>
  );
}
