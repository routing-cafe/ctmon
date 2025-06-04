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
        <div className="container mx-auto px-6 py-8 max-w-7xl">
          <div className="flex justify-center items-center py-16">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin"
                style={{ color: "var(--primary)" }}
              >
              </div>
              <span
                className="text-lg font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
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
        <div className="container mx-auto px-6 py-8 max-w-7xl">
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
              Certificate not found
            </h1>
            <p
              className="text-lg mb-8"
              style={{ color: "var(--muted-foreground)" }}
            >
              {error}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-150 ease-out"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
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

        <div className="max-w-6xl mx-auto">
          <div
            className="border rounded-xl overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
              <div className="space-y-8">
                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--card-foreground)" }}
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
                        className="font-mono text-sm break-all p-3 rounded-lg"
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
                          className="font-mono text-sm p-3 rounded-lg"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.subject_organization.join(", ")}
                        </div>
                      </div>
                    )}

                    {certificate.subject_country.length > 0 && (
                      <div>
                        <label
                          className="text-sm font-medium block mb-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Country
                        </label>
                        <div
                          className="font-mono text-sm p-3 rounded-lg"
                          style={{ background: "var(--muted)" }}
                        >
                          {certificate.subject_country.join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--card-foreground)" }}
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
                        className="font-mono text-sm break-all p-3 rounded-lg"
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
                          className="font-mono text-sm p-3 rounded-lg"
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
                    style={{ color: "var(--card-foreground)" }}
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
                        className="font-mono text-sm break-all p-3 rounded-lg"
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
                        className="font-mono text-sm break-all p-3 rounded-lg"
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
                          className="text-sm p-3 rounded-lg"
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
                          className="text-sm p-3 rounded-lg"
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
                      <span
                        className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium"
                        style={{
                          background: certificate.entry_type === "x509_entry"
                            ? "var(--accent)"
                            : "var(--secondary)",
                          color: certificate.entry_type === "x509_entry"
                            ? "var(--accent-foreground)"
                            : "var(--secondary-foreground)",
                        }}
                      >
                        {certificate.entry_type === "x509_entry"
                          ? "Certificate"
                          : "Precertificate"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="border-t p-6"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="text-xs">
                <div
                  className="grid grid-cols-12 gap-2 py-2 font-medium border-b"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <div className="col-span-6">Log ID</div>
                  <div className="col-span-2">Index</div>
                  <div className="col-span-2">Timestamp</div>
                </div>
                {(certificate.ct_logs ?? []).map((log, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-12 gap-2 py-2 border-b"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="col-span-6 font-mono break-all">
                      {log.log_id}
                    </div>
                    <div className="col-span-2">{log.log_index}</div>
                    <div className="col-span-2">
                      {new Date(log.entry_timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {certificate.subject_alternative_names.length > 0 && (
              <div
                className="p-6 pt-1"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-xs">
                  <div
                    className="grid grid-cols-12 gap-2 py-2 font-medium border-b"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    <div className="col-span-12">
                      Subject Alternative Names ({certificate
                        .subject_alternative_names.length})
                    </div>
                  </div>
                  {certificate.subject_alternative_names.map((san, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-2 py-2 border-b"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="col-span-12 font-mono break-all">
                        {san}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
