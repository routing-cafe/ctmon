import { SigstoreEntry } from "@/types/sigstore";
import client from "@/lib/clickhouse";
import { notFound } from "next/navigation";

interface SigstoreEntryDetailProps {
  params: Promise<{ uuid: string }>;
}

async function getSigstoreEntry(uuid: string): Promise<SigstoreEntry | null> {
  if (!uuid) {
    return null;
  }

  const sql = `
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
    WHERE entry_uuid = {uuid:String}
    LIMIT 1
    SETTINGS max_execution_time = 10, max_threads = 1, max_memory_usage = 134217728
  `;

  const resultSet = await client.query({
    query: sql,
    query_params: {
      uuid: uuid,
    },
    format: "JSONEachRow",
  });

  const entries = await resultSet.json<SigstoreEntry>();

  if (entries.length === 0) {
    return null;
  }

  return entries[0];
}

export default async function SigstoreEntryDetail(
  { params }: SigstoreEntryDetailProps,
) {
  const { uuid } = await params;
  const entry = await getSigstoreEntry(uuid);

  if (!entry) {
    notFound();
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toISOString().replace("T", " ").substring(0, 19);
    } catch {
      return dateStr;
    }
  };

  const isPgpEntry = entry.pgp_public_key_fingerprint;
  const isX509Entry = entry.x509_certificate_sha256;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="container px-6 py-8 max-w-7xl">
        <div className="max-w-6xl">
          <div className="space-y-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <h1
                  className="text-2xl font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Sigstore Entry Details
                </h1>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-foreground)",
                  }}
                >
                  {entry.signature_format}
                </span>
              </div>
              <p className="text-sm font-mono">
                UUID: {entry.entry_uuid}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Entry Information */}
              <div className="space-y-8">
                <div>
                  <h2
                    className="text-xl font-semibold mb-4"
                    style={{ color: "var(--foreground)" }}
                  >
                    Entry Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Kind
                      </label>
                      <div className="font-mono text-sm rounded-lg">
                        {entry.kind}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Tree ID
                        </label>
                        <div className="font-mono text-sm rounded-lg">
                          {entry.tree_id}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Log Index
                        </label>
                        <div className="font-mono text-sm rounded-lg">
                          {entry.log_index}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Integrated Time (UTC)
                      </label>
                      <div className="font-mono text-sm rounded-lg">
                        {formatDate(entry.integrated_time)}
                      </div>
                    </div>

                    {entry.data_hash_value && (
                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Data Hash
                        </label>
                        <div className="font-mono text-sm rounded-lg break-all">
                          {entry.data_hash_algorithm}:{entry.data_hash_value}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Signature Details */}
              <div className="space-y-8">
                {isPgpEntry && (
                  <div>
                    <h2
                      className="text-xl font-semibold mb-4"
                      style={{ color: "var(--foreground)" }}
                    >
                      PGP Signature
                    </h2>
                    <div className="space-y-4">
                      {entry.pgp_signer_name && (
                        <div>
                          <label className="text-sm font-medium block mb-2">
                            Signer Name
                          </label>
                          <div className="font-mono text-sm rounded-lg">
                            {entry.pgp_signer_name}
                          </div>
                        </div>
                      )}

                      {entry.pgp_signer_email && (
                        <div>
                          <label className="text-sm font-medium block mb-2">
                            Signer Email
                          </label>
                          <div className="font-mono text-sm rounded-lg">
                            {entry.pgp_signer_email}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Key ID
                        </label>
                        <div className="font-mono text-sm rounded-lg">
                          {entry.pgp_key_id}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Public Key Fingerprint
                        </label>
                        <div className="font-mono text-xs rounded-lg break-all">
                          {entry.pgp_public_key_fingerprint}
                        </div>
                      </div>

                      {entry.pgp_key_algorithm && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium block mb-2">
                              Algorithm
                            </label>
                            <div className="font-mono text-sm rounded-lg">
                              {entry.pgp_key_algorithm}
                            </div>
                          </div>
                          {entry.pgp_key_size && (
                            <div>
                              <label className="text-sm font-medium block mb-2">
                                Key Size (bits)
                              </label>
                              <div className="font-mono text-sm rounded-lg">
                                {entry.pgp_key_size}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isX509Entry && (
                  <div>
                    <h2
                      className="text-xl font-semibold mb-4"
                      style={{ color: "var(--foreground)" }}
                    >
                      X.509 Certificate
                    </h2>
                    <div className="space-y-4">
                      {entry.x509_subject_cn && (
                        <div>
                          <label className="text-sm font-medium block mb-2">
                            Subject Common Name
                          </label>
                          <div className="font-mono text-sm rounded-lg">
                            {entry.x509_subject_cn}
                          </div>
                        </div>
                      )}

                      {entry.x509_issuer_cn && (
                        <div>
                          <label className="text-sm font-medium block mb-2">
                            Issuer Common Name
                          </label>
                          <div className="font-mono text-sm rounded-lg">
                            {entry.x509_issuer_cn}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Serial Number
                        </label>
                        <div className="font-mono text-sm rounded-lg break-all">
                          {entry.x509_serial_number}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium block mb-2">
                          Certificate SHA-256
                        </label>
                        <div className="font-mono text-sm rounded-lg break-all">
                          {entry.x509_certificate_sha256}
                        </div>
                      </div>

                      {entry.x509_not_before && entry.x509_not_after && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium block mb-2">
                              Valid From (UTC)
                            </label>
                            <div className="text-sm rounded-lg font-mono">
                              {formatDate(entry.x509_not_before)}
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium block mb-2">
                              Valid Until (UTC)
                            </label>
                            <div className="text-sm rounded-lg font-mono">
                              {formatDate(entry.x509_not_after)}
                            </div>
                          </div>
                        </div>
                      )}

                      {entry.x509_signature_algorithm && (
                        <div>
                          <label className="text-sm font-medium block mb-2">
                            Signature Algorithm
                          </label>
                          <div className="font-mono text-sm rounded-lg">
                            {entry.x509_signature_algorithm}
                          </div>
                        </div>
                      )}

                      {entry.x509_public_key_algorithm && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium block mb-2">
                              Public Key Algorithm
                            </label>
                            <div className="font-mono text-sm rounded-lg">
                              {entry.x509_public_key_algorithm}
                            </div>
                          </div>
                          {entry.x509_public_key_size && (
                            <div>
                              <label className="text-sm font-medium block mb-2">
                                Key Size (bits)
                              </label>
                              <div className="font-mono text-sm rounded-lg">
                                {entry.x509_public_key_size}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Subject Alternative Names */}
            {isX509Entry && entry.x509_sans && entry.x509_sans.length > 0 && (
              <div>
                <div className="space-y-3">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: "var(--foreground)" }}
                  >
                    Subject Alternative Names ({entry.x509_sans.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="text-xs leading-tight font-mono">
                      <tbody>
                        {entry.x509_sans.map((san, index) => (
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
