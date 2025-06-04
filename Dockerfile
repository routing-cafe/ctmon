# Build stage
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

# Runtime stage
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