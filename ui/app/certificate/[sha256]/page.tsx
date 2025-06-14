import { Certificate } from "@/types/certificate";
import client from "@/lib/clickhouse";
import { notFound } from "next/navigation";

interface CertificateDetailProps {
  params: Promise<{ sha256: string }>;
}

async function getCertificate(sha256: string): Promise<Certificate | null> {
  if (!sha256 || sha256.length !== 64) {
    return null;
  }

  const sql = `
    SELECT 
      log_id,
      log_index,
      retrieval_timestamp,
      entry_timestamp,
      entry_type,
      certificate_sha256,
      tbs_certificate_sha256,
      not_before,
      not_after,
      subject_dn,
      subject_common_name,
      subject_organization,
      subject_organizational_unit,
      subject_country,
      subject_locality,
      subject_province,
      subject_serial_number,
      issuer_dn,
      issuer_common_name,
      issuer_organization,
      issuer_organizational_unit,
      issuer_country,
      issuer_locality,
      issuer_province,
      serial_number,
      subject_alternative_names,
      signature_algorithm,
      subject_public_key_algorithm,
      subject_public_key_length,
      is_ca,
      basic_constraints_path_len,
      key_usage,
      extended_key_usage,
      subject_key_identifier,
      authority_key_identifier,
      crl_distribution_points,
      ocsp_responders,
      precert_issuer_key_hash,
      precert_poison_extension_present,
      leaf_input
    FROM ct_log_entries 
    WHERE (log_id, log_index) IN (
      SELECT log_id, log_index FROM ct_log_entries_by_sha256
      WHERE certificate_sha256 = {sha256:String}
    )
    AND entry_type = 'x509_entry'
    ORDER BY not_after DESC
    SETTINGS max_execution_time = 10, max_threads = 1, max_memory_usage = 67108864
  `;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      sha256: sha256,
    },
    format: "JSONEachRow",
  });

  const data = await resultSet.json<Certificate>();

  if (data.length === 0) {
    return null;
  }

  // Use the first x509_entry for main certificate data, or fallback to first entry
  const mainCert = data[0];

  // Create logs array from all entries
  const ct_logs = data.map((cert) => ({
    log_id: cert.log_id,
    log_index: cert.log_index,
    entry_timestamp: cert.entry_timestamp,
    entry_type: cert.entry_type,
  }));

  return {
    ...mainCert,
    ct_logs,
    ct_log_count: data.length,
  };
}

export default async function CertificateDetail(
  { params }: CertificateDetailProps,
) {
  const { sha256 } = await params;
  const certificate = await getCertificate(sha256);

  if (!certificate) {
    notFound();
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
