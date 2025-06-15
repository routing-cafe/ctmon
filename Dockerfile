# Go backend build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o ctmon-ingest ./cmd/ctmon-ingest
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o sigstore-ingest ./cmd/sigstore-ingest

# Go ingest runtime stage
FROM alpine:latest AS ctmon_ingest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/ctmon-ingest .

# Expose port (if needed for health checks)
EXPOSE 8080

# Run the binary
CMD ["./ctmon-ingest"]

# Go ingest runtime stage
FROM alpine:latest AS sigstore_ingest

# Install ca-certificates for HTTPS requests
RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/sigstore-ingest .

# Expose port (if needed for health checks)
EXPOSE 8080

# Run the binary
CMD ["./sigstore-ingest"]

# UI build stage
FROM denoland/deno:debian AS ui-builder

WORKDIR /app

# Copy package files
COPY ui/package.json ui/deno.lock ./

# Copy UI source code
COPY ui/ ./

# Install dependencies and build the UI
RUN deno install
RUN deno task build

# Final UI runtime stage
FROM denoland/deno:alpine AS ui

WORKDIR /app

# Copy built UI files from ui-builder stage
COPY --from=ui-builder /app/package.json /app/package.json
COPY --from=ui-builder /app/deno.lock /app/deno.lock
COPY --from=ui-builder /app/node_modules /app/node_modules
COPY --from=ui-builder /app/.deno-deploy /app/.deno-deploy

# Install dependencies
RUN deno clean --unstable-npm-lazy-caching -e ./.deno-deploy/server.ts

# Expose port
EXPOSE 8000

# Set environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8000

# Run the application
CMD ["deno", "run", "-A", "./.deno-deploy/server.ts"]