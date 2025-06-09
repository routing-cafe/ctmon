# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

transparency.cafe is a multi-component system for ingesting, storing, and analyzing internet transparency data:

- **Certificate Transparency Logs**: Ingests CT log entries from public CT logs
- **Sigstore Data**: Ingests entries from the Rekor transparency log
- **ClickHouse Database**: Stores all transparency data with optimized schemas
- **Next.js Web UI**: Provides search and analysis interface

### Component Structure

- `cmd/ctmon-ingest/`: Go binary for ingesting CT log entries
- `cmd/sigstore-ingest/`: Go binary for ingesting Sigstore/Rekor entries  
- `ui/`: Next.js frontend application
- `schema.sql`: ClickHouse database schema definitions

## Build and Development Commands

### Go Components
```bash
# Build CT log ingester
go build -o ctmon-ingest ./cmd/ctmon-ingest

# Build Sigstore ingester
go build -o sigstore-ingest ./cmd/sigstore-ingest

# Run CT log ingester
./ctmon-ingest -log_url="https://ct.googleapis.com/logs/us1/argon2025h2" -start_index=-1

# Run Sigstore ingester  
./sigstore-ingest -start_index=-1 -concurrency=20
```

### Frontend (UI)
```bash
cd ui/
npm install
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint checking
```

## Database Connection

Both Go ingesters and the Next.js UI connect to ClickHouse using environment variables:

```bash
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000    # Native protocol for Go
CLICKHOUSE_PORT=8123    # HTTP for Next.js
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

## Architecture Details

### CT Log Ingestion (`cmd/ctmon-ingest/`)
- Fetches entries from Certificate Transparency logs using RFC 6962 API
- Parses X.509 certificates and precertificates
- Handles resumption from latest ingested entry
- Uses batch processing with configurable concurrency
- Implements circuit breaker pattern for reliability

### Sigstore Ingestion (`cmd/sigstore-ingest/`)
- Fetches entries from Rekor transparency log API
- Parses multiple entry types (hashedrekord, rekord)
- Extracts X.509 certificates and PGP signature metadata
- Supports proxy pools for rate limiting circumvention
- Uses adaptive concurrency based on rate limiting

### Database Schema
- `ct_log_entries`: Main table for CT log data with partitioning by certificate expiry
- `ct_log_entries_by_name`: Materialized view for domain name lookups
- `rekor_log_entries`: Sigstore/Rekor entries with comprehensive metadata extraction

### Web UI (`ui/`)
- Next.js 15 application with TypeScript
- Uses ClickHouse client for database queries
- Certificate search and analysis interfaces
- Tailwind CSS for styling