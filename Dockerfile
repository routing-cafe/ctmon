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
FROM node:20-alpine AS ui-builder

WORKDIR /app

# Copy package files
COPY ui/package*.json ./

# Install dependencies
RUN npm ci

# Copy UI source code
COPY ui/ ./

# Build the application
RUN npm run build

# Ensure public directory exists (Next.js may not create it if empty)
RUN mkdir -p /app/public

# UI runtime stage
FROM node:20-alpine AS ui

WORKDIR /app

# Copy built application
COPY --from=ui-builder /app/.next/standalone ./
COPY --from=ui-builder /app/.next/static ./.next/static

# Copy public directory
COPY --from=ui-builder /app/public ./public

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run the application
CMD ["node", "server.js"]