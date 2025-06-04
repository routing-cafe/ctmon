package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	ct "github.com/google/certificate-transparency-go"
	cttls "github.com/google/certificate-transparency-go/tls"
	ctx509 "github.com/google/certificate-transparency-go/x509"
	ctpkix "github.com/google/certificate-transparency-go/x509/pkix"
	"github.com/joho/godotenv"
)

// STHResponse represents the signed tree head response from CT log
type STHResponse struct {
	TreeSize          int64  `json:"tree_size"`
	Timestamp         int64  `json:"timestamp"`
	SHA256RootHash    string `json:"sha256_root_hash"`
	TreeHeadSignature string `json:"tree_head_signature"`
}

// CTLogResponseEntry matches the structure of entries in the JSON response from get-entries
type CTLogResponseEntry struct {
	LeafInput string `json:"leaf_input"` // base64 encoded MerkleTreeLeaf
	ExtraData string `json:"extra_data"` // base64 encoded data (e.g., certificate chain)
	LeafIndex int64  `json:"-"`          // Not part of JSON, added for context
	LogID     string `json:"-"`          // Not part of JSON, added for context
}

// GetEntriesResponse matches the overall JSON response from get-entries
type GetEntriesResponse struct {
	Entries []CTLogResponseEntry `json:"entries"`
}

// CertificateDetails is the structure holding parsed data ready for ingestion
type CertificateDetails struct {
	LogID                       string    `json:"log_id"`
	LogIndex                    int64     `json:"log_index"`
	RetrievalTimestamp          time.Time `json:"retrieval_timestamp"`
	LeafInputBase64             string    `json:"leaf_input_base64"`
	ExtraDataBase64             string    `json:"extra_data_base64"`
	EntryTimestamp              time.Time `json:"entry_timestamp"`
	EntryType                   string    `json:"entry_type"` // "x509_entry" or "precert_entry"
	CertificateSHA256           string    `json:"certificate_sha256"`
	TBSCertificateSHA256        string    `json:"tbs_certificate_sha256"`
	NotBefore                   time.Time `json:"not_before,omitempty"`
	NotAfter                    time.Time `json:"not_after,omitempty"`
	SubjectCommonName           string    `json:"subject_common_name,omitempty"`
	SubjectOrganization         []string  `json:"subject_organization,omitempty"`
	SubjectAlternativeNames     []string  `json:"subject_alternative_names,omitempty"`
	IssuerCommonName            string    `json:"issuer_common_name,omitempty"`
	IssuerOrganization          []string  `json:"issuer_organization,omitempty"`
	SerialNumber                string    `json:"serial_number,omitempty"`
	IsCA                        bool      `json:"is_ca,omitempty"`
	PrecertIssuerKeyHash        string    `json:"precert_issuer_key_hash,omitempty"` // Hex encoded
	RawLeafCertificateDERBase64 string    `json:"raw_leaf_certificate_der_base64"`
}

const (
	defaultBatchSize      = 1000
	requestTimeout        = 30 * time.Second
	delayBetweenBatches   = 1 * time.Second
	maxRetries            = 5
	initialRetryDelay     = 1 * time.Second
	maxRetryDelay         = 30 * time.Second
	retryMultiplier       = 2.0
	circuitBreakerLimit   = 10               // Number of consecutive failures before opening circuit
	circuitBreakerTimeout = 60 * time.Second // Time before trying to close circuit
	dbBatchSize           = 2000             // Number of entries to batch for database insertion
	dbBatchTimeout        = 5 * time.Second  // Max time to wait before flushing a partial batch
	logChannelBuffer      = 5000             // Buffer size for the log entry channel
	pollingInterval       = 5 * time.Second  // Interval to poll when log reaches its end
)

// CircuitBreaker tracks database connection health
type CircuitBreaker struct {
	failureCount int
	lastFailure  time.Time
	state        string // "closed", "open", "half-open"
}

func (cb *CircuitBreaker) canExecute() bool {
	if cb.state == "closed" {
		return true
	}
	if cb.state == "open" && time.Since(cb.lastFailure) > circuitBreakerTimeout {
		cb.state = "half-open"
		return true
	}
	return cb.state == "half-open"
}

func (cb *CircuitBreaker) recordSuccess() {
	cb.failureCount = 0
	cb.state = "closed"
}

func (cb *CircuitBreaker) recordFailure() {
	cb.failureCount++
	cb.lastFailure = time.Now()
	if cb.failureCount >= circuitBreakerLimit {
		cb.state = "open"
		log.Printf("Circuit breaker opened due to %d consecutive failures", cb.failureCount)
	}
}

func isEndOfLogError(err error) bool {
	if err == nil {
		return false
	}
	errorStr := err.Error()
	return strings.Contains(errorStr, "400 Bad Request")
}

func fetchSTH(client *http.Client, logURL string) (*STHResponse, error) {
	if !strings.HasSuffix(logURL, "/") {
		logURL += "/"
	}
	apiURL := fmt.Sprintf("%sct/v1/get-sth", logURL)

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create STH request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get STH from %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("STH request failed with status %s: %s", resp.Status, string(bodyBytes))
	}

	var sthResp STHResponse
	if err := json.NewDecoder(resp.Body).Decode(&sthResp); err != nil {
		return nil, fmt.Errorf("failed to decode STH response: %w", err)
	}
	return &sthResp, nil
}

func calculateBackoffDelay(attempt int) time.Duration {
	delay := time.Duration(float64(initialRetryDelay) * math.Pow(retryMultiplier, float64(attempt)))
	if delay > maxRetryDelay {
		delay = maxRetryDelay
	}
	return delay
}

func fetchEntriesWithRetry(client *http.Client, logURL string, start, end int64) (*GetEntriesResponse, error) {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		resp, err := fetchEntries(client, logURL, start, end)
		if err == nil {
			return resp, nil
		}

		lastErr = err
		log.Printf("Attempt %d/%d failed for entries %d-%d: %v", attempt+1, maxRetries+1, start, end, err)

		// Don't retry on the last attempt
		if attempt == maxRetries {
			break
		}

		// Check if error is retryable or end-of-log condition
		if isEndOfLogError(err) {
			// This is end-of-log, don't retry but return special error type
			return nil, fmt.Errorf("end_of_log: %w", err)
		}

		// Calculate and apply backoff delay
		delay := calculateBackoffDelay(attempt)
		log.Printf("Retrying in %v...", delay)
		time.Sleep(delay)
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", maxRetries+1, lastErr)
}

func fetchEntries(client *http.Client, logURL string, start, end int64) (*GetEntriesResponse, error) {
	if !strings.HasSuffix(logURL, "/") {
		logURL += "/"
	}
	apiURL := fmt.Sprintf("%sct/v1/get-entries?start=%d&end=%d", logURL, start, end)

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get entries from %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("http request failed with status %s: %s", resp.Status, string(bodyBytes))
	}

	var getEntriesResp GetEntriesResponse
	if err := json.NewDecoder(resp.Body).Decode(&getEntriesResp); err != nil {
		return nil, fmt.Errorf("failed to decode json response: %w", err)
	}
	return &getEntriesResp, nil
}

func parseDistinguishedName(name ctpkix.Name) (commonName string, organization []string) {
	commonName = name.CommonName
	organization = name.Organization
	return
}

func formatSerialNumber(serial *big.Int) string {
	if serial == nil {
		return ""
	}
	// Format as hex, similar to how OpenSSL often displays it.
	// Ensure it's a positive number for hex representation.
	hexBytes := serial.Bytes()
	return hex.EncodeToString(hexBytes)
}

func parseLogEntry(rawEntry CTLogResponseEntry, logID string, currentLogIndex int64) (*CertificateDetails, error) {
	leafInputBytes, err := base64.StdEncoding.DecodeString(rawEntry.LeafInput)
	if err != nil {
		return nil, fmt.Errorf("failed to base64 decode leaf_input for index %d: %w", currentLogIndex, err)
	}

	var merkleLeaf ct.MerkleTreeLeaf
	if _, err := cttls.Unmarshal(leafInputBytes, &merkleLeaf); err != nil {
		// Try to unmarshal just the TimestampedEntry part if MerkleTreeLeaf fails (e.g. if leaf_input is already just a TimestampedEntry)
		// This is not standard but some logs might behave differently or data might be sourced differently.
		// For strict RFC6962 compliance, this fallback might not be needed.
		var tsEntry ct.TimestampedEntry
		if _, errTs := cttls.Unmarshal(leafInputBytes, &tsEntry); errTs != nil {
			return nil, fmt.Errorf("failed to cttls.Unmarshal MerkleTreeLeaf or TimestampedEntry for index %d: %w (leaf) / %w (tsEntry)", currentLogIndex, err, errTs)
		}
		// If TimestampedEntry unmarshalled directly, wrap it in a dummy MerkleTreeLeaf for consistent processing
		merkleLeaf.TimestampedEntry = &tsEntry
		merkleLeaf.Version = 0 // Assuming V1
		merkleLeaf.LeafType = ct.TimestampedEntryLeafType
		log.Printf("Warning: Successfully unmarshalled leaf_input for index %d directly as TimestampedEntry. Assuming V1 MerkleTreeLeaf wrapper.", currentLogIndex)
	}

	if merkleLeaf.Version != ct.V1 {
		return nil, fmt.Errorf("unknown MerkleTreeLeaf version: %v for index %d", merkleLeaf.Version, currentLogIndex)
	}
	if merkleLeaf.LeafType != ct.TimestampedEntryLeafType {
		return nil, fmt.Errorf("unknown MerkleTreeLeaf type: %v for index %d", merkleLeaf.LeafType, currentLogIndex)
	}

	tsEntry := merkleLeaf.TimestampedEntry
	details := CertificateDetails{
		LogID:              logID,
		LogIndex:           currentLogIndex,
		RetrievalTimestamp: time.Now().UTC(),
		LeafInputBase64:    rawEntry.LeafInput,
		ExtraDataBase64:    rawEntry.ExtraData,
		EntryTimestamp:     time.Unix(0, int64(tsEntry.Timestamp)*int64(time.Millisecond)).UTC(),
	}

	switch tsEntry.EntryType {
	case ct.X509LogEntryType:
		details.EntryType = "x509_entry"
		details.RawLeafCertificateDERBase64 = base64.StdEncoding.EncodeToString(tsEntry.X509Entry.Data)
		certHash := sha256.Sum256(tsEntry.X509Entry.Data)
		details.CertificateSHA256 = hex.EncodeToString(certHash[:])

		// Parse X.509 certificates
		parsedCert, err := ctx509.ParseCertificate(tsEntry.X509Entry.Data)
		if err != nil {
			log.Printf("Warning: Failed to parse X.509 certificate for index %d: %v. Some fields might be missing.",
				currentLogIndex, err)
		} else {
			details.NotBefore = parsedCert.NotBefore.UTC()
			details.NotAfter = parsedCert.NotAfter.UTC()
			details.SubjectCommonName, details.SubjectOrganization = parseDistinguishedName(parsedCert.Subject)
			details.IssuerCommonName, details.IssuerOrganization = parseDistinguishedName(parsedCert.Issuer)
			details.SerialNumber = formatSerialNumber(parsedCert.SerialNumber)
			details.IsCA = parsedCert.IsCA

			var sans []string
			sans = append(sans, parsedCert.DNSNames...)
			for _, ip := range parsedCert.IPAddresses {
				sans = append(sans, ip.String())
			}
			sans = append(sans, parsedCert.EmailAddresses...)
			for _, uri := range parsedCert.URIs {
				sans = append(sans, uri.String())
			}
			details.SubjectAlternativeNames = sans

			if len(parsedCert.RawTBSCertificate) > 0 {
				tbsHash := sha256.Sum256(parsedCert.RawTBSCertificate)
				details.TBSCertificateSHA256 = hex.EncodeToString(tbsHash[:])
			}
		}
	case ct.PrecertLogEntryType:
		details.EntryType = "precert_entry"
		details.RawLeafCertificateDERBase64 = base64.StdEncoding.EncodeToString(tsEntry.PrecertEntry.TBSCertificate)
		details.PrecertIssuerKeyHash = hex.EncodeToString(tsEntry.PrecertEntry.IssuerKeyHash[:])
		tbsHash := sha256.Sum256(tsEntry.PrecertEntry.TBSCertificate)
		details.CertificateSHA256 = hex.EncodeToString(tbsHash[:])
		details.TBSCertificateSHA256 = hex.EncodeToString(tbsHash[:])
	default:
		return nil, fmt.Errorf("unknown TimestampedEntry type: %v for index %d", tsEntry.EntryType, currentLogIndex)
	}

	return &details, nil
}

func initClickHouse() (*sql.DB, error) {
	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "localhost"
	}

	portStr := os.Getenv("CLICKHOUSE_PORT")
	if portStr == "" {
		portStr = "9000"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, fmt.Errorf("invalid CLICKHOUSE_PORT: %w", err)
	}

	user := os.Getenv("CLICKHOUSE_USER")
	if user == "" {
		user = "default"
	}

	password := os.Getenv("CLICKHOUSE_PASSWORD")
	database := os.Getenv("CLICKHOUSE_DATABASE")
	if database == "" {
		database = "default"
	}

	conn := clickhouse.OpenDB(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%d", host, port)},
		Auth: clickhouse.Auth{
			Database: database,
			Username: user,
			Password: password,
		},
		Protocol:    clickhouse.HTTP,
		DialTimeout: 5 * time.Second,
		ReadTimeout: 3600 * time.Second,
		TLS:         &tls.Config{},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := conn.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to connect to ClickHouse: %w", err)
	}

	return conn, nil
}

func boolToUint8(b bool) uint8 {
	if b {
		return 1
	}
	return 0
}

func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func ingestBatch(db *sql.DB, batch []*CertificateDetails) error {
	if len(batch) == 0 {
		return nil
	}

	query := `
		INSERT INTO ct_log_entries (
			log_id, log_index, retrieval_timestamp, leaf_input, extra_data,
			entry_timestamp, entry_type, certificate_sha256, tbs_certificate_sha256,
			not_before, not_after, subject_common_name, subject_organization, 
			subject_alternative_names, issuer_common_name, issuer_organization,
			serial_number, is_ca, precert_issuer_key_hash, raw_leaf_certificate_der
		) VALUES
	`

	var values []string
	var args []interface{}

	for _, details := range batch {
		values = append(values, "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		args = append(args,
			details.LogID,
			details.LogIndex,
			details.RetrievalTimestamp,
			details.LeafInputBase64,
			details.ExtraDataBase64,
			details.EntryTimestamp,
			details.EntryType,
			details.CertificateSHA256,
			details.TBSCertificateSHA256,
			details.NotBefore,
			details.NotAfter,
			details.SubjectCommonName,
			details.SubjectOrganization,
			details.SubjectAlternativeNames,
			details.IssuerCommonName,
			details.IssuerOrganization,
			details.SerialNumber,
			boolToUint8(details.IsCA),
			nullableString(details.PrecertIssuerKeyHash),
			details.RawLeafCertificateDERBase64,
		)
	}

	query += strings.Join(values, ", ")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to insert batch of %d certificate entries: %w", len(batch), err)
	}

	return nil
}

func ingestBatchWithRetry(db *sql.DB, batch []*CertificateDetails, cb *CircuitBreaker) error {
	if !cb.canExecute() {
		return fmt.Errorf("circuit breaker is open, skipping database batch operation")
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := ingestBatch(db, batch)
		if err == nil {
			cb.recordSuccess()
			return nil
		}

		lastErr = err
		log.Printf("Database batch insert attempt %d/%d failed for %d entries: %v",
			attempt+1, maxRetries+1, len(batch), err)

		if attempt == maxRetries {
			break
		}

		delay := calculateBackoffDelay(attempt)
		log.Printf("Retrying database batch operation in %v...", delay)
		time.Sleep(delay)
	}

	cb.recordFailure()
	return fmt.Errorf("database batch operation failed after %d attempts: %w", maxRetries+1, lastErr)
}

func dbInserter(logChan <-chan *CertificateDetails, db *sql.DB, cb *CircuitBreaker, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	batch := make([]*CertificateDetails, 0, dbBatchSize)
	ticker := time.NewTicker(dbBatchTimeout)
	defer ticker.Stop()

	flushBatch := func() {
		if len(batch) == 0 {
			return
		}

		if err := ingestBatchWithRetry(db, batch, cb); err != nil {
			log.Fatalf("Error ingesting batch of %d entries: %v", len(batch), err)
		} else {
			log.Printf("Successfully inserted batch of %d entries", len(batch))
		}
		batch = batch[:0]
	}

	for {
		select {
		case details, ok := <-logChan:
			if !ok {
				flushBatch()
				log.Printf("Database inserter goroutine shutting down")
				return
			}

			batch = append(batch, details)
			if len(batch) >= dbBatchSize {
				flushBatch()
				ticker.Reset(dbBatchTimeout)
			}

		case <-ticker.C:
			flushBatch()

		case <-done:
			// Drain remaining entries from channel with size limit
			for len(batch) < dbBatchSize*2 { // Allow up to 2x batch size during shutdown
				select {
				case details, ok := <-logChan:
					if !ok {
						// Channel closed, flush and exit
						flushBatch()
						log.Printf("Database inserter goroutine shutting down (channel closed)")
						return
					}
					if details != nil {
						batch = append(batch, details)
					}
				default:
					flushBatch()
					log.Printf("Database inserter goroutine shutting down")
					return
				}
			}
			// If we hit the limit, flush and exit
			flushBatch()
			log.Printf("Database inserter goroutine shutting down (batch size limit reached)")
			return
		}
	}
}

func getLatestLogIndex(db *sql.DB, logID string) (int64, error) {
	query := `
		SELECT MAX(log_index) 
		FROM ct_log_entries 
		WHERE log_id = ?
	`

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var maxIndex sql.NullInt64
	err := db.QueryRowContext(ctx, query, logID).Scan(&maxIndex)
	if err != nil {
		if err == sql.ErrNoRows {
			// No records found, start from 0
			return 0, nil
		}
		return 0, fmt.Errorf("failed to fetch latest log index: %w", err)
	}

	if !maxIndex.Valid {
		// NULL result means no records, start from 0
		return 0, nil
	}

	// Resume from the next index after the latest one
	return maxIndex.Int64 + 1, nil
}

func getLatestLogIndexWithRetry(db *sql.DB, logID string, cb *CircuitBreaker) (int64, error) {
	// Check circuit breaker before attempting operation
	if !cb.canExecute() {
		return 0, fmt.Errorf("circuit breaker is open, cannot fetch latest log index")
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		index, err := getLatestLogIndex(db, logID)
		if err == nil {
			cb.recordSuccess()
			return index, nil
		}

		lastErr = err
		log.Printf("Fetching latest log index attempt %d/%d failed: %v",
			attempt+1, maxRetries+1, err)

		// Don't retry on the last attempt
		if attempt == maxRetries {
			break
		}

		// Calculate and apply backoff delay
		delay := calculateBackoffDelay(attempt)
		log.Printf("Retrying latest log index fetch in %v...", delay)
		time.Sleep(delay)
	}

	cb.recordFailure()
	return 0, fmt.Errorf("failed to fetch latest log index after %d attempts: %w", maxRetries+1, lastErr)
}

func main() {
	// Load environment variables from .env file if it exists
	if err := godotenv.Load(); err != nil {
		// Only log as info since .env file is optional
		log.Printf("Info: No .env file found or unable to load .env file: %v", err)
	} else {
		log.Printf("Loaded environment variables from .env file")
	}

	logURLFlag := flag.String("log_url", "", "Base URL of the CT log (e.g., https://ct.googleapis.com/logs/us1/argon2025h2)")
	startIndexFlag := flag.Int64("start_index", -1, "Log entry index to start fetching from (use -1 to resume from latest)")
	batchSizeFlag := flag.Int64("batch_size", defaultBatchSize, "Number of entries to fetch per request")

	flag.Parse()

	if *logURLFlag == "" {
		log.Fatal("Error: -log_url is required")
	}

	// Initialize ClickHouse connection
	db, err := initClickHouse()
	if err != nil {
		log.Fatalf("Failed to initialize ClickHouse connection: %v", err)
	}
	defer db.Close()

	// Initialize circuit breaker
	circuitBreaker := &CircuitBreaker{state: "closed"}
	if *startIndexFlag < -1 {
		log.Fatal("Error: -start_index must be non-negative or -1 for resumption")
	}
	if *batchSizeFlag <= 0 || *batchSizeFlag > 1024 { // Many logs cap batch size
		log.Fatal("Error: -batch_size must be positive and typically not excessively large (e.g., <= 1024)")
	}

	parsedLogURL, err := url.Parse(*logURLFlag)
	if err != nil || (parsedLogURL.Scheme != "http" && parsedLogURL.Scheme != "https") {
		log.Fatalf("Error: Invalid -log_url: %v", err)
	}
	logID := parsedLogURL.Host + parsedLogURL.Path // A simple identifier for the log

	// Create HTTP client with better reliability settings
	client := &http.Client{
		Timeout: requestTimeout,
		Transport: &http.Transport{
			MaxIdleConns:          100,
			MaxIdleConnsPerHost:   10,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
		},
	}

	// Fetch and print current signed tree head
	log.Printf("Fetching current signed tree head from %s", *logURLFlag)
	sth, err := fetchSTH(client, *logURLFlag)
	if err != nil {
		log.Fatalf("Failed to fetch signed tree head: %v", err)
	}

	sthTimestamp := time.Unix(0, sth.Timestamp*int64(time.Millisecond))
	log.Printf("Current Signed Tree Head:")
	log.Printf("  Tree Size: %d", sth.TreeSize)
	log.Printf("  Timestamp: %s", sthTimestamp.UTC())
	log.Printf("  Root Hash: %s", sth.SHA256RootHash)
	log.Printf("  Signature: %s", sth.TreeHeadSignature)

	// Set up graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	done := make(chan struct{})

	// Create channel for sending log entries to background inserter
	logChan := make(chan *CertificateDetails, logChannelBuffer)

	// Start background database inserter goroutine
	var wg sync.WaitGroup
	wg.Add(1)
	go dbInserter(logChan, db, circuitBreaker, done, &wg)

	totalFetched := int64(0)
	var currentIndex int64

	// Handle resumption logic
	if *startIndexFlag == -1 {
		log.Printf("Resumption mode: fetching latest log index for %s", logID)
		latestIndex, err := getLatestLogIndexWithRetry(db, logID, circuitBreaker)
		if err != nil {
			log.Fatalf("Failed to fetch latest log index for resumption: %v", err)
		}
		currentIndex = latestIndex
		log.Printf("Resuming from log index %d", currentIndex)
	} else {
		currentIndex = *startIndexFlag
		log.Printf("Starting from specified log index %d", currentIndex)
	}

	// Channel to signal fetch goroutine completion
	fetchDone := make(chan struct{})

	// Main fetch loop with graceful shutdown handling
	go func() {
		defer close(logChan)
		defer close(fetchDone)

		for {
			select {
			case <-done:
				log.Printf("Received shutdown signal, finishing current batch and shutting down...")
				return
			default:
			}

			currentBatchSize := *batchSizeFlag

			if currentBatchSize == 0 {
				return
			}

			endIndex := currentIndex + currentBatchSize - 1
			log.Printf("Fetching entries from %s: %d to %d (batch size %d)", logID, currentIndex, endIndex, currentBatchSize)

			getEntriesResp, err := fetchEntriesWithRetry(client, *logURLFlag, currentIndex, endIndex)
			if err != nil || len(getEntriesResp.Entries) == 0 {
				// Check if this is an end-of-log condition
				if (getEntriesResp != nil && len(getEntriesResp.Entries) == 0) || strings.Contains(err.Error(), "end_of_log:") {
					log.Printf("Reached end of log at index %d. Polling every %v for new entries...", currentIndex, pollingInterval)
					// Wait and then continue the loop to try again
					select {
					case <-time.After(pollingInterval):
						continue
					case <-done:
						log.Printf("Received shutdown signal during polling, stopping...")
						return
					}
				}
				log.Printf("Error fetching entries %d-%d after all retries: %v", currentIndex, endIndex, err)
				// On fetch error, we'll stop the main loop
				return
			}

			for i, rawEntry := range getEntriesResp.Entries {
				entryActualIndex := currentIndex + int64(i)
				details, err := parseLogEntry(rawEntry, logID, entryActualIndex)
				if err != nil {
					log.Printf("Error parsing log entry at index %d: %v. Skipping.", entryActualIndex, err)
					continue
				}

				// Send to background inserter (non-blocking)
				select {
				case logChan <- details:
					totalFetched++
				case <-done:
					log.Printf("Received shutdown signal during processing, stopping...")
					return
				default:
					log.Printf("Warning: log channel is full, this may slow down fetching")
					logChan <- details
					totalFetched++
				}
			}

			currentIndex += int64(len(getEntriesResp.Entries))
		}
	}()

	// Wait for shutdown signal or fetch goroutine completion
	select {
	case <-sigChan:
		log.Printf("Received shutdown signal")
		close(done)
	case <-fetchDone:
		log.Printf("Fetch goroutine completed")
		close(done)
	}

	// Wait for the background goroutine to finish processing
	log.Printf("Waiting for background database inserter to finish...")
	wg.Wait()

	log.Printf("Finished. Total entries processed: %d", totalFetched)
}
