# Rekor OpenAPI Specification Analysis

## Overview

Rekor is a cryptographically secure, immutable transparency log for signed software releases. The API provides endpoints for managing and querying log entries, proofs, and metadata.

**Base URL:** `rekor.sigstore.dev`  
**API Version:** 1.0.0  
**Swagger Version:** 2.0  

## Core Endpoints

### Log Information
- **GET `/api/v1/log`** - Get current state of the transparency log (root hash, tree size, merkle tree info)
- **GET `/api/v1/log/publicKey`** - Retrieve public key for validating signed tree heads
- **GET `/api/v1/log/proof`** - Get consistency proof between two tree sizes

### Log Entries
- **POST `/api/v1/log/entries`** - Create new entry in transparency log
- **GET `/api/v1/log/entries`** - Retrieve entry by log index
- **GET `/api/v1/log/entries/{entryUUID}`** - Get entry and inclusion proof by UUID
- **POST `/api/v1/log/entries/retrieve`** - Search for multiple log entries

### Index Search (Deprecated)
- **POST `/api/v1/index/retrieve`** - Search index by entry metadata (experimental, deprecated)

## Supported Entry Types

The API supports multiple types of entries through a discriminated union pattern:

1. **rekord** - Basic record entries
2. **hashedrekord** - Hashed record entries
3. **rpm** - RPM packages
4. **tuf** - TUF (The Update Framework) metadata
5. **alpine** - Alpine packages
6. **helm** - Helm charts
7. **intoto** - in-toto attestations
8. **cose** - COSE (CBOR Object Signing and Encryption) objects
9. **jar** - Java Archive files
10. **rfc3161** - RFC3161 timestamps
11. **dsse** - Dead Simple Signing Envelope

Each entry type follows a versioned schema pattern with `apiVersion` and `spec` fields.

## Key Data Structures

### LogEntry
Core structure containing:
- `logID` - SHA256 hash of DER-encoded public key
- `logIndex` - Entry position in log (0-based)
- `body` - Entry content
- `integratedTime` - Unix timestamp when added
- `attestation` - Binary attestation data
- `verification` - Inclusion proof and signed entry timestamp

### InclusionProof
Cryptographic proof that an entry exists in the log:
- `logIndex` - Entry position
- `rootHash` - Merkle tree root hash
- `treeSize` - Tree size when proof generated
- `hashes` - Hash chain from leaf to root
- `checkpoint` - Signed tree head

### ConsistencyProof
Proof that the log has not been tampered with between two states:
- `rootHash` - Root hash at proof generation time
- `hashes` - Required hashes to verify consistency

### SearchLogQuery
Query structure supporting search by:
- `entryUUIDs` - Specific entry identifiers (max 10)
- `logIndexes` - Specific log positions (max 10)
- `entries` - Proposed entries to match (max 10)

## Authentication & Security

- Uses cryptographic proofs for verification
- Entries are immutable once added
- Signed tree heads provide tamper evidence
- Public keys available for verification
- UUID patterns enforce proper formatting (`^([0-9a-fA-F]{64}|[0-9a-fA-F]{80})$`)

## Response Codes

- **200** - Success
- **201** - Entry created (for POST operations)
- **400** - Bad content/invalid request
- **404** - Entry not found
- **409** - Conflict with current log state
- **422** - Unprocessable entity
- **500** - Internal server error

## Key Features

1. **Immutable Log** - Entries cannot be modified after creation
2. **Cryptographic Verification** - All entries include cryptographic proofs
3. **Multiple Entry Types** - Support for various software artifact types
4. **Merkle Tree Structure** - Enables efficient proof generation
5. **Time Stamping** - Integrated timestamps for all entries
6. **Search Capabilities** - Query by UUID, index, or entry content
7. **Consistency Proofs** - Verify log integrity over time

## Practical API Testing Results

### Current Log State
- **Active Tree ID:** `1193050959916656506`
- **Tree Size:** ~110M entries
- **Inactive Shards:** 2 previous tree instances with 4.1M and 117M entries
- **Public Key:** ECDSA P-256 key returned in PEM format

### Entry Structure Examples
Real entry from log index 1000:
```json
{
  "logID": "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d",
  "logIndex": 1000,
  "integratedTime": 1615022236,
  "body": "base64-encoded entry content",
  "verification": {
    "inclusionProof": {
      "logIndex": 1000,
      "rootHash": "4d006aa46efcb607dd51d900b1213754c50cc9251c3405c6c2561d9d6a2f3239",
      "treeSize": 4163431,
      "hashes": ["22 merkle proof hashes..."],
      "checkpoint": "signed checkpoint data"
    },
    "signedEntryTimestamp": "base64-encoded signature"
  }
}
```

### Decoded Entry Content
Entry bodies contain structured data like:
```json
{
  "apiVersion": "0.0.1",
  "kind": "rekord",
  "spec": {
    "data": {
      "hash": {
        "algorithm": "sha256",
        "value": "67e071ad4a89f390798c8f825ed8990a168da70f09da80ddfee0bae2115891ea"
      }
    },
    "signature": {
      "content": "base64-encoded signature",
      "format": "x509",
      "publicKey": {
        "content": "base64-encoded public key"
      }
    }
  }
}
```

### API Behavior Observations
1. **Multi-shard Architecture:** Active log with inactive historical shards
2. **Consistent UUIDs:** Entry UUIDs are deterministic 64/80 hex character strings
3. **Rich Inclusion Proofs:** Each entry includes complete merkle proof with 20+ hashes
4. **Search Flexibility:** Can query by UUID, index, or combinations (max 10 items)
5. **Timestamp Integration:** Unix timestamps show when entries were added to log
6. **Checkpoint Format:** Uses signed checkpoint format for tree state verification
7. **Consistency Proofs:** Work between any two tree sizes to verify log integrity

### Real-world Performance
- Log queries respond in ~100-500ms
- Large log (110M+ entries) handles queries efficiently
- Merkle proofs contain ~20-25 hashes for efficient verification
- Public key retrieval works with or without specific tree ID

## Retrieving Entry Ranges

The Rekor API doesn't provide a native range endpoint, but offers several approaches for pulling multiple log entries:

### Method 1: Batch Retrieval (Recommended)
Use `POST /api/v1/log/entries/retrieve` with `logIndexes` array:

```bash
# Get entries 1000-1009 (maximum 10 per request)
curl -X POST "https://rekor.sigstore.dev/api/v1/log/entries/retrieve" \
  -H "Content-Type: application/json" \
  -d '{"logIndexes": [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009]}'
```

**Limitations:**
- Hard limit of 10 entries per request (returns error 611 if exceeded)
- Must specify each index explicitly in array format
- Indexes don't need to be sequential or sorted

### Method 2: Individual Sequential Requests
Use `GET /api/v1/log/entries?logIndex=N` in sequence:

```bash
# Get entries 1000-1009 individually
for i in {1000..1009}; do
  curl -s "https://rekor.sigstore.dev/api/v1/log/entries?logIndex=$i"
done
```

**Trade-offs:**
- More HTTP overhead but simpler implementation
- Useful when you need to process entries incrementally
- No batch size restrictions

### Method 3: Large Range Script
For ranges larger than 10 entries, batch the requests:

```bash
#!/bin/bash
get_log_range() {
    local start=$1
    local end=$2
    local batch_size=10
    
    for ((i=start; i<=end; i+=batch_size)); do
        # Build indexes array for this batch
        local indexes=""
        for ((j=i; j<i+batch_size && j<=end; j++)); do
            indexes="$indexes$j"
            if [ $j -lt $((i+batch_size-1)) ] && [ $j -lt $end ]; then
                indexes="$indexes,"
            fi
        done
        
        # Request this batch
        curl -s -X POST "https://rekor.sigstore.dev/api/v1/log/entries/retrieve" \
          -H "Content-Type: application/json" \
          -d "{\"logIndexes\": [$indexes]}" | jq .
        
        # Add delay to be respectful to the API
        sleep 0.1
    done
}

# Usage examples:
# get_log_range 1000 1050    # Get 51 entries in 6 batches
# get_log_range 5000 5099    # Get 100 entries in 10 batches
```

### Performance Considerations
- **Batch requests** are more efficient than individual calls
- Each batch request can contain up to 10 entries
- Consider adding delays between requests for large ranges
- Batch responses maintain the same structure as individual entry responses

### Example Response Structure
Both individual and batch methods return the same entry format:
```json
[
  {
    "entry_uuid": {
      "logID": "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d",
      "logIndex": 1000,
      "body": "base64_encoded_content",
      "integratedTime": 1615022236,
      "verification": { ... }
    }
  }
]
```

### Best Practices
1. Use batch requests for better performance
2. Implement proper error handling for missing entries
3. Add rate limiting delays for large ranges
4. Cache results locally to avoid repeated API calls
5. Consider the current log size (~110M entries) when setting ranges

## HashedRekord Entry Structure

### Overview
HashedRekord is one of the most commonly used entry types in Rekor, designed for signing arbitrary data using its hash rather than the full content. This is useful for large files or when the original data should not be stored in the transparency log.

### Example Entry Analysis (Log Index 110163239)
**Entry UUID:** `24296fb24b8ad77aa4cdc5b78c30f3d348400d5c7fac5a5c2aa962a97e34d32810ef69c74c804e74`
**Integrated Time:** 1720539818 (July 9, 2024 15:43:38 UTC)

### Top-Level Structure
```json
{
  "logID": "c0d23d6ad406973f9559f3ba2d1ca01f84147d8ffc5b8445c224f98b9591801d",
  "logIndex": 110163239,
  "integratedTime": 1720539818,
  "body": "base64-encoded-content",
  "verification": {
    "inclusionProof": { ... },
    "signedEntryTimestamp": "base64-signature"
  }
}
```

### Decoded Body Structure
When base64-decoded, the body contains:
```json
{
  "apiVersion": "0.0.1",
  "kind": "hashedrekord",
  "spec": {
    "data": {
      "hash": {
        "algorithm": "sha256",
        "value": "a67209363ef773e733250256dd28060284c4d25c26b3dceb676b9001033cc36f"
      }
    },
    "signature": {
      "content": "MEUCIQCe/b5IHd2tlCpwz9hk1eas7bF2PCCIqVp16Wehc6OItgIgGWBJE8Oq5zZpkt4uzJEoKKe4SBCzgLT1XfDuuNRqedY=",
      "publicKey": {
        "content": "base64-encoded-x509-certificate"
      }
    }
  }
}
```

### Key Components

#### Data Section
- **hash.algorithm**: Cryptographic hash function used (typically "sha256")
- **hash.value**: Hex-encoded hash of the original artifact/data
- No actual artifact content is stored, only its hash

#### Signature Section
- **content**: Base64-encoded cryptographic signature over the hash
- **publicKey.content**: Base64-encoded X.509 certificate containing the public key

#### X.509 Certificate Analysis
The public key certificate in this example contains:
- **Subject**: Empty (ephemeral key from GitHub Actions)
- **Issuer**: sigstore-intermediate
- **Key Type**: ECDSA P-256
- **Extensions**: Rich metadata including:
  - GitHub repository: `chainguard-images/images-private`
  - Workflow: `.github/workflows/push-ghcr.yaml@refs/heads/main`
  - Run ID: `9860039198`
  - Job workflow ref and SHA
  - OIDC token claims for provenance

## PGP Messages in Rekord Entries

### Overview
PGP signatures and public keys are commonly stored in `rekord` type entries. These entries contain detached PGP signatures that sign arbitrary data referenced by its hash, rather than embedding the actual data content.

### Example: Log Index 110059000
**Entry UUID:** `24296fb24b8ad77a85d0f9554dc1f86040975d43fb2b3d308a869fd43d43ac88c21f46de11e2200f`
**Integrated Time:** 1720519607 (July 9, 2024 10:06:47 UTC)

### Structure Analysis
```json
{
  "apiVersion": "0.0.1",
  "kind": "rekord",
  "spec": {
    "data": {
      "hash": {
        "algorithm": "sha256",
        "value": "aa24ce1aa06b2e9cefbca3d5a5da69c84602835777f1af6d3f995620907cb2ad"
      }
    },
    "signature": {
      "content": "base64-encoded-pgp-signature",
      "format": "pgp",
      "publicKey": {
        "content": "base64-encoded-pgp-public-key"
      }
    }
  }
}
```

### Key Components

#### Data Section
- **hash.algorithm**: Always "sha256" for PGP rekord entries
- **hash.value**: SHA256 hash of the original signed data (not stored in log)
- The actual data content is not included, only its cryptographic hash

#### Signature Section
- **content**: Base64-encoded PGP detached signature block
- **format**: Set to "pgp" to indicate PGP signature format
- **publicKey.content**: Base64-encoded PGP public key block

### Decoding Process
1. **Extract entry body**: `jq '.[].body' entry.json -r | base64 -d`
2. **Extract PGP signature**: `jq '.spec.signature.content' -r | base64 -d`
3. **Extract PGP public key**: `jq '.spec.signature.publicKey.content' -r | base64 -d`
4. **Get signed data hash**: `jq '.spec.data.hash.value' -r`

### Example Decoded Content
**PGP Signature:**
```
-----BEGIN PGP SIGNATURE-----
iQEzBAEBCgAdFiEEcuPLdzMV36LkZHQ9lFMhJFQZIvsFAmaM+yQACgkQlFMhJFQZ
Ivv7Ygf/fM4cJzwinMJPXLelNFLwmQtQvpbTpayZ0wWNhrcLH1Gyjvi0o90WMx+5
[...]
=itCJ
-----END PGP SIGNATURE-----
```

**Public Key Information:**
- **Signer**: Devuan Repository (Primary Devuan signing key)
- **Email**: repository@devuan.org
- **Fingerprint**: 72E3 CB77 3315 DFA2 E464 743D 9453 2124 5419 22FB
- **Key Type**: RSA 2048-bit primary with RSA 4096-bit signing subkey
- **Created**: December 2, 2014

### Use Cases
- **Software Package Signatures**: Linux distribution packages (APT, RPM, etc.)
- **Repository Metadata**: Package repository metadata signatures
- **Release Signatures**: Software release and distribution signatures
- **Document Signatures**: Important document and file signatures

### Verification Process
1. Import the public key: `gpg --import pubkey.asc`
2. Verify signature against original data: `gpg --verify signature.asc original_file`
3. Check that data hash matches: `sha256sum original_file`
4. Validate against Rekor's inclusion proof for tamper evidence

## Integration Notes

- All binary data is base64 encoded
- Hash values are SHA256 in hexadecimal format
- API versioning follows semantic versioning
- External schema references for entry specifications
- RESTful design with proper HTTP semantics
- Entry bodies must be base64-decoded to access structured content
- UUIDs serve as deterministic entry identifiers based on content