"use client";

interface CtStatsRow {
    log_id: number;
    max_timestamp: string;
    total: number;
}

interface CtStatsProps {
    stats: CtStatsRow[];
}

export default function CtStats({ stats }: CtStatsProps) {
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
                                Log
                            </th>
                            <th
                                className="text-left py-1 pr-4 font-medium"
                                style={{ color: "var(--muted-foreground)" }}
                            >
                                Latest (UTC)
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
                        {stats.map((row, index) => (
                            <tr
                                key={row.log_id}
                                className="hover:bg-opacity-50"
                                style={{
                                    color: "var(--foreground)",
                                }}
                            >
                                <td className="py-0.5 pr-4">
                                    {row.log_id}
                                </td>
                                <td className="py-0.5 pr-4">
                                    {row.max_timestamp}
                                </td>
                                <td className="py-0.5 text-right">
                                    {row.total.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
