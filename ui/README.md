# transparency.cafe UI

SvelteKit web interface for transparency.cafe - a system for searching and analyzing Certificate Transparency logs and Sigstore data.

## Features

- Certificate Transparency log search and analysis
- Sigstore/Rekor entry browsing
- Real-time statistics and RSS feeds
- ClickHouse-powered fast search

## Development

This application runs on Deno 2 and uses SvelteKit with the Deno adapter.

### Prerequisites

- [Deno 2](https://deno.com/) installed
- Access to a ClickHouse database

### Getting Started

Install dependencies:
```bash
deno install
```

Start the development server:
```bash
deno task dev

# or start the server and open the app in a new browser tab
deno task dev -- --open
```

### Environment Variables

Set up your ClickHouse connection:

```bash
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=default
```

## Building

To create a production version:

```bash
deno task build
```

Preview the production build:
```bash
deno task preview
```

## Linting and Formatting

Run linting and formatting checks:
```bash
deno task lint
```

Format code:
```bash
deno task format
```

## Deployment

The app uses the [@deno/svelte-adapter](https://github.com/denoland/deno-svelte-adapter) for deployment to Deno-compatible platforms.
