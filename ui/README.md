# Transparency Search

A web application for searching and monitoring transparency data from Certificate Transparency logs and Sigstore Rekor logs. Built with Next.js and ClickHouse.

## Features

### Certificate Transparency
- **Multi-type Search**: Search certificates by domain name, common name, serial number, SHA-256 fingerprint, or issuer
- **Detailed Certificate View**: View complete certificate information including subject, issuer, validity periods, and extensions
- **Subject Alternative Names**: Display all SAN entries for certificates
- **Certificate Transparency Logs**: Track which CT log each certificate was found in

### Sigstore Search
- **Data Hash Search**: Find entries by SHA-256 hash of signed artifacts
- **Email Search**: Search by email addresses in both PGP and X.509 certificates
- **X.509 Certificate Search**: Search by common name, Subject Alternative Names (SANs), or serial number
- **PGP Signature Search**: Search by PGP key fingerprint or signer email
- **Artifact URL Search**: Find entries by the URL of signed artifacts
- **Detailed Entry View**: View complete Sigstore entry information including signature details, certificates, and metadata

### General
- **Sidebar Navigation**: Easy switching between Certificate Transparency and Sigstore search
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Search**: Fast search with loading states and error handling

## Tech Stack

- **Frontend**: Next.js 15 with React 19
- **Styling**: Tailwind CSS 4
- **Database**: ClickHouse
- **Language**: TypeScript

## Prerequisites

- Node.js 18+ 
- ClickHouse database with CT log data and Sigstore Rekor data
- Environment variables for ClickHouse connection

## Environment Variables

Create a `.env.local` file in the `ui/` directory with the following variables:

```bash
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DATABASE=ct_logs
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Database Schema

The application expects two ClickHouse tables defined in `/schema.sql`:

### Certificate Transparency (`ct_log_entries`)
- Certificate identifiers (SHA-256, serial number)
- Subject and issuer information
- Validity periods
- Subject Alternative Names
- Certificate extensions and key usage
- CT log metadata

### Sigstore Rekor (`rekor_log_entries`)
- Entry metadata (UUID, tree ID, log index)
- Signature format and data hashes
- X.509 certificate information
- PGP signature details
- Artifact URLs and references

## API Endpoints

### Certificate Transparency
```
GET /api/certificate/{sha256}
```
Returns complete certificate information for a given SHA-256 fingerprint.

### Sigstore Search
```
GET /api/sigstore/search?query={query}&type={type}&limit={limit}
```
Searches Sigstore entries by various criteria. Supported types:
- `hash` - Data hash (SHA-256)
- `email` - Email addresses in PGP or X.509 certificates
- `x509_cn` - X.509 Common Name
- `x509_san` - X.509 Subject Alternative Names
- `x509_serial` - X.509 Serial Number
- `pgp_fingerprint` - PGP Key Fingerprint
- `pgp_email` - PGP Signer Email
- `data_url` - Artifact URL

## Search Types

### Certificate Transparency Search
1. **Domain/SAN**: Search by domain name or Subject Alternative Name
   - Example: `example.com`, `*.example.com`

2. **Common Name**: Search by certificate Common Name field
   - Example: `www.example.com`

3. **Serial Number**: Search by certificate serial number (hex format)
   - Example: `03f7b3b2a8c9d1e2f4a5b6c7d8e9f0a1`

4. **SHA-256**: Search by certificate SHA-256 fingerprint
   - Example: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

5. **Issuer**: Search by certificate issuer Common Name
   - Example: `Let's Encrypt Authority X3`

### Sigstore Search
1. **Data Hash**: Search by SHA-256 hash of signed artifacts
   - Example: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

2. **Any Email**: Search by email addresses in both PGP and X.509 certificates
   - Example: `user@example.com`

3. **X.509 Common Name**: Search by X.509 certificate Common Name
   - Example: `github.com`

4. **X.509 SAN**: Search by X.509 Subject Alternative Names
   - Example: `example.com`

5. **X.509 Serial**: Search by X.509 certificate serial number
   - Example: `123456789abcdef`

6. **PGP Fingerprint**: Search by PGP key fingerprint
   - Example: `ABCD1234EFGH5678IJKL9012MNOP3456QRST7890`

7. **PGP Email**: Search by PGP signer email address
   - Example: `signer@example.com`

8. **Artifact URL**: Search by the URL of signed artifacts
   - Example: `https://github.com/owner/repo/releases`

## Project Structure

```
ui/
├── app/
│   ├── api/
│   │   ├── certificate/[sha256]/route.ts  # Certificate detail API
│   │   └── sigstore/search/route.ts       # Sigstore search API
│   ├── certificate/[sha256]/page.tsx      # Certificate detail page
│   ├── sigstore/                          # Sigstore pages
│   │   ├── page.tsx                       # Main Sigstore search page
│   │   └── search/[query]/page.tsx        # Sigstore search results
│   ├── search/[domain]/page.tsx           # CT search results
│   ├── layout.tsx                         # Root layout with sidebar
│   ├── page.tsx                           # Main CT search page
│   └── globals.css                        # Global styles
├── components/
│   ├── search-form.tsx                    # CT search interface
│   ├── sigstore-search-form.tsx           # Sigstore search interface
│   ├── sigstore-results.tsx               # Sigstore results display
│   └── certificate-list.tsx               # Certificate results list
├── lib/
│   └── clickhouse.ts                      # ClickHouse client configuration
├── types/
│   ├── certificate.ts                     # CT TypeScript interfaces
│   └── sigstore.ts                        # Sigstore TypeScript interfaces
└── public/                                # Static assets
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and tests
5. Submit a pull request

## License

See the main project LICENSE file.
