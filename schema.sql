CREATE TABLE ct_log_entries
(
    -- Log Identification & Ingestion Metadata
    log_id LowCardinality(String) COMMENT 'Identifier for the source CT log (e.g., log URL or a unique name)',
    log_index UInt64 COMMENT 'Index of the entry within the specific CT log',
    retrieval_timestamp DateTime DEFAULT now() COMMENT 'Timestamp when the entry was fetched and ingested into ClickHouse',

    -- Raw CT Log Data (as returned by the get-entries endpoint)
    leaf_input String COMMENT 'Base64 encoded MerkleTreeLeaf structure from the log entry' CODEC(ZSTD(1)),

    -- Parsed from MerkleTreeLeaf -> TimestampedEntry
    entry_timestamp DateTime COMMENT 'Timestamp from the TimestampedEntry (milliseconds since epoch, converted to DateTime)',
    entry_type Enum8('x509_entry' = 0, 'precert_entry' = 1) COMMENT 'Type of log entry (X.509 certificate or Precertificate)',

    -- Core Certificate Identifiers (parsed from leaf_input)
    certificate_sha256 FixedString(64) COMMENT 'SHA-256 hash of the DER-encoded leaf certificate (hex string)',
    tbs_certificate_sha256 FixedString(64) COMMENT 'SHA-256 hash of the DER-encoded TBSCertificate structure (hex string)', -- Useful for linking precerts to final certs

    -- Parsed Certificate Validity
    not_before DateTime COMMENT 'Certificate validity period start',
    not_after DateTime COMMENT 'Certificate validity period end',

    -- Parsed Subject Information
    subject_dn String COMMENT 'Full Subject Distinguished Name',
    subject_common_name String COMMENT 'Subject Common Name (CN)',
    subject_organization Array(String) COMMENT 'Subject Organization (O)',
    subject_organizational_unit Array(String) COMMENT 'Subject Organizational Unit (OU)',
    subject_country Array(String) COMMENT 'Subject Country (C)',
    subject_locality Array(String) COMMENT 'Subject Locality (L)',
    subject_province Array(String) COMMENT 'Subject State/Province (ST)',
    subject_serial_number String COMMENT 'Serial number from Subject DN (distinct from certificate serial)',

    -- Parsed Issuer Information
    issuer_dn String COMMENT 'Full Issuer Distinguished Name',
    issuer_common_name String COMMENT 'Issuer Common Name (CN)',
    issuer_organization Array(String) COMMENT 'Issuer Organization (O)',
    issuer_organizational_unit Array(String) COMMENT 'Issuer Organizational Unit (OU)',
    issuer_country Array(String) COMMENT 'Issuer Country (C)',
    issuer_locality Array(String) COMMENT 'Issuer Locality (L)',
    issuer_province Array(String) COMMENT 'Issuer State/Province (ST)',

    -- Other Key Parsed Certificate Fields
    serial_number String COMMENT 'Certificate serial number (hex string)',
    subject_alternative_names Array(String) COMMENT 'Array of Subject Alternative Names (DNS, IP, etc.)',
    signature_algorithm LowCardinality(String) COMMENT 'Signature algorithm of the certificate',
    subject_public_key_algorithm LowCardinality(String) COMMENT 'Algorithm of the subject public key',
    subject_public_key_length UInt16 COMMENT 'Length of the subject public key (e.g., 2048, 256)',

    is_ca UInt8 COMMENT 'Boolean (0 or 1) indicating if the certificate is a CA',
    basic_constraints_path_len Nullable(UInt8) COMMENT 'Path length constraint for CA certificates',

    key_usage Array(LowCardinality(String)) COMMENT 'Parsed key usage extensions (e.g., digitalSignature, keyCertSign)',
    extended_key_usage Array(LowCardinality(String)) COMMENT 'Parsed extended key usage OIDs or friendly names (e.g., serverAuth, clientAuth)',

    subject_key_identifier String COMMENT 'Subject Key Identifier (SKI) as hex string',
    authority_key_identifier String COMMENT 'Authority Key Identifier (AKI) as hex string',

    crl_distribution_points Array(String) COMMENT 'CRL Distribution Points URLs',
    ocsp_responders Array(String) COMMENT 'Authority Information Access (AIA) OCSP responder URLs',

    -- Precertificate Specific Fields (parsed from leaf_input or extra_data)
    precert_issuer_key_hash Nullable(FixedString(64)) COMMENT 'SHA-256 hash (hex) of the issuer public key (for Precertificate entries)',
    precert_poison_extension_present UInt8 DEFAULT 0 COMMENT 'Boolean (0 or 1) indicating if the X.509v3 Precertificate Poison extension is present',

    -- PROJECTION for SAN lookups (optional, for performance)
    -- PROJECTION san_projection (
    -- SELECT
    --     log_id,
    --     not_after,
    --     certificate_sha256,
    --     arrayJoin(subject_alternative_names) AS san,
    --     subject_common_name
    -- ORDER BY san, not_after
    -- )

    -- Indexes for common query patterns
    INDEX idx_subject_cn subject_common_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_issuer_cn issuer_common_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_sans subject_alternative_names TYPE bloom_filter GRANULARITY 4, -- For has(subject_alternative_names, 'value')
    INDEX idx_serial serial_number TYPE bloom_filter GRANULARITY 1,
    INDEX idx_not_after not_after TYPE minmax,
    INDEX idx_entry_timestamp entry_timestamp TYPE minmax
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(not_after) -- Partition by month of certificate expiry
ORDER BY (log_id, log_index) -- Primary sorting order
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE TABLE ct_log_entries_by_name
(
    name_rev String CODEC(ZSTD(1)),
    certificate_sha256 FixedString(64),
    log_id LowCardinality(String),
    log_index UInt64 CODEC(ZSTD(1)),
    subject_common_name String CODEC(ZSTD(1)),
    issuer_common_name String CODEC(ZSTD(1)),
    issuer_organization Array(String) CODEC(ZSTD(1)),
    entry_timestamp DateTime CODEC(ZSTD(1)),
    not_after DateTime CODEC(ZSTD(1))
)
ENGINE = ReplacingMergeTree()
ORDER BY (name_rev, certificate_sha256, log_id, log_index)
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE MATERIALIZED VIEW ct_log_entries_by_name_mv TO ct_log_entries_by_name AS
SELECT 
    reverse(name) AS name_rev,
    certificate_sha256,
    log_id,
    log_index,
    subject_common_name,
    issuer_common_name,
    issuer_organization,
    entry_timestamp,
    not_after
FROM ct_log_entries
ARRAY JOIN arrayDistinct(
    arrayConcat(
        subject_alternative_names,
        [subject_common_name]
    )
) AS name
WHERE name != '' and entry_type = 'x509_entry';

create table ct_log_entries_by_sha256
(
    certificate_sha256 FixedString(64),
    log_id LowCardinality(String),
    log_index UInt64
)
ENGINE = ReplacingMergeTree()
ORDER BY (certificate_sha256, log_id, log_index)
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE MATERIALIZED VIEW ct_log_entries_by_sha256_mv TO ct_log_entries_by_sha256 AS
SELECT 
    certificate_sha256,
    log_id,
    log_index
FROM ct_log_entries
WHERE certificate_sha256 != '';

-- Sigstore Rekor Log Entries Table
CREATE TABLE rekor_log_entries
(
    -- Log Identification & Ingestion Metadata
    tree_id LowCardinality(String) COMMENT 'Rekor tree ID (e.g., 1193050959916656506)',
    log_index UInt64 COMMENT 'Index of the entry within the Rekor log',
    entry_uuid String COMMENT 'Deterministic UUID of the log entry (64 hex chars)',
    retrieval_timestamp DateTime DEFAULT now() COMMENT 'Timestamp when the entry was fetched and ingested',
    
    -- Raw Rekor Entry Data
    body String COMMENT 'Base64 encoded entry body from Rekor API' CODEC(ZSTD(1)),
    integrated_time DateTime COMMENT 'Timestamp when entry was integrated into the log',
    log_id String COMMENT 'SHA256 hash of DER-encoded public key for the log',
    
    -- Parsed Entry Content (from decoded body)
    kind LowCardinality(String) COMMENT 'Entry type: rekord, hashedrekord',
    api_version String COMMENT 'API version of the entry format',
    
    -- Common Signature Information (present in most entry types)
    signature_format LowCardinality(String) COMMENT 'Signature format: x509, pgp, minisign, ssh, etc.',
    
    -- Data Hash Information (common across entry types)
    data_hash_algorithm LowCardinality(String) COMMENT 'Hash algorithm used: sha256, sha512, etc.',
    data_hash_value String COMMENT 'Hash value of the signed data (hex string)',
    
    -- URL References (when artifacts are referenced by URL)
    data_url String COMMENT 'URL of the signed artifact/data',
    signature_url String COMMENT 'URL of the detached signature',
    public_key_url String COMMENT 'URL of the public key',
    
    -- Verification Information
    signed_entry_timestamp String COMMENT 'Base64 encoded signed entry timestamp' CODEC(ZSTD(1)),
    
    -- Entry Type Specific Fields (nullable for non-applicable types)
    
    -- X509 Certificate Fields (for hashedrekord entries with x509 certificates)
    x509_certificate_sha256 String COMMENT 'SHA256 hash of the certificate (hex)',
    x509_subject_dn String COMMENT 'Subject Distinguished Name',
    x509_subject_cn String COMMENT 'Subject Common Name',
    x509_subject_organization Array(String) COMMENT 'Subject Organization',
    x509_subject_ou Array(String) COMMENT 'Subject Organizational Unit',
    x509_issuer_dn String COMMENT 'Issuer Distinguished Name',
    x509_issuer_cn String COMMENT 'Issuer Common Name',
    x509_issuer_organization Array(String) COMMENT 'Issuer Organization',
    x509_issuer_ou Array(String) COMMENT 'Issuer Organizational Unit',
    x509_serial_number String COMMENT 'Certificate serial number',
    x509_not_before DateTime COMMENT 'Certificate validity start',
    x509_not_after DateTime COMMENT 'Certificate validity end',
    x509_sans Array(String) COMMENT 'Subject Alternative Names',
    x509_signature_algorithm LowCardinality(String) COMMENT 'Signature algorithm',
    x509_public_key_algorithm LowCardinality(String) COMMENT 'Public key algorithm',
    x509_public_key_size UInt16 COMMENT 'Public key size in bits',
    x509_is_ca UInt8 COMMENT 'Is Certificate Authority (0/1)',
    x509_key_usage Array(LowCardinality(String)) COMMENT 'Key usage extensions',
    x509_extended_key_usage Array(LowCardinality(String)) COMMENT 'Extended key usage',
    x509_extensions String COMMENT 'All X509v3 extensions as JSON' CODEC(ZSTD(1)),

    -- PGP Message Fields (for rekord entries with PGP signatures)
    pgp_signature_hash String COMMENT 'SHA256 hash of the PGP signature block (hex)',
    pgp_public_key_fingerprint String COMMENT 'PGP public key fingerprint (hex)',
    pgp_key_id String COMMENT 'PGP key ID (last 8 or 16 hex digits of fingerprint)',
    pgp_signer_user_id String COMMENT 'Primary user ID of the signer',
    pgp_signer_email String COMMENT 'Email address extracted from user ID',
    pgp_signer_name String COMMENT 'Name extracted from user ID',
    pgp_key_algorithm LowCardinality(String) COMMENT 'PGP key algorithm (RSA, ECDSA, EdDSA, etc.)',
    pgp_key_size UInt16 COMMENT 'PGP key size in bits',
    pgp_subkey_fingerprints Array(String) COMMENT 'Fingerprints of subkeys',
    
    -- Indexes for common query patterns
    INDEX idx_entry_uuid entry_uuid TYPE bloom_filter GRANULARITY 1,
    INDEX idx_data_hash data_hash_value TYPE bloom_filter GRANULARITY 1,
    INDEX idx_kind kind TYPE set(16) GRANULARITY 1,
    INDEX idx_integrated_time integrated_time TYPE minmax,
    INDEX idx_x509_cert_sha256 x509_certificate_sha256 TYPE bloom_filter GRANULARITY 1,
    INDEX idx_x509_subject_cn x509_subject_cn TYPE bloom_filter GRANULARITY 1,
    INDEX idx_x509_issuer_cn x509_issuer_cn TYPE bloom_filter GRANULARITY 1,
    INDEX idx_x509_sans x509_sans TYPE bloom_filter GRANULARITY 4,
    INDEX idx_x509_serial x509_serial_number TYPE bloom_filter GRANULARITY 1,
    INDEX idx_x509_not_after x509_not_after TYPE minmax,
    INDEX idx_pgp_key_fingerprint pgp_public_key_fingerprint TYPE bloom_filter GRANULARITY 1,
    INDEX idx_pgp_key_id pgp_key_id TYPE bloom_filter GRANULARITY 1,
    INDEX idx_pgp_signer_email pgp_signer_email TYPE bloom_filter GRANULARITY 1,
    INDEX idx_pgp_signature_hash pgp_signature_hash TYPE bloom_filter GRANULARITY 1
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(integrated_time) -- Partition by month of integration
ORDER BY (tree_id, log_index) -- Primary sorting order
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE MATERIALIZED VIEW ct_log_stats_by_log_id
REFRESH EVERY 5 MINUTE
ENGINE = Memory
AS SELECT log_id, max(entry_timestamp) as max_timestamp, count() as total
FROM ct_log_entries
GROUP BY log_id ORDER BY log_id LIMIT 1000;

CREATE MATERIALIZED VIEW rekor_log_stats_by_issuer
REFRESH EVERY 5 MINUTE
ENGINE = Memory
AS SELECT
    x509_issuer_cn,
    count() as total_entries,
    max(integrated_time) as last_seen
FROM rekor_log_entries
WHERE kind = 'hashedrekord' AND x509_issuer_cn != '' AND toYYYYMM(integrated_time) IN [
    toYYYYMM(now()), 
    toYYYYMM(now() - INTERVAL 1 MONTH),
    toYYYYMM(now() - INTERVAL 2 MONTH),
    toYYYYMM(now() - INTERVAL 3 MONTH)
] AND integrated_time >= now() - INTERVAL 3 MONTH
GROUP BY x509_issuer_cn ORDER BY x509_issuer_cn LIMIT 1000;
