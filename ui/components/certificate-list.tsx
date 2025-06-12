"use client";

import { Certificate } from "@/types/certificate";
import Link from "next/link";

interface CertificateListProps {
  certificates: Certificate[];
}

export default function CertificateList(
  { certificates }: CertificateListProps,
) {
  if (certificates.length === 0) {
    return (
      <div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--foreground)" }}
        >
          No certificates found
        </h3>
        <p style={{ color: "var(--muted-foreground)" }}>
          Try adjusting your search query or search type.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2
        className="text-lg font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        Found {certificates.length} certificates
      </h2>

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
                Common Name
              </th>
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
                Timestamp (UTC)
              </th>
              <th
                className="text-left py-1 pr-4 font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Log Entries
              </th>
              <th
                className="text-right py-1 font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                SHA-256
              </th>
            </tr>
          </thead>
          <tbody>
            {certificates.map((cert, index) => (
              <tr
                key={`${cert.log_id}-${cert.log_index}-${index}`}
                className="hover:bg-opacity-50"
                style={{
                  color: "var(--foreground)",
                }}
              >
                <td className="py-0.5 pr-4 max-w-xs truncate">
                  {cert.subject_common_name}
                </td>
                <td className="py-0.5 pr-4 max-w-xs truncate">
                  {`${cert.issuer_organization} ${cert.issuer_common_name}`}
                </td>
                <td className="py-0.5 pr-4">
                  {cert.entry_timestamp}
                </td>
                <td className="py-0.5 pr-4">
                  {cert.ct_log_count !== undefined
                    ? `${cert.ct_log_count}`
                    : "-"}
                </td>
                <td className="py-0.5 text-right">
                  <Link
                    href={`/certificate/${cert.certificate_sha256}`}
                    className="transition-colors duration-150 ease-out underline"
                    style={{ color: "var(--primary)" }}
                    onMouseEnter={(e) =>
                      e.currentTarget.style.color = "var(--accent)"}
                    onMouseLeave={(e) =>
                      e.currentTarget.style.color = "var(--primary)"}
                  >
                    {cert.certificate_sha256.substring(0, 16)}...
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
