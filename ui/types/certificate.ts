export interface Certificate {
  log_id: string;
  log_index: number;
  retrieval_timestamp: string;
  entry_timestamp: string;
  entry_type: "x509_entry" | "precert_entry";
  certificate_sha256: string;
  tbs_certificate_sha256: string;
  not_before: string;
  not_after: string;
  subject_dn: string;
  subject_common_name: string;
  subject_organization: string[];
  subject_organizational_unit: string[];
  subject_country: string[];
  subject_locality: string[];
  subject_province: string[];
  subject_serial_number: string;
  issuer_dn: string;
  issuer_common_name: string;
  issuer_organization: string[];
  issuer_organizational_unit: string[];
  issuer_country: string[];
  issuer_locality: string[];
  issuer_province: string[];
  serial_number: string;
  subject_alternative_names: string[];
  signature_algorithm: string;
  subject_public_key_algorithm: string;
  subject_public_key_length: number;
  is_ca: number;
  basic_constraints_path_len: number | null;
  key_usage: string[];
  extended_key_usage: string[];
  subject_key_identifier: string;
  authority_key_identifier: string;
  crl_distribution_points: string[];
  ocsp_responders: string[];
  precert_issuer_key_hash: string | null;
  precert_poison_extension_present: number;
  raw_leaf_certificate_der: string;
  ct_log_count?: number;
  ct_logs?: Array<{
    log_id: string;
    log_index: number;
    entry_timestamp: string;
    entry_type: string;
  }>;
}

export interface SearchQuery {
  query: string;
  queryType: "domain" | "commonName" | "serialNumber" | "sha256" | "issuer";
  limit?: number;
}
