# Sigsum Integration Plan

## Overview

This document outlines the plan for integrating Sigsum transparency log support into the transparency.cafe platform. Sigsum is a transparency logging system that focuses on signed checksums, providing key usage transparency through a minimalist design.

## Sigsum Architecture

### Core Concept

Sigsum logs **signed checksums** rather than full certificates or software artifacts. Each log entry represents a cryptographic signature operation over a data checksum, providing transparency into how signing keys are being used.

### Key Architectural Differences

| Aspect | Certificate Transparency | Sigstore/Rekor | Sigsum |
|--------|-------------------------|----------------|---------|
| **Primary Focus** | X.509 certificates | Software artifacts & signatures | Signed checksums |
| **Data Complexity** | Complex ASN.1 certificate parsing | Rich manifest types & metadata | Minimal 4-field leaf structure |
| **Trust Model** | Centralized log operators | Centralized log + keyless signing | Distributed witness cosigning |
| **Verification** | Certificate transparency | Software supply chain | General key-usage transparency |

### Data Structures

#### Sigsum Leaf Structure
Each Merkle tree leaf contains exactly **4 fields** (136 bytes total):
```
- shard_hint: uint64      // 8 bytes - Binds leaf to shard interval
- checksum: [32]byte      // 32 bytes - SHA256 hash of signed data
- signature: [64]byte     // 64 bytes - Ed25519 signature 
- key_hash: [32]byte      // 32 bytes - SHA256 hash of signer's public key
```

#### Tree Head Structure
```
- timestamp: uint64       // Unix timestamp
- tree_size: uint64       // Number of leaves
- root_hash: [32]byte     // Merkle tree root
- signature: [64]byte     // Log's signature over above
```

Plus **witness cosignatures** for distributed trust verification.

## HTTP API

Sigsum logs expose a simple HTTP API:

```
GET /get-tree-head
GET /get-leaves/<start>/<end>  
GET /get-inclusion-proof/<tree_size>/<leaf_hash>
GET /get-consistency-proof/<old_size>/<new_size>
POST /add-leaf
```

### Example Responses

**get-tree-head:**
```
size=1291
root_hash=2b06e738e93ad2e8b9e1c8ae86b762cb20f16b0bda4ce3e40680d412b9cae5ea
signature=5e91a847fb088341b26dc217c46878cd0bd1b9b576ce7d9d5f0fa781b1b139488bebc1883748c2c731aab546ee37ffcfa5823a37e55a8b5e501390235fcab00f
cosignature=70b861a010f25030de6ff6a5267e0b951e70c04b20ba4a3ce41e7fba7b9b7dfc
```

**get-leaves:**
```
leaf=<shard_hint><checksum><signature><key_hash>
```

## API Experiment Results

### Live API Testing: https://seasalp.glasklar.is

**Current Tree Status** (as of testing):
- **Size**: 9,370 entries
- **Root Hash**: `f31a9667c7c2051e176c00a886f236f4fd8defafbd93af9bf32fa2f5efbe20fb`
- **Log Signature**: Ed25519 signature over tree head
- **Witness Cosignatures**: 17 different witnesses providing distributed trust

### Endpoint Testing Results

#### ✅ `GET /get-tree-head`
```bash
curl https://seasalp.glasklar.is/get-tree-head
```
**Response Format**:
```
size=9370
root_hash=f31a9667c7c2051e176c00a886f236f4fd8defafbd93af9bf32fa2f5efbe20fb
signature=99b6100b1279a2079749892745ca2738cc7fa04c4498ea20386f119fac40aa77a302dfba7702a9028f67e4b5829c9279d52f8cd6dd097ecac3b710dceac7c104
cosignature=<witness_key_hash> <timestamp> <signature>
cosignature=<witness_key_hash> <timestamp> <signature>
[... 17 total cosignatures]
```

#### ✅ `GET /get-leaves/start/end`
```bash
curl https://seasalp.glasklar.is/get-leaves/0/4
```
**Response Format**:
```
leaf=<checksum> <signature> <key_hash>
leaf=<checksum> <signature> <key_hash>
[...]
```

**⚠️ Key Finding**: Actual leaf format differs from documentation:
- **Expected**: 4 fields (shard_hint, checksum, signature, key_hash)
- **Actual**: 3 fields (checksum, signature, key_hash)
- **Field Sizes**: checksum (64 hex chars = 32 bytes), signature (128 hex chars = 64 bytes), key_hash (64 hex chars = 32 bytes)

#### ✅ `GET /get-consistency-proof/old_size/new_size`
```bash
curl https://seasalp.glasklar.is/get-consistency-proof/9000/9370
```
**Response Format**:
```
node_hash=<32-byte-hash-in-hex>
node_hash=<32-byte-hash-in-hex>
[... 10 hashes total for this range]
```

#### ❌ `GET /get-inclusion-proof/tree_size/leaf_hash`
```bash
curl https://seasalp.glasklar.is/get-inclusion-proof/9370/cd446a8537e59056c999aeb7ecd47f6b4f82f86309d08789b169d43e9ce53935
```
**Response**: `(404) Not Found` - Endpoint appears to be unavailable or requires different parameters.

### Error Handling Analysis

| Test Case | Command | Response |
|-----------|---------|----------|
| **Out of range indices** | `get-leaves/99999/100000` | `(400) start_index(99999) outside of current tree` |
| **Negative index** | `get-leaves/-1/0` | `(400) strconv.ParseUint: parsing "-1": invalid syntax` |
| **Invalid range** | `get-leaves/10/5` | `(400) start_index(10) must be less than end_index(5)` |
| **Invalid range (equal)** | `get-leaves/0/0` | `(400) start_index(0) must be less than end_index(0)` |
| **Non-existent endpoint** | `/nonexistent-endpoint` | `404 page not found` |

### Key Insights for Implementation

1. **Simplified Data Structure**: Only 3 fields per leaf (no shard_hint in API response)
2. **ASCII Hex Format**: All data returned as hex strings, not binary
3. **Robust Error Handling**: Clear error messages with HTTP status codes
4. **Witness Cosigning**: Multiple witness signatures provide distributed trust verification
5. **Consistent API**: Follows documented patterns with key/value format

## Implementation Plan

### Phase 1: Core Infrastructure (High Priority)

#### 1. Database Schema
Add `sigsum_log_entries` table to `schema.sql`:

```sql
CREATE TABLE sigsum_log_entries
(
    -- Log Identification
    log_id LowCardinality(String) COMMENT 'Sigsum log identifier',
    log_index UInt64 COMMENT 'Index within the log',
    retrieval_timestamp DateTime DEFAULT now() COMMENT 'Ingestion timestamp',
    
    -- Core Sigsum Leaf Data (3 fields - updated based on API testing)
    checksum FixedString(64) COMMENT 'SHA256 hash of signed data (hex)',
    signature FixedString(128) COMMENT 'Ed25519 signature (hex)', 
    key_hash FixedString(64) COMMENT 'SHA256 hash of public key (hex)',
    
    -- Tree metadata
    integrated_time DateTime COMMENT 'Log integration timestamp',
    tree_size UInt64 COMMENT 'Tree size at integration',
    
    -- Optional derived fields
    public_key String COMMENT 'Full public key if available',
    signer_domain String COMMENT 'Domain from DNS verification',
    
    -- Indexes for querying
    INDEX idx_checksum checksum TYPE bloom_filter GRANULARITY 1,
    INDEX idx_key_hash key_hash TYPE bloom_filter GRANULARITY 1,
    INDEX idx_shard_hint shard_hint TYPE minmax,
    INDEX idx_integrated_time integrated_time TYPE minmax
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(integrated_time)
ORDER BY (log_id, log_index)
SETTINGS storage_policy = 's3_policy', index_granularity = 8192;
```

Add materialized view for statistics:
```sql
CREATE MATERIALIZED VIEW sigsum_log_stats_by_key_hash
REFRESH EVERY 5 MINUTE
ENGINE = Memory
AS SELECT
    key_hash,
    count() as total_entries,
    max(integrated_time) as last_seen,
    min(integrated_time) as first_seen
FROM sigsum_log_entries
WHERE toYYYYMM(integrated_time) >= toYYYYMM(now() - INTERVAL 3 MONTH)
GROUP BY key_hash 
ORDER BY total_entries DESC 
LIMIT 1000;
```

#### 2. Go Ingester Binary
Create `cmd/sigsum-ingest/main.go` following the pattern of existing ingesters:

**Core Components:**
- HTTP client for Sigsum API
- Binary leaf parser (136 bytes per leaf)
- ClickHouse batch inserter with circuit breaker
- Resumption logic tracking latest index
- Optional witness cosignature verification

**Updated Parsing Logic** (based on API testing):
```go
type SigsumLeaf struct {
    Checksum  [32]byte  // 32 bytes - SHA256 hash of signed data
    Signature [64]byte  // 64 bytes - Ed25519 signature  
    KeyHash   [32]byte  // 32 bytes - SHA256 hash of public key
}

func parseLeafLine(line string) (*SigsumLeaf, error) {
    if !strings.HasPrefix(line, "leaf=") {
        return nil, fmt.Errorf("invalid leaf line format")
    }
    
    // Remove "leaf=" prefix and split by spaces
    data := strings.TrimPrefix(line, "leaf=")
    fields := strings.Fields(data)
    if len(fields) != 3 {
        return nil, fmt.Errorf("expected 3 fields, got %d", len(fields))
    }
    
    leaf := &SigsumLeaf{}
    
    // Parse checksum (64 hex chars)
    if len(fields[0]) != 64 {
        return nil, fmt.Errorf("invalid checksum length: %d", len(fields[0]))
    }
    checksum, err := hex.DecodeString(fields[0])
    if err != nil {
        return nil, fmt.Errorf("invalid checksum hex: %v", err)
    }
    copy(leaf.Checksum[:], checksum)
    
    // Parse signature (128 hex chars)  
    if len(fields[1]) != 128 {
        return nil, fmt.Errorf("invalid signature length: %d", len(fields[1]))
    }
    signature, err := hex.DecodeString(fields[1])
    if err != nil {
        return nil, fmt.Errorf("invalid signature hex: %v", err)
    }
    copy(leaf.Signature[:], signature)
    
    // Parse key hash (64 hex chars)
    if len(fields[2]) != 64 {
        return nil, fmt.Errorf("invalid key_hash length: %d", len(fields[2]))
    }
    keyHash, err := hex.DecodeString(fields[2])
    if err != nil {
        return nil, fmt.Errorf("invalid key_hash hex: %v", err)
    }
    copy(leaf.KeyHash[:], keyHash)
    
    return leaf, nil
}
```

### Phase 2: UI Integration (Medium Priority)

#### 3. TypeScript Types
Create `ui/types/sigsum.ts`:

```typescript
export interface SigsumEntry {
  log_id: string;
  log_index: number;
  retrieval_timestamp: string;
  shard_hint: number;
  checksum: string;
  signature: string;
  key_hash: string;
  integrated_time: string;
  tree_size: number;
  public_key?: string;
  signer_domain?: string;
}

export interface SigsumSearchQuery {
  query: string;
  queryType: "checksum" | "key_hash" | "signer_domain";
  limit?: number;
}
```

#### 4. UI Pages
Create search and browse interfaces:

- `ui/app/sigsum/page.tsx` - Main Sigsum dashboard
- `ui/app/sigsum/search/[query]/page.tsx` - Search results
- `ui/app/sigsum/entry/[index]/page.tsx` - Individual entry details
- `ui/app/sigsum/key/[hash]/page.tsx` - Key usage history

#### 5. Navigation Integration
Update `ui/components/nav.tsx` to include Sigsum link alongside Certificate Transparency and Sigstore.

#### 6. Search Components
Create Sigsum-specific search components:

- `ui/components/sigsum-search-form.tsx` - Search form with checksum/key hash options
- `ui/components/sigsum-results.tsx` - Results display with key usage patterns
- `ui/components/sigsum-stats.tsx` - Key usage statistics dashboard

#### 7. Database Query Functions
Add ClickHouse query functions to `ui/lib/clickhouse.ts`:

- `searchSigsumByChecksum()`
- `searchSigsumByKeyHash()`
- `getSigsumEntry()`
- `getSigsumKeyUsageStats()`

### Phase 3: Documentation (Low Priority)

#### 8. Update Documentation
Update `CLAUDE.md` with Sigsum build and run instructions:

```bash
# Build Sigsum ingester
go build -o sigsum-ingest ./cmd/sigsum-ingest

# Run Sigsum ingester
./sigsum-ingest -log_url="https://sigsum.example.com" -start_index=-1
```

## Benefits of Sigsum Integration

### 1. Key Usage Transparency
Track how signing keys are being used across different systems and applications, providing visibility into key lifecycle and usage patterns.

### 2. Minimal Storage Requirements
Sigsum's 4-field structure requires significantly less storage than CT certificates or Sigstore artifacts, making it cost-effective to operate at scale.

### 3. Distributed Trust Model
Witness cosigning provides additional security guarantees beyond single log operator trust.

### 4. General Signing Transparency
Not limited to specific use cases like TLS certificates or software artifacts - provides transparency for any signature operations.

### 5. Simple Implementation
The minimalist design makes Sigsum the simplest transparency log to integrate, with fixed parsing requirements and straightforward API.

## Implementation Complexity

**Low Complexity** compared to existing ingesters:

- ✅ **No complex ASN.1 parsing** (vs Certificate Transparency)
- ✅ **No JSON parsing of varied manifest types** (vs Sigstore/Rekor)  
- ✅ **Fixed 4-field binary structure** (136 bytes per entry)
- ✅ **Simple Ed25519 + SHA256 cryptography**
- ✅ **ASCII HTTP API** similar to existing patterns

The Sigsum ingester will be the **simplest** of the three transparency log ingesters, making it an excellent addition to transparency.cafe's comprehensive transparency data collection capabilities.

## Timeline

- **Phase 1** (Core Infrastructure): 1-2 weeks
- **Phase 2** (UI Integration): 2-3 weeks  
- **Phase 3** (Documentation): 1 week

**Total Estimated Timeline: 4-6 weeks**

## Success Metrics

1. **Ingestion Rate**: Successfully ingest Sigsum entries at comparable rates to CT/Sigstore
2. **Storage Efficiency**: Demonstrate reduced storage footprint vs other transparency logs
3. **Query Performance**: Fast search by checksum and key hash
4. **UI Usability**: Intuitive search and browsing of key usage patterns
5. **System Integration**: Seamless integration with existing transparency.cafe architecture