export interface SigstoreEntry {
  tree_id: string;
  log_index: number;
  entry_uuid: string;
  retrieval_timestamp: string;
  integrated_time: string;
  log_id: string;
  kind: string;
  api_version: string;
  signature_format: string;
  data_hash_algorithm: string;
  data_hash_value: string;
  data_url: string;
  signature_url: string;
  public_key_url: string;
  repository_name?: string;

  // X509 Certificate Fields
  x509_certificate_sha256: string;
  x509_subject_dn: string;
  x509_subject_cn: string;
  x509_subject_organization: string[];
  x509_subject_ou: string[];
  x509_issuer_dn: string;
  x509_issuer_cn: string;
  x509_issuer_organization: string[];
  x509_issuer_ou: string[];
  x509_serial_number: string;
  x509_not_before: string;
  x509_not_after: string;
  x509_sans: string[];
  x509_signature_algorithm: string;
  x509_public_key_algorithm: string;
  x509_public_key_size: number;
  x509_is_ca: number;
  x509_key_usage: string[];
  x509_extended_key_usage: string[];

  // PGP Fields
  pgp_signature_hash: string;
  pgp_public_key_fingerprint: string;
  pgp_key_id: string;
  pgp_signer_user_id: string;
  pgp_signer_email: string;
  pgp_signer_name: string;
  pgp_key_algorithm: string;
  pgp_key_size: number;
  pgp_subkey_fingerprints: string[];
}

export interface SigstoreSearchQuery {
  query: string;
  queryType:
    | "hash"
    | "x509_san"
    | "pgp_fingerprint"
    | "pgp_email"
    | "entry_uuid"
    | "github_repository"
    | "github_organization";
  limit?: number;
}
