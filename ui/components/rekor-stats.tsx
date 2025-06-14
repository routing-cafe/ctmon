import client from "@/lib/clickhouse";

interface RekorStatsRow {
    x509_issuer_cn: string;
    total_entries: number;
    last_seen: string;
}

export default async function RekorStats() {
    const sql = `
      SELECT 
        x509_issuer_cn,
        total_entries,
        last_seen
      FROM rekor_log_stats_by_issuer 
      ORDER BY total_entries DESC
    `;

    const resultSet = await client.query({
        query: sql,
        query_params: {},
        format: "JSONEachRow",
    });

    const stats = (await resultSet.json()) as RekorStatsRow[];

    return (
        <div className="space-y-3 pt-4">
            <p className="mb-4 font-bold">Statistics</p>
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
                                Issuer
                            </th>
                            <th
                                className="text-left py-1 pr-4 font-medium"
                                style={{ color: "var(--muted-foreground)" }}
                            >
                                Last Seen (UTC)
                            </th>
                            <th
                                className="text-right py-1 font-medium"
                                style={{ color: "var(--muted-foreground)" }}
                            >
                                Total
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((row) => (
                            <tr
                                key={row.x509_issuer_cn}
                                className="hover:bg-opacity-50"
                                style={{
                                    color: "var(--foreground)",
                                }}
                            >
                                <td className="py-0.5 pr-4">
                                    {row.x509_issuer_cn}
                                </td>
                                <td className="py-0.5 pr-4">
                                    {row.last_seen}
                                </td>
                                <td className="py-0.5 text-right">
                                    {row.total_entries.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}