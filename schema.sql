CREATE TABLE ct_log_entries
(
    -- Log Identification & Ingestion Metadata
    log_id LowCardinality(String) COMMENT 'Identifier for the source CT log (e.g., log URL or a unique name)',
    log_index UInt64 COMMENT 'Index of the entry within the specific CT log',
    retrieval_timestamp DateTime DEFAULT now() COMMENT 'Timestamp when the entry was fetched and ingested into ClickHouse',

    -- Raw CT Log Data (as returned by the get-entries endpoint)
    leaf_input String COMMENT 'Base64 encoded MerkleTreeLeaf structure from the log entry',
    extra_data String COMMENT 'Base64 encoded extra data from the log entry (e.g., certificate chain)',

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
    name_suffixes Array(String) MATERIALIZED arrayDistinct(
        arrayFlatten(
            arrayMap(x -> arrayMap(
                i -> substring(x, i), arrayFilter(i -> i > 0, arrayMap(pos -> position(x, '.', pos), range(1, length(x) + 1)))
            ),
            arrayConcat(subject_alternative_names, [subject_common_name])
        ))
    ) COMMENT 'All domain suffixes from subject_alternative_names and subject_common_name (e.g., .example.com, .com)',
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

    -- Stored Raw Certificate (optional, for full reprocessing capability)
    raw_leaf_certificate_der String COMMENT 'Base64 encoded DER of the leaf certificate itself (extracted from leaf_input)',

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
    INDEX idx_cert_sha256 certificate_sha256 TYPE bloom_filter GRANULARITY 1,
    INDEX idx_tbs_sha256 tbs_certificate_sha256 TYPE bloom_filter GRANULARITY 1,
    INDEX idx_subject_cn subject_common_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_issuer_cn issuer_common_name TYPE bloom_filter GRANULARITY 1,
    INDEX idx_sans subject_alternative_names TYPE bloom_filter GRANULARITY 4, -- For has(subject_alternative_names, 'value')
    INDEX idx_serial serial_number TYPE bloom_filter GRANULARITY 1,
    INDEX idx_not_after not_after TYPE minmax,
    INDEX idx_entry_timestamp entry_timestamp TYPE minmax,
    INDEX idx_name_suffixes name_suffixes TYPE bloom_filter GRANULARITY 4 -- For has(name_suffixes, 'value')
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(not_after) -- Partition by month of certificate expiry
ORDER BY (log_id, log_index) -- Primary sorting order
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE TABLE ct_log_entries_by_name
(
    name_rev String,
    log_id LowCardinality(String),
    log_index UInt64
)
ENGINE = ReplacingMergeTree()
ORDER BY (name_rev, log_id, log_index)
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;

CREATE MATERIALIZED VIEW ct_log_entries_by_name_mv TO ct_log_entries_by_name AS
SELECT 
    reverse(name) AS name_rev,
    log_id,
    log_index
FROM ct_log_entries
ARRAY JOIN arrayDistinct(
    arrayConcat(
        subject_alternative_names,
        [subject_common_name]
    )
) AS name
WHERE name != '';
