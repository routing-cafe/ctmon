import { SigstoreEntry, SigstoreSearchQuery } from "@/types/sigstore";
import client from "@/lib/clickhouse";
import Link from "next/link";

interface SigstoreSearchPageProps {
  params: Promise<{ query: string }>;
  searchParams: Promise<{ type?: string; limit?: string }>;
}

interface QueryStatistics {
  rows_read?: number;
  bytes_read?: number;
  elapsed?: number;
}

async function getSigstoreSearchResults(
  query: string,
  queryType: SigstoreSearchQuery["queryType"],
  limit: number,
): Promise<
  { entries: SigstoreEntry[]; error?: string; statistics?: QueryStatistics }
> {
  try {
    let sql = "";
    const queryParams: Record<string, string> = {};

    if (
      queryType === "github_repository" || queryType === "github_organization"
    ) {
      // Use the materialized view directly for GitHub searches
      let whereClause = "";
      if (queryType === "github_repository") {
        whereClause = "repository_name = {query:String}";
        queryParams.query = query;
      } else {
        whereClause = "repository_name LIKE {queryPattern:String}";
        queryParams.queryPattern = `${query}/%`;
      }

      sql = `
        SELECT 
          tree_id,
          log_index,
          entry_uuid,
          integrated_time,
          repository_name
        FROM rekor_log_entries_by_github_repository
        WHERE ${whereClause}
        ORDER BY integrated_time DESC
        LIMIT {limit:UInt32}
        SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 268435456
      `;
    } else {
      // Use the main table for other search types
      let whereClause = "";
      switch (queryType) {
        case "hash":
          whereClause = "data_hash_value = {query:String}";
          queryParams.query = query;
          break;
        case "x509_san":
          whereClause = "has(x509_sans, {query:String})";
          queryParams.query = query;
          break;
        case "pgp_fingerprint":
          whereClause = "pgp_public_key_fingerprint = {query:String}";
          queryParams.query = query.toUpperCase().replace(/\s/g, "");
          break;
        case "pgp_email":
          whereClause = "pgp_signer_email ILIKE {queryPattern:String}";
          queryParams.queryPattern = `%${query}%`;
          break;
        default:
          throw new Error(`Unsupported query type: ${queryType}`);
      }

      sql = `
        SELECT 
          tree_id,
          log_index,
          entry_uuid,
          retrieval_timestamp,
          integrated_time,
          log_id,
          kind,
          api_version,
          signature_format,
          data_hash_algorithm,
          data_hash_value,
          data_url,
          signature_url,
          public_key_url,
          x509_certificate_sha256,
          x509_subject_dn,
          x509_subject_cn,
          x509_subject_organization,
          x509_subject_ou,
          x509_issuer_dn,
          x509_issuer_cn,
          x509_issuer_organization,
          x509_issuer_ou,
          x509_serial_number,
          x509_not_before,
          x509_not_after,
          x509_sans,
          x509_signature_algorithm,
          x509_public_key_algorithm,
          x509_public_key_size,
          x509_is_ca,
          x509_key_usage,
          x509_extended_key_usage,
          pgp_signature_hash,
          pgp_public_key_fingerprint,
          pgp_key_id,
          pgp_signer_user_id,
          pgp_signer_email,
          pgp_signer_name,
          pgp_key_algorithm,
          pgp_key_size,
          pgp_subkey_fingerprints
        FROM rekor_log_entries 
        WHERE ${whereClause}
        ORDER BY (tree_id, log_index) DESC
        LIMIT {limit:UInt32}
        SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 268435456
      `;
    }

    const resultSet = await client.query({
      query: sql,
      query_params: {
        ...queryParams,
        limit: limit,
      },
      format: "JSONEachRow",
    });

    const entries = await resultSet.json<SigstoreEntry>();

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

    return { entries, statistics };
  } catch (error) {
    console.error("Sigstore search error:", error);
    return {
      entries: [],
      error: "Failed to perform search",
      statistics: undefined,
    };
  }
}

export default async function SigstoreSearchPage({
  params,
  searchParams,
}: SigstoreSearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);
  const searchParamsResolved = await searchParams;
  const queryType =
    (searchParamsResolved.type || "x509_san") as SigstoreSearchQuery[
      "queryType"
    ];
  const limit = parseInt(searchParamsResolved.limit || "100", 10);

  const { entries, error, statistics } = await getSigstoreSearchResults(
    decodedQuery,
    queryType,
    limit,
  );

  const getSearchTypeLabel = (type: string) => {
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
                Sigstore Search Results
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
                  {decodedQuery}
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

        {entries.length === 0
          ? (
            <div>
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: "var(--foreground)" }}
              >
                No entries found
              </h3>
              <p style={{ color: "var(--muted-foreground)" }}>
                Try adjusting your search query or search type.
              </p>
            </div>
          )
          : (
            <div className="space-y-3">
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Found {entries.length} entries
              </h2>

              <div className="overflow-x-auto">
                <table className="text-xs leading-tight font-mono">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {queryType !== "github_repository" &&
                        queryType !== "github_organization" && (
                        <th
                          className="text-left py-1 pr-4 font-medium"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Type
                        </th>
                      )}
                      <th
                        className="text-left py-1 pr-4 font-medium"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {queryType === "github_repository" ||
                            queryType === "github_organization"
                          ? "Repository"
                          : "Subject/Signer"}
                      </th>
                      <th
                        className="text-left py-1 pr-4 font-medium"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Integrated Time (UTC)
                      </th>
                      {queryType !== "github_repository" &&
                        queryType !== "github_organization" && (
                        <th
                          className="text-left py-1 pr-4 font-medium"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Data Hash
                        </th>
                      )}
                      <th
                        className="text-right py-1 font-medium w-32"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Entry UUID
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => {
                      const formatDate = (dateStr: string) => {
                        try {
                          return new Date(dateStr).toISOString().replace(
                            "T",
                            " ",
                          ).substring(0, 19);
                        } catch {
                          return dateStr;
                        }
                      };

                      const getSubjectOrSigner = () => {
                        if (
                          queryType === "github_repository" ||
                          queryType === "github_organization"
                        ) {
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
                      };

                      const getEntryType = () => {
                        if (entry.x509_certificate_sha256) {
                          return "X.509";
                        } else if (entry.pgp_public_key_fingerprint) {
                          return "PGP";
                        } else {
                          return entry.kind;
                        }
                      };

                      return (
                        <tr
                          key={`${entry.entry_uuid}-${index}`}
                          className="hover:bg-opacity-50"
                          style={{
                            color: "var(--foreground)",
                          }}
                        >
                          {queryType !== "github_repository" &&
                            queryType !== "github_organization" && (
                            <td className="py-0.5 pr-4">
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: "var(--accent)",
                                  color: "var(--accent-foreground)",
                                }}
                              >
                                {getEntryType()}
                              </span>
                            </td>
                          )}
                          <td className="py-0.5 pr-4 max-w-xs truncate">
                            {getSubjectOrSigner()}
                          </td>
                          <td className="py-0.5 pr-4">
                            {formatDate(entry.integrated_time)}
                          </td>
                          {queryType !== "github_repository" &&
                            queryType !== "github_organization" && (
                            <td className="py-0.5 pr-4 max-w-xs truncate">
                              {entry.data_hash_value
                                ? `${entry.data_hash_algorithm}:${
                                  entry.data_hash_value.substring(0, 16)
                                }...`
                                : "-"}
                            </td>
                          )}
                          <td className="py-0.5 text-right w-32">
                            <Link
                              href={`/sigstore/entry/${entry.entry_uuid}`}
                              className="transition-colors duration-150 ease-out underline hover:opacity-75"
                              style={{ color: "var(--primary)" }}
                            >
                              {entry.entry_uuid.substring(0, 16)}...
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
