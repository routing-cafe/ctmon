"use client";

import { Certificate } from "@/types/certificate";
import Link from "next/link";

interface CertificateListProps {
  certificates: Certificate[];
  loading: boolean;
}

export default function CertificateList(
  { certificates, loading }: CertificateListProps,
) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="flex items-center gap-3">
          <div
            className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"
            style={{ color: "var(--primary)" }}
          >
          </div>
          <span
            className="text-sm font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            Searching certificates...
          </span>
        </div>
      </div>
    );
  }

  if (certificates.length === 0) {
    return (
      <div className="text-center py-12">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--muted)" }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: "var(--muted-foreground)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2
          className="text-xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Found {certificates.length} certificates
        </h2>
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {certificates.length === 100
            ? "Showing first 100 results"
            : `${certificates.length} results`}
        </div>
      </div>

      <div className="space-y-4">
        {certificates.map((cert, index) => (
          <div
            key={`${cert.log_id}-${cert.log_index}-${index}`}
            className="border rounded-xl p-6 transition-all duration-150 ease-out hover:shadow-md"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label
                    className="text-sm font-medium block mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Common Name
                  </label>
                  <div
                    className="font-mono text-sm break-all p-2 rounded-lg"
                    style={{ background: "var(--muted)" }}
                  >
                    {cert.subject_common_name}
                  </div>
                </div>

                {cert.subject_alternative_names.length > 0 && (
                  <div>
                    <label
                      className="text-sm font-medium block mb-2"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Subject Alternative Names ({cert.subject_alternative_names
                        .length})
                    </label>
                    <div className="space-y-1">
                      {cert.subject_alternative_names.slice(0, 3).map((
                        san,
                        i,
                      ) => (
                        <div
                          key={i}
                          className="font-mono text-sm break-all p-2 rounded-lg"
                          style={{ background: "var(--muted)" }}
                        >
                          {san}
                        </div>
                      ))}
                      {cert.subject_alternative_names.length > 3 && (
                        <div
                          className="text-xs px-2 py-1"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          + {cert.subject_alternative_names.length - 3}{" "}
                          more domains
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label
                    className="text-sm font-medium block mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Issuer
                  </label>
                  <div
                    className="font-mono text-sm break-all p-2 rounded-lg"
                    style={{ background: "var(--muted)" }}
                  >
                    {cert.issuer_common_name}
                    {cert.issuer_organization?.length > 0
                      ? ` (${cert.issuer_organization.join(", ")})`
                      : ""}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      className="text-sm font-medium block mb-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Valid From (UTC)
                    </label>
                    <div
                      className="text-sm p-2 rounded-lg"
                      style={{ background: "var(--muted)" }}
                    >
                      {cert.not_before}
                    </div>
                  </div>
                  <div>
                    <label
                      className="text-sm font-medium block mb-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Valid Until (UTC)
                    </label>
                    <div
                      className="text-sm p-2 rounded-lg"
                      style={{ background: "var(--muted)" }}
                    >
                      {cert.not_after}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    className="text-sm font-medium block mb-1"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Serial Number
                  </label>
                  <div
                    className="font-mono text-xs break-all p-2 rounded-lg"
                    style={{ background: "var(--muted)" }}
                  >
                    {cert.serial_number}
                  </div>
                </div>

                {cert.ct_log_count && (
                  <div>
                    <label
                      className="text-sm font-medium block mb-2"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      CT Log Entries
                    </label>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        background: "var(--primary)",
                        color: "var(--primary-foreground)",
                      }}
                    >
                      {cert.ct_log_count} logs
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              className="mt-6 pt-4 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="text-sm font-medium shrink-0"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  SHA-256:
                </span>
                <Link
                  href={`/certificate/${cert.certificate_sha256}`}
                  className="font-mono text-sm break-all transition-colors duration-150 ease-out hover:underline"
                  style={{ color: "var(--primary)" }}
                  onMouseEnter={(e) =>
                    e.currentTarget.style.color = "var(--accent)"}
                  onMouseLeave={(e) =>
                    e.currentTarget.style.color = "var(--primary)"}
                >
                  {cert.certificate_sha256}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
