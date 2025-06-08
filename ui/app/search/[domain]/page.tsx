import Link from "next/link";
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

    switch (queryType) {
      case "domain":
        whereClause = `(
            (log_id, log_index) IN (
              SELECT log_id, log_index FROM ct_log_entries_by_name
              WHERE name_rev = reverse({query:String}) OR
                    name_rev LIKE reverse({wildcard:String})
            )
          )`;
        additionalParams.wildcard = `%.${query}`;
        break;
      case "commonName":
        whereClause = "subject_common_name = {query:String}";
        break;
      case "serialNumber":
        whereClause = "serial_number = {query:String}";
        break;
      case "sha256":
        whereClause = "certificate_sha256 = {query:String}";
        break;
      case "issuer":
        whereClause = "issuer_common_name = {query:String}";
        break;
      default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }

    const sql = `
      SELECT 
        log_id,
        log_index,
        certificate_sha256,
        not_before,
        not_after,
        subject_common_name,
        issuer_common_name,
        issuer_organization,
        serial_number,
        subject_alternative_names
      FROM ct_log_entries 
      WHERE ${whereClause}
      AND entry_type = 'x509_entry'
      ORDER BY not_after DESC 
      LIMIT {limit:UInt32}
      SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 134217728
    `;

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
    const rawData = Array.isArray(rows)
      ? rows as Certificate[]
      : [rows as Certificate];

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

  if (!domain) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 ease-out"
              style={{ color: "var(--primary)" }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Search
            </Link>
          </div>

          <div className="text-center py-16">
            <div
              className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: "var(--destructive)",
                color: "var(--destructive-foreground)",
              }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
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
              No search query provided
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { certificates, error, statistics } = await getSearchResults(
    domain,
    queryType,
    limit,
  );

  const getSearchTypeLabel = (type: string) => {
    switch (type) {
      case "domain":
        return "Domain/SAN";
      case "commonName":
        return "Common Name";
      case "serialNumber":
        return "Serial Number";
      case "sha256":
        return "SHA-256";
      case "issuer":
        return "Issuer";
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
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 ease-out"
              style={{ color: "var(--primary)" }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Search
            </Link>
          </div>

          <div className="text-center py-16">
            <div
              className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{
                background: "var(--destructive)",
                color: "var(--destructive-foreground)",
              }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
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
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-150 ease-out"
            style={{ color: "var(--primary)" }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Search
          </Link>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div>
              <h1
                className="text-3xl font-semibold tracking-tight"
                style={{ color: "var(--foreground)" }}
              >
                Search Results
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="text-lg"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {getSearchTypeLabel(queryType)}:
                </span>
                <span
                  className="text-lg font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {decodeURIComponent(domain)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {statistics && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{
              background: "var(--muted)",
              color: "var(--muted-foreground)",
            }}
          >
            <h3
              className="text-sm font-medium mb-3"
              style={{ color: "var(--foreground)" }}
            >
              Query Statistics
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="block font-medium">Rows Read</span>
                <span>{statistics.rows_read?.toLocaleString() || "N/A"}</span>
              </div>
              <div>
                <span className="block font-medium">Bytes Read</span>
                <span>
                  {statistics.bytes_read
                    ? `${(statistics.bytes_read / 1024 / 1024).toFixed(2)} MB`
                    : "N/A"}
                </span>
              </div>
              <div>
                <span className="block font-medium">Elapsed Time</span>
                <span>
                  {statistics.elapsed
                    ? `${(statistics.elapsed * 1000).toFixed(0)} ms`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>
        )}

        <CertificateList certificates={certificates} loading={false} />
      </div>
    </div>
  );
}
