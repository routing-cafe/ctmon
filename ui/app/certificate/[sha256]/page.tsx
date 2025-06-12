"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Certificate } from "@/types/certificate";

export default function CertificateDetail() {
  const params = useParams();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sha256 = params.sha256 as string;

  useEffect(() => {
    if (!sha256 || sha256.length !== 64) {
      setError("Invalid SHA-256 hash");
      setLoading(false);
      return;
    }

    const fetchCertificate = async () => {
      try {
        const response = await fetch(`/api/certificate/${sha256}`);
        const data = await response.json();

        if (response.ok) {
          setCertificate(data);
        } else {
          setError(data.error || "Certificate not found");
        }
      } catch {
        setError("Failed to fetch certificate details");
      } finally {
        setLoading(false);
      }
    };

    fetchCertificate();
  }, [sha256]);

  if (loading) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="container px-6 max-w-7xl">
          <div className="flex py-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin">
              </div>
              <span className="text-lg font-medium">
                Loading certificate details...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="container px-6 py-8 max-w-7xl">
          <div className="text-center py-16">
            <div
              className="w-16 h-16 mb-6 rounded-full flex items-center justify-center"
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
              Certificate not found
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

  if (!certificate) {
    return null;
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="container px-6 py-8 max-w-7xl">
        <div className="max-w-6xl">
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-8">
                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--foreground)" }}
                  >
                    Subject Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label
                        className="text-sm font-medium block mb-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Common Name
                      </label>
                      <div
                        className="font-mono text-sm break-all rounded-lg"
                        style={{ background: "var(--muted)" }}
                      >
                        {certificate.subject_common_name}
                      </div>
                    </div>

                    {certificate.subject_organization.length > 0 && (
                      <div>
                        <label
                          className="text-sm font-medium block mb-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Organization
                        </label>
                        <div
                          className="font-mono text-sm rounded-lg"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.subject_organization.join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--foreground)" }}
                  >
                    Issuer Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label
                        className="text-sm font-medium block mb-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Common Name
                      </label>
                      <div
                        className="font-mono text-sm break-all rounded-lg"
                        style={{ background: "var(--muted)" }}
                      >
                        {certificate.issuer_common_name}
                      </div>
                    </div>

                    {certificate.issuer_organization.length > 0 && (
                      <div>
                        <label
                          className="text-sm font-medium block mb-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Organization
                        </label>
                        <div
                          className="font-mono text-sm rounded-lg"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.issuer_organization.join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--foreground)" }}
                  >
                    Certificate Details
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label
                        className="text-sm font-medium block mb-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Serial Number
                      </label>
                      <div
                        className="font-mono text-sm break-all rounded-lg"
                        style={{ background: "var(--muted)" }}
                      >
                        {certificate.serial_number}
                      </div>
                    </div>

                    <div>
                      <label
                        className="text-sm font-medium block mb-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        SHA-256 Fingerprint
                      </label>
                      <div
                        className="font-mono text-sm break-all rounded-lg"
                        style={{ background: "var(--muted)" }}
                      >
                        {certificate.certificate_sha256}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className="text-sm font-medium block mb-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Valid From (UTC)
                        </label>
                        <div
                          className="text-sm rounded-lg font-mono"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.not_before}
                        </div>
                      </div>
                      <div>
                        <label
                          className="text-sm font-medium block mb-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Valid Until (UTC)
                        </label>
                        <div
                          className="text-sm rounded-lg font-mono"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.not_after}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        className="text-sm font-medium block mb-2"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Entry Type
                      </label>
                      <span className="inline-flex items-center rounded-lg text-sm font-mono">
                        {certificate.entry_type === "x509_entry"
                          ? "Certificate"
                          : "Precertificate"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-3">
                <h3
                  className="text-lg font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  CT Log Entries
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
                          Log ID
                        </th>
                        <th
                          className="text-left py-1 pr-4 font-medium"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Index
                        </th>
                        <th
                          className="text-right py-1 font-medium"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Timestamp (UTC)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(certificate.ct_logs ?? []).map((log, index) => (
                        <tr
                          key={index}
                          className="hover:bg-opacity-50"
                          style={{
                            color: "var(--foreground)",
                          }}
                        >
                          <td className="py-0.5 pr-4">
                            {log.log_id}
                          </td>
                          <td className="py-0.5 pr-4">
                            {log.log_index}
                          </td>
                          <td className="py-0.5 text-right">
                            {log.entry_timestamp}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {certificate.subject_alternative_names.length > 0 && (
              <div>
                <div className="space-y-3">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Subject Alternative Names ({certificate
                      .subject_alternative_names.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="text-xs leading-tight font-mono">
                      <tbody>
                        {certificate.subject_alternative_names.map((
                          san,
                          index,
                        ) => (
                          <tr
                            key={index}
                            className="hover:bg-opacity-50"
                            style={{
                              color: "var(--foreground)",
                            }}
                          >
                            <td className="py-0.5">
                              {san}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
