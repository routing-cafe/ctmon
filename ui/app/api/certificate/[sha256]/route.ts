import { NextRequest, NextResponse } from "next/server";
import client from "@/lib/clickhouse";
import { Certificate } from "@/types/certificate";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sha256: string }> },
) {
  const { sha256 } = await params;

  if (!sha256 || sha256.length !== 64) {
    return NextResponse.json({ error: "Valid SHA-256 hash is required" }, {
      status: 400,
    });
  }

  try {
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
        raw_leaf_certificate_der
      FROM ct_log_entries 
      WHERE certificate_sha256 = {sha256:String}
      AND entry_type = 'x509_entry'
      ORDER BY not_after DESC
      SETTINGS max_execution_time = 30, max_threads = 1, max_memory_usage = 134217728
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
      return NextResponse.json({ error: "Certificate not found" }, {
        status: 404,
      });
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

    const response = {
      ...mainCert,
      ct_logs,
      ct_log_count: data.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Certificate lookup error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
