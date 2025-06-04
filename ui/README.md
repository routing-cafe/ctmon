# Certificate Transparency Monitor

A web application for searching and monitoring SSL/TLS certificates from Certificate Transparency logs, similar to crt.sh. Built with Next.js and ClickHouse.

## Features

- **Multi-type Search**: Search certificates by domain name, common name, serial number, SHA-256 fingerprint, or issuer
- **Detailed Certificate View**: View complete certificate information including subject, issuer, validity periods, and extensions
- **Subject Alternative Names**: Display all SAN entries for certificates
- **Certificate Transparency Logs**: Track which CT log each certificate was found in
- **Responsive Design**: Works on desktop and mobile devices with dark mode support

## Tech Stack

- **Frontend**: Next.js 15 with React 19
- **Styling**: Tailwind CSS 4
- **Database**: ClickHouse
- **Language**: TypeScript

## Prerequisites

- Node.js 18+ 
- ClickHouse database with CT log data
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

The application expects a ClickHouse table named `ct_log_entries` with the schema defined in `/schema.sql`. Key fields include:

- Certificate identifiers (SHA-256, serial number)
- Subject and issuer information
- Validity periods
- Subject Alternative Names
- Certificate extensions and key usage
- CT log metadata

## API Endpoints

### Get Certificate Details
```
GET /api/certificate/{sha256}
```

Returns complete certificate information for a given SHA-256 fingerprint.

## Search Types

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

## Project Structure

```
ui/
├── app/
│   ├── api/
│   │   ├── search/route.ts          # Search API endpoint
│   │   └── certificate/[sha256]/route.ts  # Certificate detail API
│   ├── certificate/[sha256]/page.tsx # Certificate detail page
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Main search page
│   └── globals.css                  # Global styles
├── components/
│   ├── search-form.tsx              # Search interface
│   └── certificate-list.tsx         # Certificate results list
├── lib/
│   └── clickhouse.ts                # ClickHouse client configuration
├── types/
│   └── certificate.ts               # TypeScript interfaces
└── public/                          # Static assets
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
