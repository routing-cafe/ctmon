package main

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/joho/godotenv"
)

// Global compiled regexes for PGP User ID parsing
var (
	emailRegex = regexp.MustCompile(`<([^>]+)>`)
	nameRegex  = regexp.MustCompile(`^([^<(]+)`)
)

// RekorLogInfo represents the current state of the Rekor log
type RekorLogInfo struct {
	RootHash       string              `json:"rootHash"`
	TreeSize       int64               `json:"treeSize"`
	SignedTreeHead string              `json:"signedTreeHead"`
	TreeID         string              `json:"treeID"`
	InactiveShards []InactiveShardInfo `json:"inactiveShards"`
}

type InactiveShardInfo struct {
	RootHash       string `json:"rootHash"`
	TreeSize       int64  `json:"treeSize"`
	SignedTreeHead string `json:"signedTreeHead"`
	TreeID         string `json:"treeID"`
}

// RekorLogEntry represents a single log entry from Rekor
type RekorLogEntry struct {
	LogID          string                 `json:"logID"`
	LogIndex       int64                  `json:"logIndex"`
	Body           string                 `json:"body"`
	IntegratedTime int64                  `json:"integratedTime"`
	Verification   *VerificationInfo      `json:"verification,omitempty"`
	Attestation    map[string]interface{} `json:"attestation,omitempty"`
}

// VerificationInfo contains inclusion proof and signed entry timestamp
type VerificationInfo struct {
	InclusionProof       *InclusionProof `json:"inclusionProof,omitempty"`
	SignedEntryTimestamp string          `json:"signedEntryTimestamp,omitempty"`
}

// InclusionProof represents cryptographic proof of entry inclusion
type InclusionProof struct {
	LogIndex   int64    `json:"logIndex"`
	RootHash   string   `json:"rootHash"`
	TreeSize   int64    `json:"treeSize"`
	Hashes     []string `json:"hashes"`
	Checkpoint string   `json:"checkpoint"`
}

// RekorEntryBody represents the decoded body content of a Rekor entry
type RekorEntryBody struct {
	APIVersion string                 `json:"apiVersion"`
	Kind       string                 `json:"kind"`
	Spec       map[string]interface{} `json:"spec"`
}

// SearchLogQuery represents a request to search Rekor log entries
type SearchLogQuery struct {
	LogIndexes []int64 `json:"logIndexes,omitempty"`
}

// RekorLogEntryDetails contains all parsed data for database insertion
type RekorLogEntryDetails struct {
	TreeID               string    `json:"tree_id"`
	LogIndex             int64     `json:"log_index"`
	EntryUUID            string    `json:"entry_uuid"`
	RetrievalTimestamp   time.Time `json:"retrieval_timestamp"`
	Body                 string    `json:"body"`
	IntegratedTime       time.Time `json:"integrated_time"`
	LogID                string    `json:"log_id"`
	Kind                 string    `json:"kind"`
	APIVersion           string    `json:"api_version"`
	SignatureFormat      string    `json:"signature_format"`
	DataHashAlgorithm    string    `json:"data_hash_algorithm"`
	DataHashValue        string    `json:"data_hash_value"`
	DataURL              string    `json:"data_url"`
	SignatureURL         string    `json:"signature_url"`
	PublicKeyURL         string    `json:"public_key_url"`
	SignedEntryTimestamp string    `json:"signed_entry_timestamp"`
	// Entry type specific fields (removed rpm, tuf, jar, intoto, dsse, cose, rfc3161, helm, alpine)

	// X509 Certificate Fields (for hashedrekord entries with x509 certificates)
	X509CertificateSHA256   string                 `json:"x509_certificate_sha256"`
	X509SubjectDN           string                 `json:"x509_subject_dn"`
	X509SubjectCN           string                 `json:"x509_subject_cn"`
	X509SubjectOrganization []string               `json:"x509_subject_organization"`
	X509SubjectOU           []string               `json:"x509_subject_ou"`
	X509IssuerDN            string                 `json:"x509_issuer_dn"`
	X509IssuerCN            string                 `json:"x509_issuer_cn"`
	X509IssuerOrganization  []string               `json:"x509_issuer_organization"`
	X509IssuerOU            []string               `json:"x509_issuer_ou"`
	X509SerialNumber        string                 `json:"x509_serial_number"`
	X509NotBefore           time.Time              `json:"x509_not_before"`
	X509NotAfter            time.Time              `json:"x509_not_after"`
	X509SANs                []string               `json:"x509_sans"`
	X509SignatureAlgorithm  string                 `json:"x509_signature_algorithm"`
	X509PublicKeyAlgorithm  string                 `json:"x509_public_key_algorithm"`
	X509PublicKeySize       int                    `json:"x509_public_key_size"`
	X509IsCA                bool                   `json:"x509_is_ca"`
	X509KeyUsage            []string               `json:"x509_key_usage"`
	X509ExtendedKeyUsage    []string               `json:"x509_extended_key_usage"`
	X509Extensions          map[string]interface{} `json:"x509_extensions"`

	// PGP Message Fields (for rekord entries with PGP signatures)
	PGPSignatureHash        string   `json:"pgp_signature_hash"`
	PGPPublicKeyFingerprint string   `json:"pgp_public_key_fingerprint"`
	PGPKeyID                string   `json:"pgp_key_id"`
	PGPSignerUserID         string   `json:"pgp_signer_user_id"`
	PGPSignerEmail          string   `json:"pgp_signer_email"`
	PGPSignerName           string   `json:"pgp_signer_name"`
	PGPKeyAlgorithm         string   `json:"pgp_key_algorithm"`
	PGPKeySize              int      `json:"pgp_key_size"`
	PGPSubkeyFingerprints   []string `json:"pgp_subkey_fingerprints"`
}

// ProxyInfo represents a single proxy configuration
type ProxyInfo struct {
	Host     string
	Port     string
	Username string
	Password string
}

// ProxyPool manages a pool of HTTP proxies for load balancing
type ProxyPool struct {
	proxies []ProxyInfo
	current int
	mu      sync.RWMutex
}

// NewProxyPool creates a new proxy pool from a file
func NewProxyPool(filename string) (*ProxyPool, error) {
	if filename == "" {
		return nil, fmt.Errorf("no proxy file specified")
	}

	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to open proxy file %s: %w", filename, err)
	}
	defer file.Close()

	var proxies []ProxyInfo
	scanner := bufio.NewScanner(file)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Split(line, ":")
		if len(parts) != 4 {
			log.Printf("Warning: Invalid proxy format on line %d: %s (expected host:port:username:password)", lineNum, line)
			continue
		}

		proxy := ProxyInfo{
			Host:     parts[0],
			Port:     parts[1],
			Username: parts[2],
			Password: parts[3],
		}
		proxies = append(proxies, proxy)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading proxy file: %w", err)
	}

	if len(proxies) == 0 {
		return nil, fmt.Errorf("no valid proxies found in file %s", filename)
	}

	log.Printf("Loaded %d proxies from %s", len(proxies), filename)
	return &ProxyPool{proxies: proxies}, nil
}

// parseProxyContent parses proxy content from string and returns proxies
func parseProxyContent(content string, source string) ([]ProxyInfo, error) {
	var proxies []ProxyInfo
	scanner := bufio.NewScanner(strings.NewReader(content))
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Split(line, ":")
		if len(parts) != 4 {
			log.Printf("Warning: Invalid proxy format on line %d in %s: %s (expected host:port:username:password)", lineNum, source, line)
			continue
		}

		proxy := ProxyInfo{
			Host:     parts[0],
			Port:     parts[1],
			Username: parts[2],
			Password: parts[3],
		}
		proxies = append(proxies, proxy)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading proxy content from %s: %w", source, err)
	}

	if len(proxies) == 0 {
		return nil, fmt.Errorf("no valid proxies found in %s", source)
	}

	return proxies, nil
}

// fetchProxyListFromURL fetches proxy list from a URL
func fetchProxyListFromURL(proxyURL string) ([]ProxyInfo, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Get(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch proxy list from URL %s: %w", proxyURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch proxy list: HTTP %d from %s", resp.StatusCode, proxyURL)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read proxy list response: %w", err)
	}

	proxies, err := parseProxyContent(string(body), proxyURL)
	if err != nil {
		return nil, err
	}

	log.Printf("Fetched %d proxies from URL %s", len(proxies), proxyURL)
	return proxies, nil
}

// NewProxyPoolFromURL creates a new proxy pool from a URL with automatic refresh
func NewProxyPoolFromURL(proxyURL string, ctx context.Context) (*ProxyPool, error) {
	if proxyURL == "" {
		return nil, fmt.Errorf("no proxy URL specified")
	}

	// Initial fetch
	proxies, err := fetchProxyListFromURL(proxyURL)
	if err != nil {
		return nil, err
	}

	pool := &ProxyPool{proxies: proxies}

	// Start background refresh goroutine
	go func() {
		ticker := time.NewTicker(proxyRefreshInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				newProxies, err := fetchProxyListFromURL(proxyURL)
				if err != nil {
					log.Printf("Warning: Failed to refresh proxy list from %s: %v", proxyURL, err)
					continue
				}

				// Update proxy pool atomically
				pool.mu.Lock()
				oldCount := len(pool.proxies)
				pool.proxies = newProxies
				pool.current = 0 // Reset to start of new list
				newCount := len(pool.proxies)
				pool.mu.Unlock()

				if newCount != oldCount {
					log.Printf("Refreshed proxy list: %d proxies (was %d)", newCount, oldCount)
				}

			case <-ctx.Done():
				log.Printf("Stopping proxy refresh goroutine")
				return
			}
		}
	}()

	return pool, nil
}

// GetNextProxy returns the next proxy in round-robin fashion
func (pp *ProxyPool) GetNextProxy() *ProxyInfo {
	pp.mu.Lock()
	defer pp.mu.Unlock()

	if len(pp.proxies) == 0 {
		return nil
	}

	proxy := &pp.proxies[pp.current]
	pp.current = (pp.current + 1) % len(pp.proxies)
	return proxy
}

// GetProxyURL returns a proxy URL for the given proxy info
func (proxy *ProxyInfo) GetProxyURL() string {
	return fmt.Sprintf("http://%s:%s@%s:%s", proxy.Username, proxy.Password, proxy.Host, proxy.Port)
}

// CreateHTTPClient creates an HTTP client with proxy support
func CreateHTTPClient(proxyPool *ProxyPool) *http.Client {
	transport := &http.Transport{
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		TLSClientConfig:       &tls.Config{},
	}

	// Set up proxy if available
	if proxyPool != nil && len(proxyPool.proxies) > 0 {
		proxy := proxyPool.GetNextProxy()
		if proxy != nil {
			proxyURL, err := url.Parse(proxy.GetProxyURL())
			if err != nil {
				log.Printf("Warning: Failed to parse proxy URL for %s:%s: %v", proxy.Host, proxy.Port, err)
			} else {
				transport.Proxy = http.ProxyURL(proxyURL)
				// Note: Removed individual proxy logging to reduce verbosity
			}
		}
	}
	// If proxyPool is nil or empty, transport.Proxy remains nil (direct connection)

	return &http.Client{
		Timeout:   requestTimeout,
		Transport: transport,
	}
}

const (
	defaultBatchSize    = 10 // Rekor API limit is 10 entries per batch request
	defaultConcurrency  = 20 // Number of concurrent batch fetches
	requestTimeout      = 30 * time.Second
	delayBetweenBatches = 10 * time.Millisecond // Reduced for concurrent fetching
	maxRetries          = 5
	initialRetryDelay   = 1 * time.Second
	maxRetryDelay       = 30 * time.Second
	retryMultiplier     = 2.0
	// Rate limiting specific constants
	initialRateLimitDelay = 1 * time.Second // Initial delay for 429 responses
	maxRateLimitDelay     = 5 * time.Second // Max delay for 429 responses (5 seconds)
	rateLimitMultiplier   = 2.0
	circuitBreakerLimit   = 10
	circuitBreakerTimeout = 60 * time.Second
	dbBatchSize           = 5000
	dbBatchTimeout        = 5 * time.Second
	logChannelBuffer      = 5000             // Increased for concurrent processing
	pollingInterval       = 30 * time.Second // Check for new entries every 30 seconds
	proxyRefreshInterval  = 1 * time.Minute  // Refresh proxy list every minute
	rekorBaseURL          = "https://rekor.sigstore.dev"
	userAgent             = "transparency.cafe (hello@su3.io)"
)

// CircuitBreaker tracks database connection health
type CircuitBreaker struct {
	failureCount int
	lastFailure  time.Time
	state        string // "closed", "open", "half-open"
}

// RateLimitTracker tracks rate limiting state and adaptive concurrency
type RateLimitTracker struct {
	mu                  sync.RWMutex
	rateLimited         bool
	currentConcurrency  int
	originalConcurrency int
	rateLimitCount      int
	lastRateLimit       time.Time
	successfulChunks    int
	lastRecoveryStep    time.Time
}

// NewRateLimitTracker creates a new rate limit tracker
func NewRateLimitTracker(initialConcurrency int) *RateLimitTracker {
	return &RateLimitTracker{
		currentConcurrency:  initialConcurrency,
		originalConcurrency: initialConcurrency,
	}
}

// OnRateLimit called when rate limiting is detected
func (rlt *RateLimitTracker) OnRateLimit() {
	rlt.mu.Lock()
	defer rlt.mu.Unlock()

	rlt.rateLimited = true
	rlt.rateLimitCount++
	rlt.lastRateLimit = time.Now()
	rlt.successfulChunks = 0 // Reset success counter

	// Reduce concurrency by half, minimum 1
	newConcurrency := rlt.currentConcurrency / 2
	if newConcurrency < 1 {
		newConcurrency = 1
	}

	if newConcurrency != rlt.currentConcurrency {
		log.Printf("Rate limit detected: reducing concurrency from %d to %d (rate limit count: %d)",
			rlt.currentConcurrency, newConcurrency, rlt.rateLimitCount)
		rlt.currentConcurrency = newConcurrency
	}
}

// OnSuccess called when individual requests succeed
func (rlt *RateLimitTracker) OnSuccess() {
	// This is called for individual successful requests
	// We don't need to do anything here since we'll handle recovery at the chunk level
}

// OnChunkSuccess called when a complete chunk is processed successfully without rate limits
func (rlt *RateLimitTracker) OnChunkSuccess() {
	rlt.mu.Lock()
	defer rlt.mu.Unlock()

	// If we're rate limited and haven't had recent rate limit errors, start recovering
	if rlt.rateLimited {
		rlt.successfulChunks++

		// Start gradual recovery after some successful chunks
		// Wait a minimum time since last rate limit to ensure stability
		minStabilityPeriod := 15 * time.Second
		successfulChunksNeeded := 2 // Number of successful chunks before attempting recovery

		if time.Since(rlt.lastRateLimit) > minStabilityPeriod && rlt.successfulChunks >= successfulChunksNeeded {
			// Also ensure we don't recover too frequently
			minRecoveryInterval := 10 * time.Second
			if time.Since(rlt.lastRecoveryStep) > minRecoveryInterval {
				// Exponential recovery: double concurrency each step until we reach original
				newConcurrency := rlt.currentConcurrency * 2
				if newConcurrency >= rlt.originalConcurrency {
					newConcurrency = rlt.originalConcurrency
					rlt.rateLimited = false
					rlt.rateLimitCount = 0
					rlt.successfulChunks = 0
					log.Printf("Rate limit recovery complete: restored concurrency to %d", newConcurrency)
				} else {
					log.Printf("Rate limit recovery: exponentially increasing concurrency from %d to %d (after %d successful chunks)",
						rlt.currentConcurrency, newConcurrency, rlt.successfulChunks)
					rlt.successfulChunks = 0 // Reset counter for next recovery step
				}
				rlt.currentConcurrency = newConcurrency
				rlt.lastRecoveryStep = time.Now()
			}
		}
	}
}

// GetCurrentConcurrency returns the current adaptive concurrency
func (rlt *RateLimitTracker) GetCurrentConcurrency() int {
	rlt.mu.RLock()
	defer rlt.mu.RUnlock()
	return rlt.currentConcurrency
}

// IsRateLimited returns whether we're currently in rate limited state
func (rlt *RateLimitTracker) IsRateLimited() bool {
	rlt.mu.RLock()
	defer rlt.mu.RUnlock()
	return rlt.rateLimited
}

// BatchResult represents the result of fetching a batch with ordering information
type BatchResult struct {
	BatchIndex int64                    // Index of this batch in the sequence
	StartIndex int64                    // Starting log index for this batch
	Entries    map[string]RekorLogEntry // The fetched entries
	Error      error                    // Any error that occurred
}

// OrderedBatchCollector collects concurrent batch results in order
type OrderedBatchCollector struct {
	mu           sync.Mutex
	batches      map[int64]*BatchResult
	nextExpected int64
	resultChan   chan *BatchResult
	done         chan struct{}
	closed       bool
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

func calculateBackoffDelay(attempt int) time.Duration {
	delay := time.Duration(float64(initialRetryDelay) * math.Pow(retryMultiplier, float64(attempt)))
	if delay > maxRetryDelay {
		delay = maxRetryDelay
	}
	return delay
}

// calculateRateLimitBackoff calculates exponential backoff for rate limiting (429 responses)
func calculateRateLimitBackoff(attempt int) time.Duration {
	delay := time.Duration(float64(initialRateLimitDelay) * math.Pow(rateLimitMultiplier, float64(attempt)))
	if delay > maxRateLimitDelay {
		delay = maxRateLimitDelay
	}
	return delay
}

// isRateLimitError checks if an error is due to rate limiting (HTTP 429)
func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	errorStr := err.Error()
	return strings.Contains(errorStr, "429") || strings.Contains(errorStr, "Too Many Requests")
}

// NewOrderedBatchCollector creates a new collector for ordered batch results
func NewOrderedBatchCollector() *OrderedBatchCollector {
	return &OrderedBatchCollector{
		batches:      make(map[int64]*BatchResult),
		nextExpected: 0,
		resultChan:   make(chan *BatchResult, 100),
		done:         make(chan struct{}),
	}
}

// AddResult adds a batch result and emits any consecutive results starting from nextExpected
func (obc *OrderedBatchCollector) AddResult(result *BatchResult) {
	obc.mu.Lock()
	defer obc.mu.Unlock()

	// Check if collector is closed
	if obc.closed {
		return
	}

	// Store the result
	obc.batches[result.BatchIndex] = result

	// Emit all consecutive results starting from nextExpected
	for {
		if batch, exists := obc.batches[obc.nextExpected]; exists {
			select {
			case obc.resultChan <- batch:
				delete(obc.batches, obc.nextExpected)
				obc.nextExpected++
			case <-obc.done:
				return
			default:
				// Channel might be closed or full, check if we're shutting down
				if obc.closed {
					return
				}
				// Try again with blocking send
				select {
				case obc.resultChan <- batch:
					delete(obc.batches, obc.nextExpected)
					obc.nextExpected++
				case <-obc.done:
					return
				}
			}
		} else {
			break
		}
	}
}

// GetResults returns the channel for ordered results
func (obc *OrderedBatchCollector) GetResults() <-chan *BatchResult {
	return obc.resultChan
}

// Close closes the collector
func (obc *OrderedBatchCollector) Close() {
	obc.mu.Lock()
	defer obc.mu.Unlock()

	if !obc.closed {
		obc.closed = true
		close(obc.done)
		close(obc.resultChan)
	}
}

// fetchLogInfo gets the current state of the Rekor log
func fetchLogInfo(client *http.Client) (*RekorLogInfo, error) {
	apiURL := fmt.Sprintf("%s/api/v1/log", rekorBaseURL)

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create log info request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get log info from %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("log info request failed with status %s: %s", resp.Status, string(bodyBytes))
	}

	var logInfo RekorLogInfo
	if err := json.NewDecoder(resp.Body).Decode(&logInfo); err != nil {
		return nil, fmt.Errorf("failed to decode log info response: %w", err)
	}
	return &logInfo, nil
}

// calculateTotalLogSize calculates the total size including active tree and all inactive shards
func calculateTotalLogSize(logInfo *RekorLogInfo) int64 {
	totalSize := logInfo.TreeSize
	for _, shard := range logInfo.InactiveShards {
		totalSize += shard.TreeSize
	}
	return totalSize
}

// parseCheckpointTreeID extracts the tree ID from a checkpoint string
func parseCheckpointTreeID(checkpoint string) (string, error) {
	lines := strings.Split(strings.TrimSpace(checkpoint), "\n")
	if len(lines) < 3 {
		return "", fmt.Errorf("invalid checkpoint format: expected at least 3 lines, got %d", len(lines))
	}

	// First line format: "rekor.sigstore.dev - TREE_ID"
	firstLine := lines[0]
	parts := strings.Split(firstLine, " - ")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid checkpoint first line format: %s", firstLine)
	}

	treeID := strings.TrimSpace(parts[1])
	if treeID == "" {
		return "", fmt.Errorf("empty tree ID in checkpoint")
	}

	return treeID, nil
}

// validateCheckpointTreeID validates that the checkpoint tree ID matches the expected tree ID
func validateCheckpointTreeID(checkpoint, expectedTreeID string) error {
	if checkpoint == "" {
		return fmt.Errorf("empty checkpoint")
	}

	checkpointTreeID, err := parseCheckpointTreeID(checkpoint)
	if err != nil {
		return fmt.Errorf("failed to parse checkpoint tree ID: %w", err)
	}

	if checkpointTreeID != expectedTreeID {
		return fmt.Errorf("checkpoint tree ID mismatch: expected %s, got %s", expectedTreeID, checkpointTreeID)
	}

	return nil
}

// calculateInactiveShardTotalSize calculates the total size of all inactive shards
func calculateInactiveShardTotalSize(logInfo *RekorLogInfo) int64 {
	var totalSize int64
	for _, shard := range logInfo.InactiveShards {
		totalSize += shard.TreeSize
	}
	return totalSize
}

// convertTreeIndexToGlobalIndex converts a tree-specific index to global index
func convertTreeIndexToGlobalIndex(treeIndex int64, logInfo *RekorLogInfo) int64 {
	return treeIndex + calculateInactiveShardTotalSize(logInfo)
}

// fetchLogInfoWithRetry wraps fetchLogInfo with retry logic for rate limiting
func fetchLogInfoWithRetry(client *http.Client, rateLimitTracker *RateLimitTracker) (*RekorLogInfo, error) {
	var lastErr error
	rateLimitAttempts := 0

	for attempt := 0; attempt <= maxRetries; attempt++ {
		logInfo, err := fetchLogInfo(client)
		if err == nil {
			// Notify tracker of success
			if rateLimitTracker != nil {
				rateLimitTracker.OnSuccess()
			}
			return logInfo, nil
		}

		lastErr = err
		log.Printf("Log info fetch attempt %d/%d failed: %v", attempt+1, maxRetries+1, err)

		if attempt == maxRetries {
			break
		}

		var delay time.Duration
		if isRateLimitError(err) {
			// Notify tracker of rate limiting
			if rateLimitTracker != nil {
				rateLimitTracker.OnRateLimit()
			}
			// Use longer backoff for rate limiting
			delay = calculateRateLimitBackoff(rateLimitAttempts)
			rateLimitAttempts++
			log.Printf("Rate limit detected on log info fetch, waiting %v before retry (rate limit attempt %d)...", delay, rateLimitAttempts)
		} else {
			// Use normal backoff for other errors
			delay = calculateBackoffDelay(attempt)
			log.Printf("Retrying log info fetch in %v...", delay)
		}

		time.Sleep(delay)
	}

	return nil, fmt.Errorf("failed to fetch log info after %d attempts: %w", maxRetries+1, lastErr)
}

// fetchLogEntriesBatch fetches a batch of log entries by log indexes
func fetchLogEntriesBatch(client *http.Client, logIndexes []int64) (map[string]RekorLogEntry, error) {
	if len(logIndexes) == 0 {
		return make(map[string]RekorLogEntry), nil
	}
	if len(logIndexes) > 10 {
		return nil, fmt.Errorf("batch size cannot exceed 10, got %d", len(logIndexes))
	}

	apiURL := fmt.Sprintf("%s/api/v1/log/entries/retrieve", rekorBaseURL)

	query := SearchLogQuery{
		LogIndexes: logIndexes,
	}

	queryBytes, err := json.Marshal(query)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal search query: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, strings.NewReader(string(queryBytes)))
	if err != nil {
		return nil, fmt.Errorf("failed to create batch request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get entries from %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("batch request failed with status %s: %s", resp.Status, string(bodyBytes))
	}

	// Response is an array of entry objects where each entry has a UUID key
	var response []map[string]RekorLogEntry
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode batch response: %w", err)
	}

	entries := make(map[string]RekorLogEntry)
	for _, entryMap := range response {
		for uuid, entry := range entryMap {
			entries[uuid] = entry
		}
	}

	return entries, nil
}

// fetchLogEntriesBatchWithRetry wraps fetchLogEntriesBatch with retry logic and rate limiting
func fetchLogEntriesBatchWithRetry(client *http.Client, logIndexes []int64, rateLimitTracker *RateLimitTracker) (map[string]RekorLogEntry, error) {
	var lastErr error
	rateLimitAttempts := 0

	for attempt := 0; attempt <= maxRetries; attempt++ {
		entries, err := fetchLogEntriesBatch(client, logIndexes)
		if err == nil {
			// Notify tracker of success
			if rateLimitTracker != nil {
				rateLimitTracker.OnSuccess()
			}
			return entries, nil
		}

		lastErr = err
		log.Printf("Attempt %d/%d failed for batch %v: %v", attempt+1, maxRetries+1, logIndexes, err)

		if attempt == maxRetries {
			break
		}

		var delay time.Duration
		if isRateLimitError(err) {
			// Notify tracker of rate limiting
			if rateLimitTracker != nil {
				rateLimitTracker.OnRateLimit()
			}
			// Use longer backoff for rate limiting
			delay = calculateRateLimitBackoff(rateLimitAttempts)
			rateLimitAttempts++
			log.Printf("Rate limit detected, waiting %v before retry (rate limit attempt %d)...", delay, rateLimitAttempts)
		} else {
			// Use normal backoff for other errors
			delay = calculateBackoffDelay(attempt)
			log.Printf("Retrying in %v...", delay)
		}

		time.Sleep(delay)
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", maxRetries+1, lastErr)
}

// fetchBatchConcurrent fetches a single batch concurrently and sends result to collector
func fetchBatchConcurrent(proxyPool *ProxyPool, batchIndex int64, startIndex int64, logIndexes []int64, collector *OrderedBatchCollector, wg *sync.WaitGroup, ctx context.Context, rateLimitTracker *RateLimitTracker) {
	defer wg.Done()

	// Check for cancellation before starting
	select {
	case <-ctx.Done():
		return
	default:
	}

	// Create a fresh HTTP client with a different proxy for this batch
	client := CreateHTTPClient(proxyPool)

	entries, err := fetchLogEntriesBatchWithRetry(client, logIndexes, rateLimitTracker)
	result := &BatchResult{
		BatchIndex: batchIndex,
		StartIndex: startIndex,
		Entries:    entries,
		Error:      err,
	}

	// Check for cancellation before adding result
	select {
	case <-ctx.Done():
		return
	default:
		collector.AddResult(result)
	}
}

// fetchLogEntriesConcurrent fetches multiple batches concurrently while preserving order
func fetchLogEntriesConcurrent(proxyPool *ProxyPool, startIndex int64, totalEntries int64, batchSize int64, concurrency int, ctx context.Context, rateLimitTracker *RateLimitTracker) (*OrderedBatchCollector, error) {
	if totalEntries <= 0 {
		return nil, fmt.Errorf("no entries to fetch")
	}

	collector := NewOrderedBatchCollector()
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, concurrency)

	batchIndex := int64(0)
	currentIndex := startIndex

	for currentIndex < startIndex+totalEntries {
		// Check for cancellation
		select {
		case <-ctx.Done():
			// Wait for any in-flight requests to complete before closing
			go func() {
				wg.Wait()
				collector.Close()
			}()
			return collector, ctx.Err()
		default:
		}

		// Calculate batch size for this request
		remainingEntries := startIndex + totalEntries - currentIndex
		currentBatchSize := batchSize
		if remainingEntries < currentBatchSize {
			currentBatchSize = remainingEntries
		}

		if currentBatchSize <= 0 {
			break
		}

		// Build array of log indexes for this batch
		var logIndexes []int64
		for i := int64(0); i < currentBatchSize; i++ {
			logIndexes = append(logIndexes, currentIndex+i)
		}

		// Acquire semaphore slot
		select {
		case semaphore <- struct{}{}:
		case <-ctx.Done():
			// Wait for any in-flight requests to complete before closing
			go func() {
				wg.Wait()
				collector.Close()
			}()
			return collector, ctx.Err()
		}

		wg.Add(1)

		// Launch concurrent fetch
		go func(bIdx int64, sIdx int64, idxs []int64) {
			defer func() { <-semaphore }()
			fetchBatchConcurrent(proxyPool, bIdx, sIdx, idxs, collector, &wg, ctx, rateLimitTracker)
		}(batchIndex, currentIndex, logIndexes)

		batchIndex++
		currentIndex += currentBatchSize

		// Small delay to avoid overwhelming the API
		select {
		case <-time.After(delayBetweenBatches):
		case <-ctx.Done():
			// Wait for any in-flight requests to complete before closing
			go func() {
				wg.Wait()
				collector.Close()
			}()
			return collector, ctx.Err()
		}
	}

	// Close collector when all goroutines complete
	go func() {
		wg.Wait()
		collector.Close()
	}()

	return collector, nil
}

// parseEntryBody decodes and parses the base64-encoded entry body
func parseEntryBody(bodyBase64 string) (*RekorEntryBody, error) {
	bodyBytes, err := base64.StdEncoding.DecodeString(bodyBase64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode entry body: %w", err)
	}

	var entryBody RekorEntryBody
	if err := json.Unmarshal(bodyBytes, &entryBody); err != nil {
		return nil, fmt.Errorf("failed to parse entry body JSON: %w", err)
	}

	return &entryBody, nil
}

// parseRekorEntry converts a Rekor API response entry to our database structure
func parseRekorEntry(uuid string, entry RekorLogEntry, treeID string) (*RekorLogEntryDetails, error) {
	// entry.Verification must not be nil
	if entry.Verification == nil {
		log.Fatalf("CRITICAL: entry.Verification is nil for UUID %s at global index %d", uuid, entry.LogIndex)
	}

	// entry.Verification.InclusionProof must not be nil
	if entry.Verification.InclusionProof == nil {
		log.Fatalf("CRITICAL: entry.Verification.InclusionProof is nil for UUID %s at global index %d", uuid, entry.LogIndex)
	}

	// Validate checkpoint tree ID consistency
	checkpoint := entry.Verification.InclusionProof.Checkpoint
	if err := validateCheckpointTreeID(checkpoint, treeID); err != nil {
		return nil, fmt.Errorf("CRITICAL: Checkpoint tree ID validation failed for entry UUID %s at global index %d: %w", uuid, entry.LogIndex, err)
	}

	// Use tree-specific index from inclusion proof, not the global index
	logIndex := entry.Verification.InclusionProof.LogIndex

	details := &RekorLogEntryDetails{
		TreeID:             treeID,
		LogIndex:           logIndex,
		EntryUUID:          uuid,
		RetrievalTimestamp: time.Now().UTC(),
		Body:               entry.Body,
		IntegratedTime:     time.Unix(entry.IntegratedTime, 0).UTC(),
		LogID:              entry.LogID,
	}

	// Parse the entry body to extract type-specific information
	entryBody, err := parseEntryBody(entry.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to parse entry body for UUID %s: %w", uuid, err)
	}

	details.Kind = entryBody.Kind
	details.APIVersion = entryBody.APIVersion

	// Extract common signature and data information from spec
	if spec := entryBody.Spec; spec != nil {
		// Extract signature information
		if sig, ok := spec["signature"].(map[string]interface{}); ok {
			if format, ok := sig["format"].(string); ok {
				details.SignatureFormat = format
			}
		}

		// Extract data hash information
		if data, ok := spec["data"].(map[string]interface{}); ok {
			if hash, ok := data["hash"].(map[string]interface{}); ok {
				if algo, ok := hash["algorithm"].(string); ok {
					details.DataHashAlgorithm = algo
				}
				if value, ok := hash["value"].(string); ok {
					details.DataHashValue = value
				}
			}
			if url, ok := data["url"].(string); ok {
				details.DataURL = url
			}
		}

		// Parse entry type specific fields
		switch entryBody.Kind {
		case "hashedrekord":
			// For hashedrekord entries, try to parse x509 certificates
			parseX509Certificate(spec, details)
		case "rekord":
			// For rekord entries, try to parse PGP signatures
			parsePGPSignature(spec, details)
		}
	}

	// Extract verification information
	if entry.Verification != nil && entry.Verification.SignedEntryTimestamp != "" {
		details.SignedEntryTimestamp = entry.Verification.SignedEntryTimestamp
	}

	return details, nil
}

// parseX509Certificate extracts and parses x509 certificate from hashedrekord entries
func parseX509Certificate(spec map[string]interface{}, details *RekorLogEntryDetails) {
	// For hashedrekord entries, check if there's an x509 certificate in the signature
	if sig, ok := spec["signature"].(map[string]interface{}); ok {
		if pubKey, ok := sig["publicKey"].(map[string]interface{}); ok {
			if certContent, ok := pubKey["content"].(string); ok {
				// Decode the base64 certificate content
				certBytes, err := base64.StdEncoding.DecodeString(certContent)
				if err != nil {
					log.Printf("Warning: Failed to decode certificate content: %v", err)
					return
				}

				// Parse the PEM block
				block, _ := pem.Decode(certBytes)
				if block == nil || block.Type != "CERTIFICATE" {
					return
				}

				// Parse the x509 certificate
				cert, err := x509.ParseCertificate(block.Bytes)
				if err != nil {
					log.Printf("Warning: Failed to parse x509 certificate: %v", err)
					return
				}

				// Extract certificate fields
				hash := sha256.Sum256(cert.Raw)
				details.X509CertificateSHA256 = fmt.Sprintf("%x", hash)
				details.X509SubjectDN = cert.Subject.String()
				details.X509SubjectCN = cert.Subject.CommonName
				details.X509SubjectOrganization = cert.Subject.Organization
				details.X509SubjectOU = cert.Subject.OrganizationalUnit
				details.X509IssuerDN = cert.Issuer.String()
				details.X509IssuerCN = cert.Issuer.CommonName
				details.X509IssuerOrganization = cert.Issuer.Organization
				details.X509IssuerOU = cert.Issuer.OrganizationalUnit
				details.X509SerialNumber = cert.SerialNumber.String()
				details.X509NotBefore = cert.NotBefore
				details.X509NotAfter = cert.NotAfter

				// Extract Subject Alternative Names
				var sans []string
				sans = append(sans, cert.DNSNames...)
				sans = append(sans, cert.EmailAddresses...)
				for _, ip := range cert.IPAddresses {
					sans = append(sans, ip.String())
				}
				for _, uri := range cert.URIs {
					sans = append(sans, uri.String())
				}
				details.X509SANs = sans

				// Extract signature algorithm
				details.X509SignatureAlgorithm = cert.SignatureAlgorithm.String()

				// Extract public key information
				switch pubKey := cert.PublicKey.(type) {
				case *rsa.PublicKey:
					details.X509PublicKeyAlgorithm = "RSA"
					details.X509PublicKeySize = pubKey.Size() * 8
				case *ecdsa.PublicKey:
					details.X509PublicKeyAlgorithm = "ECDSA"
					details.X509PublicKeySize = pubKey.Curve.Params().BitSize
				case ed25519.PublicKey:
					details.X509PublicKeyAlgorithm = "Ed25519"
					details.X509PublicKeySize = 256
				default:
					details.X509PublicKeyAlgorithm = "Unknown"
					details.X509PublicKeySize = 0
				}

				// Extract CA flag
				details.X509IsCA = cert.IsCA

				// Extract key usage
				var keyUsage []string
				if cert.KeyUsage&x509.KeyUsageDigitalSignature != 0 {
					keyUsage = append(keyUsage, "DigitalSignature")
				}
				if cert.KeyUsage&x509.KeyUsageContentCommitment != 0 {
					keyUsage = append(keyUsage, "ContentCommitment")
				}
				if cert.KeyUsage&x509.KeyUsageKeyEncipherment != 0 {
					keyUsage = append(keyUsage, "KeyEncipherment")
				}
				if cert.KeyUsage&x509.KeyUsageDataEncipherment != 0 {
					keyUsage = append(keyUsage, "DataEncipherment")
				}
				if cert.KeyUsage&x509.KeyUsageKeyAgreement != 0 {
					keyUsage = append(keyUsage, "KeyAgreement")
				}
				if cert.KeyUsage&x509.KeyUsageCertSign != 0 {
					keyUsage = append(keyUsage, "CertSign")
				}
				if cert.KeyUsage&x509.KeyUsageCRLSign != 0 {
					keyUsage = append(keyUsage, "CRLSign")
				}
				if cert.KeyUsage&x509.KeyUsageEncipherOnly != 0 {
					keyUsage = append(keyUsage, "EncipherOnly")
				}
				if cert.KeyUsage&x509.KeyUsageDecipherOnly != 0 {
					keyUsage = append(keyUsage, "DecipherOnly")
				}
				details.X509KeyUsage = keyUsage

				// Extract extended key usage
				var extKeyUsage []string
				for _, usage := range cert.ExtKeyUsage {
					switch usage {
					case x509.ExtKeyUsageServerAuth:
						extKeyUsage = append(extKeyUsage, "ServerAuth")
					case x509.ExtKeyUsageClientAuth:
						extKeyUsage = append(extKeyUsage, "ClientAuth")
					case x509.ExtKeyUsageCodeSigning:
						extKeyUsage = append(extKeyUsage, "CodeSigning")
					case x509.ExtKeyUsageEmailProtection:
						extKeyUsage = append(extKeyUsage, "EmailProtection")
					case x509.ExtKeyUsageTimeStamping:
						extKeyUsage = append(extKeyUsage, "TimeStamping")
					case x509.ExtKeyUsageOCSPSigning:
						extKeyUsage = append(extKeyUsage, "OCSPSigning")
					default:
						extKeyUsage = append(extKeyUsage, "Unknown")
					}
				}
				details.X509ExtendedKeyUsage = extKeyUsage

				// Parse all X509v3 extensions
				extensions := make(map[string]interface{})
				for _, ext := range cert.Extensions {
					oidStr := ext.Id.String()
					extData := parseGenericExtension(ext.Value, ext.Critical)
					extensions[oidStr] = extData
				}
				details.X509Extensions = extensions
			}
		}
	}
}

// parseGenericExtension parses any extension generically
func parseGenericExtension(value []byte, critical bool) interface{} {
	result := map[string]interface{}{
		"critical": critical,
		"value":    base64.StdEncoding.EncodeToString(value),
	}

	return result
}

// parsePGPSignature extracts and parses PGP signature and public key from rekord entries
func parsePGPSignature(spec map[string]interface{}, details *RekorLogEntryDetails) {
	// For rekord entries with PGP format, extract and parse PGP signature and public key
	if sig, ok := spec["signature"].(map[string]interface{}); ok {
		if format, ok := sig["format"].(string); ok && format == "pgp" {
			// Extract PGP signature content
			if sigContent, ok := sig["content"].(string); ok {
				// Decode the base64 signature content
				sigBytes, err := base64.StdEncoding.DecodeString(sigContent)
				if err != nil {
					log.Printf("Warning: Failed to decode PGP signature content: %v", err)
					return
				}

				// Calculate hash of the signature
				hash := sha256.Sum256(sigBytes)
				details.PGPSignatureHash = fmt.Sprintf("%x", hash)
			}

			// Extract PGP public key content
			if pubKey, ok := sig["publicKey"].(map[string]interface{}); ok {
				if keyContent, ok := pubKey["content"].(string); ok {
					// Decode the base64 public key content
					keyBytes, err := base64.StdEncoding.DecodeString(keyContent)
					if err != nil {
						log.Printf("Warning: Failed to decode PGP public key content: %v", err)
						return
					}

					// Parse PGP public key to extract metadata
					parsePGPPublicKey(keyBytes, details)
				}
			}
		}
	}
}

// parsePGPPublicKey parses a PGP public key to extract key metadata
func parsePGPPublicKey(keyBytes []byte, details *RekorLogEntryDetails) {
	keyStr := string(keyBytes)

	// Check if it's an ASCII-armored public key
	if strings.Contains(keyStr, "-----BEGIN PGP PUBLIC KEY BLOCK-----") {
		// Decode ASCII armor to get binary packets
		packets, err := decodePGPArmor(keyStr)
		if err != nil {
			log.Printf("Warning: Failed to decode PGP armor: %v", err)
			return
		}

		// Parse the PGP packets
		parsePGPPackets(packets, details)
	}
}

// decodePGPArmor decodes ASCII-armored PGP data to binary packets
func decodePGPArmor(armoredData string) ([]byte, error) {
	// Find the base64 data between the armor headers
	lines := strings.Split(armoredData, "\n")
	var base64Data []string
	inData := false

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "-----BEGIN PGP") {
			inData = true
			continue
		}
		if strings.HasPrefix(line, "-----END PGP") {
			break
		}
		if inData && line != "" && !strings.HasPrefix(line, "Version:") && !strings.HasPrefix(line, "Comment:") && !strings.Contains(line, ":") {
			base64Data = append(base64Data, line)
		}
	}

	if len(base64Data) == 0 {
		return nil, fmt.Errorf("no base64 data found in armor")
	}

	// Join and decode base64 data
	base64String := strings.Join(base64Data, "")

	// Remove the last line which is typically a checksum (starts with =)
	if equalIndex := strings.Index(base64String, "="); equalIndex != -1 && equalIndex < len(base64String)-3 {
		base64String = base64String[:equalIndex]
	}

	return base64.StdEncoding.DecodeString(base64String)
}

// parsePGPPackets parses binary PGP packets to extract key information
func parsePGPPackets(data []byte, details *RekorLogEntryDetails) {
	offset := 0
	var primaryKey *pgpPublicKeyPacket
	var userIDs []string
	var subkeys []string

	for offset < len(data) {
		packet, packetLen, err := parsePGPPacket(data[offset:])
		if err != nil {
			log.Printf("Warning: Failed to parse PGP packet at offset %d: %v", offset, err)
			break
		}

		switch p := packet.(type) {
		case *pgpPublicKeyPacket:
			if primaryKey == nil {
				primaryKey = p
			} else {
				// This is a subkey
				subkeys = append(subkeys, p.fingerprint)
			}
		case *pgpUserIDPacket:
			userIDs = append(userIDs, p.userID)
		}

		offset += packetLen
	}

	// Extract information from primary key
	if primaryKey != nil {
		details.PGPPublicKeyFingerprint = primaryKey.fingerprint
		details.PGPKeyID = primaryKey.keyID
		details.PGPKeyAlgorithm = primaryKey.algorithm
		details.PGPKeySize = primaryKey.keySize
		details.PGPSubkeyFingerprints = subkeys
	}

	// Extract user ID information
	if len(userIDs) > 0 {
		primaryUserID := userIDs[0]
		details.PGPSignerUserID = primaryUserID

		// Parse email and name from user ID
		email, name := parseUserID(primaryUserID)
		details.PGPSignerEmail = email
		details.PGPSignerName = name
	}
}

// pgpPublicKeyPacket represents a parsed PGP public key packet
type pgpPublicKeyPacket struct {
	fingerprint  string
	keyID        string
	algorithm    string
	keySize      int
	creationTime time.Time
}

// pgpUserIDPacket represents a parsed PGP user ID packet
type pgpUserIDPacket struct {
	userID string
}

// parsePGPPacket parses a single PGP packet from binary data
func parsePGPPacket(data []byte) (interface{}, int, error) {
	if len(data) < 1 {
		return nil, 0, fmt.Errorf("insufficient data for packet header")
	}

	// Parse packet header
	header := data[0]
	if (header & 0x80) == 0 {
		return nil, 0, fmt.Errorf("invalid packet header")
	}

	var packetType int
	var lengthType int
	var headerLen int

	if (header & 0x40) != 0 {
		// New format packet header
		packetType = int(header & 0x3f)
		headerLen = 1
	} else {
		// Old format packet header
		packetType = int((header & 0x3c) >> 2)
		lengthType = int(header & 0x03)
		headerLen = 1
	}

	// Parse packet length
	if headerLen >= len(data) {
		return nil, 0, fmt.Errorf("insufficient data for packet length")
	}

	var packetLen int
	var totalLen int

	if (header & 0x40) != 0 {
		// New format length encoding
		if len(data) < 2 {
			return nil, 0, fmt.Errorf("insufficient data for new format length")
		}
		lengthByte := data[1]
		if lengthByte < 192 {
			packetLen = int(lengthByte)
			totalLen = packetLen + 2
		} else if lengthByte < 224 {
			if len(data) < 3 {
				return nil, 0, fmt.Errorf("insufficient data for two-byte length")
			}
			packetLen = int((int(lengthByte)-192)<<8) + int(data[2]) + 192
			totalLen = packetLen + 3
		} else {
			// Partial body length - simplified handling
			packetLen = 1 << (lengthByte & 0x1f)
			totalLen = packetLen + 2
		}
	} else {
		// Old format length encoding
		switch lengthType {
		case 0: // One-byte length
			if len(data) < 2 {
				return nil, 0, fmt.Errorf("insufficient data for one-byte length")
			}
			packetLen = int(data[1])
			totalLen = packetLen + 2
		case 1: // Two-byte length
			if len(data) < 3 {
				return nil, 0, fmt.Errorf("insufficient data for two-byte length")
			}
			packetLen = int(binary.BigEndian.Uint16(data[1:3]))
			totalLen = packetLen + 3
		case 2: // Four-byte length
			if len(data) < 5 {
				return nil, 0, fmt.Errorf("insufficient data for four-byte length")
			}
			packetLen = int(binary.BigEndian.Uint32(data[1:5]))
			totalLen = packetLen + 5
		case 3: // Indeterminate length
			packetLen = len(data) - 1
			totalLen = len(data)
		}
	}

	if totalLen > len(data) {
		return nil, 0, fmt.Errorf("packet length exceeds available data")
	}

	// Extract packet body
	bodyStart := totalLen - packetLen
	packetBody := data[bodyStart:totalLen]

	// Parse specific packet types
	switch packetType {
	case 6: // Public key packet
		key, err := parsePublicKeyPacket(packetBody)
		if err != nil {
			return nil, totalLen, fmt.Errorf("failed to parse public key packet: %v", err)
		}
		return key, totalLen, nil
	case 14: // Public subkey packet
		key, err := parsePublicKeyPacket(packetBody)
		if err != nil {
			return nil, totalLen, fmt.Errorf("failed to parse public subkey packet: %v", err)
		}
		return key, totalLen, nil
	case 13: // User ID packet
		if len(packetBody) == 0 {
			return nil, totalLen, fmt.Errorf("empty user ID packet")
		}
		return &pgpUserIDPacket{userID: string(packetBody)}, totalLen, nil
	default:
		// Skip unknown packet types
		return nil, totalLen, nil
	}
}

// parsePublicKeyPacket parses a PGP public key packet
func parsePublicKeyPacket(data []byte) (*pgpPublicKeyPacket, error) {
	if len(data) < 6 {
		return nil, fmt.Errorf("insufficient data for public key packet")
	}

	// Parse version (1 byte)
	version := data[0]
	if version != 4 {
		return nil, fmt.Errorf("unsupported key version: %d", version)
	}

	// Parse creation time (4 bytes)
	creationTimestamp := binary.BigEndian.Uint32(data[1:5])
	creationTime := time.Unix(int64(creationTimestamp), 0)

	// Parse algorithm (1 byte)
	algorithm := data[5]

	var algorithmName string
	var keySize int

	offset := 6

	switch algorithm {
	case 1: // RSA Encrypt or Sign
		algorithmName = "RSA"
		if len(data) < offset+2 {
			return nil, fmt.Errorf("insufficient data for RSA key")
		}
		nLen := binary.BigEndian.Uint16(data[offset : offset+2])
		keySize = int(nLen)

	case 17: // DSA
		algorithmName = "DSA"
		if len(data) < offset+2 {
			return nil, fmt.Errorf("insufficient data for DSA key")
		}
		pLen := binary.BigEndian.Uint16(data[offset : offset+2])
		keySize = int(pLen)

	case 18: // ECDH
		algorithmName = "ECDH"
		keySize = 256 // Default for ECDH

	case 19: // ECDSA
		algorithmName = "ECDSA"
		keySize = 256 // Default for ECDSA

	case 22: // EdDSA
		algorithmName = "EdDSA"
		keySize = 256 // Ed25519

	default:
		algorithmName = fmt.Sprintf("Unknown(%d)", algorithm)
		keySize = 0
	}

	// Calculate fingerprint (SHA-1 of the key packet)
	hasher := sha256.New()
	hasher.Write([]byte{0x99}) // Key packet prefix
	hasher.Write([]byte{byte(len(data) >> 8), byte(len(data))})
	hasher.Write(data)
	fingerprint := fmt.Sprintf("%x", hasher.Sum(nil))

	// Key ID is the last 8 bytes of fingerprint
	keyID := fingerprint[len(fingerprint)-16:]

	return &pgpPublicKeyPacket{
		fingerprint:  fingerprint,
		keyID:        keyID,
		algorithm:    algorithmName,
		keySize:      keySize,
		creationTime: creationTime,
	}, nil
}

// parseUserID extracts email and name from a PGP User ID string
func parseUserID(userID string) (email, name string) {
	// User ID format is typically "Name (Comment) <email@domain.com>"

	// Extract email using pre-compiled regex
	emailMatches := emailRegex.FindStringSubmatch(userID)
	if len(emailMatches) > 1 {
		email = emailMatches[1]
	}

	// Extract name (everything before the email or comment)
	nameMatches := nameRegex.FindStringSubmatch(userID)
	if len(nameMatches) > 1 {
		name = strings.TrimSpace(nameMatches[1])
	}

	return email, name
}

// initClickHouse initializes ClickHouse database connection
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

// nullableString returns nil for empty strings, string otherwise
func nullableString(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// nullableTime returns nil for zero time values, time otherwise
func nullableTime(t time.Time) interface{} {
	if t.IsZero() {
		return nil
	}
	return t
}

// nullableInt returns nil for zero values, int otherwise
func nullableInt(i int) interface{} {
	if i == 0 {
		return nil
	}
	return i
}

// ensureStringSlice ensures a string slice is never nil (returns empty slice instead)
func ensureStringSlice(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// serializeExtensions converts extensions map to JSON string for database storage
func serializeExtensions(extensions map[string]interface{}) string {
	if len(extensions) == 0 {
		return ""
	}

	jsonBytes, err := json.Marshal(extensions)
	if err != nil {
		log.Printf("Warning: Failed to serialize X509 extensions: %v", err)
		return ""
	}

	return string(jsonBytes)
}

// serializePGPPreferences converts PGP preferences map to JSON string for database storage
func serializePGPPreferences(preferences map[string]interface{}) string {
	if len(preferences) == 0 {
		return ""
	}

	jsonBytes, err := json.Marshal(preferences)
	if err != nil {
		log.Printf("Warning: Failed to serialize PGP preferences: %v", err)
		return ""
	}

	return string(jsonBytes)
}

// getInsertColumns returns the ordered list of column names for the insert
func getInsertColumns() []string {
	return []string{
		"tree_id", "log_index", "entry_uuid", "retrieval_timestamp", "body", "integrated_time", "log_id",
		"kind", "api_version", "signature_format",
		"data_hash_algorithm", "data_hash_value", "data_url", "signature_url", "public_key_url",
		"signed_entry_timestamp",
		"x509_certificate_sha256", "x509_subject_dn", "x509_subject_cn",
		"x509_subject_organization", "x509_subject_ou", "x509_issuer_dn", "x509_issuer_cn",
		"x509_issuer_organization", "x509_issuer_ou", "x509_serial_number", "x509_not_before",
		"x509_not_after", "x509_sans", "x509_signature_algorithm", "x509_public_key_algorithm",
		"x509_public_key_size", "x509_is_ca", "x509_key_usage", "x509_extended_key_usage",
		"x509_extensions",
		"pgp_signature_hash", "pgp_public_key_fingerprint", "pgp_key_id", "pgp_signer_user_id",
		"pgp_signer_email", "pgp_signer_name", "pgp_key_algorithm", "pgp_key_size",
		"pgp_subkey_fingerprints",
	}
}

// extractValues returns the ordered list of values for a RekorLogEntryDetails
func extractValues(details *RekorLogEntryDetails) []interface{} {
	return []interface{}{
		details.TreeID,
		details.LogIndex,
		details.EntryUUID,
		details.RetrievalTimestamp,
		details.Body,
		details.IntegratedTime,
		details.LogID,
		details.Kind,
		details.APIVersion,
		nullableString(details.SignatureFormat),
		nullableString(details.DataHashAlgorithm),
		nullableString(details.DataHashValue),
		nullableString(details.DataURL),
		nullableString(details.SignatureURL),
		nullableString(details.PublicKeyURL),
		nullableString(details.SignedEntryTimestamp),
		nullableString(details.X509CertificateSHA256),
		nullableString(details.X509SubjectDN),
		nullableString(details.X509SubjectCN),
		ensureStringSlice(details.X509SubjectOrganization),
		ensureStringSlice(details.X509SubjectOU),
		nullableString(details.X509IssuerDN),
		nullableString(details.X509IssuerCN),
		ensureStringSlice(details.X509IssuerOrganization),
		ensureStringSlice(details.X509IssuerOU),
		nullableString(details.X509SerialNumber),
		nullableTime(details.X509NotBefore),
		nullableTime(details.X509NotAfter),
		ensureStringSlice(details.X509SANs),
		nullableString(details.X509SignatureAlgorithm),
		nullableString(details.X509PublicKeyAlgorithm),
		nullableInt(details.X509PublicKeySize),
		details.X509IsCA,
		ensureStringSlice(details.X509KeyUsage),
		ensureStringSlice(details.X509ExtendedKeyUsage),
		serializeExtensions(details.X509Extensions),
		nullableString(details.PGPSignatureHash),
		nullableString(details.PGPPublicKeyFingerprint),
		nullableString(details.PGPKeyID),
		nullableString(details.PGPSignerUserID),
		nullableString(details.PGPSignerEmail),
		nullableString(details.PGPSignerName),
		nullableString(details.PGPKeyAlgorithm),
		nullableInt(details.PGPKeySize),
		ensureStringSlice(details.PGPSubkeyFingerprints),
	}
}

// ingestBatch inserts a batch of Rekor entries into ClickHouse
func ingestBatch(db *sql.DB, batch []*RekorLogEntryDetails) error {
	if len(batch) == 0 {
		return nil
	}

	columns := getInsertColumns()

	// Build the INSERT statement
	query := fmt.Sprintf("INSERT INTO rekor_log_entries (%s) VALUES", strings.Join(columns, ", "))

	var values []string
	var args []interface{}

	// Generate placeholders and collect values
	placeholders := make([]string, len(columns))
	for i := range placeholders {
		placeholders[i] = "?"
	}
	placeholderRow := "(" + strings.Join(placeholders, ", ") + ")"

	for _, details := range batch {
		values = append(values, placeholderRow)
		args = append(args, extractValues(details)...)
	}

	query += " " + strings.Join(values, ", ")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to insert batch of %d Rekor entries: %w", len(batch), err)
	}

	return nil
}

// ingestBatchWithRetry wraps ingestBatch with retry logic and circuit breaker
func ingestBatchWithRetry(db *sql.DB, batch []*RekorLogEntryDetails, cb *CircuitBreaker) error {
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

// dbInserter handles background database insertion with batching
func dbInserter(logChan <-chan *RekorLogEntryDetails, db *sql.DB, cb *CircuitBreaker, done <-chan struct{}, wg *sync.WaitGroup) {
	defer wg.Done()

	batch := make([]*RekorLogEntryDetails, 0, dbBatchSize)
	ticker := time.NewTicker(dbBatchTimeout)
	defer ticker.Stop()

	flushBatch := func() {
		if len(batch) == 0 {
			return
		}

		if err := ingestBatchWithRetry(db, batch, cb); err != nil {
			log.Fatalf("Error ingesting batch of %d entries: %v", len(batch), err)
		} else {
			log.Printf("Successfully inserted batch of %d Rekor entries", len(batch))
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

// getLatestLogIndex retrieves the latest log index for the given tree ID
func getLatestLogIndex(db *sql.DB, treeID string) (int64, error) {
	query := `
		SELECT MAX(log_index) 
		FROM rekor_log_entries 
		WHERE tree_id = ?
	`

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var maxIndex sql.NullInt64
	err := db.QueryRowContext(ctx, query, treeID).Scan(&maxIndex)
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

// getLatestLogIndexWithRetry wraps getLatestLogIndex with retry logic
func getLatestLogIndexWithRetry(db *sql.DB, treeID string, cb *CircuitBreaker) (int64, error) {
	if !cb.canExecute() {
		return 0, fmt.Errorf("circuit breaker is open, cannot fetch latest log index")
	}

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		index, err := getLatestLogIndex(db, treeID)
		if err == nil {
			cb.recordSuccess()
			return index, nil
		}

		lastErr = err
		log.Printf("Fetching latest log index attempt %d/%d failed: %v",
			attempt+1, maxRetries+1, err)

		if attempt == maxRetries {
			break
		}

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
		log.Printf("Info: No .env file found or unable to load .env file: %v", err)
	} else {
		log.Printf("Loaded environment variables from .env file")
	}

	startIndexFlag := flag.Int64("start_index", -1, "Log entry index to start fetching from (use -1 to resume from latest)")
	batchSizeFlag := flag.Int64("batch_size", defaultBatchSize, "Number of entries to fetch per request (max 10)")
	concurrencyFlag := flag.Int("concurrency", defaultConcurrency, "Number of concurrent batch fetches")
	proxyFileFlag := flag.String("proxy_file", "", "Path to proxy list file (format: host:port:username:password)")
	proxyURLFlag := flag.String("proxy_list_url", "", "URL to fetch proxy list from (format: host:port:username:password, refreshed every minute)")

	flag.Parse()

	if *startIndexFlag < -1 {
		log.Fatal("Error: -start_index must be non-negative or -1 for resumption")
	}
	if *batchSizeFlag <= 0 || *batchSizeFlag > 10 {
		log.Fatal("Error: -batch_size must be positive and at most 10 (Rekor API limit)")
	}
	if *concurrencyFlag <= 0 || *concurrencyFlag > 500 {
		log.Fatal("Error: -concurrency must be positive and at most 500 (to avoid overwhelming the API)")
	}
	if *proxyFileFlag != "" && *proxyURLFlag != "" {
		log.Fatal("Error: cannot specify both -proxy_file and -proxy_list_url, choose one")
	}

	// Initialize ClickHouse connection
	db, err := initClickHouse()
	if err != nil {
		log.Fatalf("Failed to initialize ClickHouse connection: %v", err)
	}
	defer db.Close()

	// Initialize circuit breaker and rate limit tracker
	circuitBreaker := &CircuitBreaker{state: "closed"}
	rateLimitTracker := NewRateLimitTracker(*concurrencyFlag)

	// Initialize proxy pool
	var proxyPool *ProxyPool
	var proxyRefreshCancel context.CancelFunc
	if *proxyFileFlag != "" {
		var err error
		proxyPool, err = NewProxyPool(*proxyFileFlag)
		if err != nil {
			log.Fatalf("Failed to initialize proxy pool from file: %v", err)
		}
		log.Printf("Proxy mode enabled (file): each concurrent batch will use a different proxy from the pool")
	} else if *proxyURLFlag != "" {
		// Set up context for proxy refresh that will be cancelled on shutdown
		var ctx context.Context
		ctx, proxyRefreshCancel = context.WithCancel(context.Background())
		var err error
		proxyPool, err = NewProxyPoolFromURL(*proxyURLFlag, ctx)
		if err != nil {
			log.Fatalf("Failed to initialize proxy pool from URL: %v", err)
		}
		log.Printf("Proxy mode enabled (URL): each concurrent batch will use a different proxy from the pool (refreshed every %v)", proxyRefreshInterval)
	} else {
		proxyPool = nil
		log.Printf("Direct connection mode: no proxies configured")
	}

	// Create HTTP client for initial log info fetch (uses first proxy if available)
	client := CreateHTTPClient(proxyPool)

	// Fetch and print current log info
	log.Printf("Fetching current Rekor log info from %s", rekorBaseURL)
	logInfo, err := fetchLogInfoWithRetry(client, rateLimitTracker)
	if err != nil {
		log.Fatalf("Failed to fetch log info: %v", err)
	}

	totalLogSize := calculateTotalLogSize(logInfo)
	log.Printf("Current Rekor Log Info:")
	log.Printf("  Tree ID: %s", logInfo.TreeID)
	log.Printf("  Tree Size: %d", logInfo.TreeSize)
	log.Printf("  Total Log Size (including inactive shards): %d", totalLogSize)
	log.Printf("  Root Hash: %s", logInfo.RootHash)
	for i, shard := range logInfo.InactiveShards {
		log.Printf("  Inactive Shard %d: Tree ID %s, Size %d", i+1, shard.TreeID, shard.TreeSize)
	}

	// Set up graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	done := make(chan struct{})

	// Create channel for sending log entries to background inserter
	logChan := make(chan *RekorLogEntryDetails, logChannelBuffer)

	// Start background database inserter goroutine
	var wg sync.WaitGroup
	wg.Add(1)
	go dbInserter(logChan, db, circuitBreaker, done, &wg)

	totalFetched := int64(0)
	var currentIndex int64

	// Handle resumption logic
	if *startIndexFlag == -1 {
		log.Printf("Resumption mode: fetching latest log index for tree %s", logInfo.TreeID)
		latestTreeIndex, err := getLatestLogIndexWithRetry(db, logInfo.TreeID, circuitBreaker)
		if err != nil {
			log.Fatalf("Failed to fetch latest log index for resumption: %v", err)
		}
		// Convert tree-specific index to global index for API calls
		currentIndex = convertTreeIndexToGlobalIndex(latestTreeIndex, logInfo)
		log.Printf("Resuming from tree index %d (global index %d)", latestTreeIndex, currentIndex)
	} else {
		currentIndex = *startIndexFlag
		log.Printf("Starting from specified global log index %d", currentIndex)
	}

	// Channel to signal fetch goroutine completion
	fetchDone := make(chan struct{})

	// Main fetch loop with concurrent processing and graceful shutdown handling
	go func() {
		defer close(logChan)
		defer close(fetchDone)

		for {
			select {
			case <-done:
				log.Printf("Received shutdown signal, finishing current fetch and shutting down...")
				return
			default:
			}

			// Check if we've reached the end of the log
			totalLogSize := calculateTotalLogSize(logInfo)
			if currentIndex >= totalLogSize {
				log.Printf("Reached end of log at index %d (total size: %d). Polling every %v for new entries...",
					currentIndex, totalLogSize, pollingInterval)

				// Refresh log info to check for new entries
				select {
				case <-time.After(pollingInterval):
					newLogInfo, err := fetchLogInfoWithRetry(client, rateLimitTracker)
					if err != nil {
						log.Printf("Error fetching updated log info: %v", err)
						continue
					}
					logInfo = newLogInfo
					newTotalLogSize := calculateTotalLogSize(logInfo)
					log.Printf("Updated log info: Tree size now %d, total size %d", logInfo.TreeSize, newTotalLogSize)
					continue
				case <-done:
					log.Printf("Received shutdown signal during polling, stopping...")
					return
				}
			}

			// Calculate how many entries to fetch in this round
			remainingEntries := totalLogSize - currentIndex
			if remainingEntries <= 0 {
				continue
			}

			// Get current adaptive concurrency
			currentConcurrency := rateLimitTracker.GetCurrentConcurrency()

			// Fetch multiple batches concurrently, up to a reasonable chunk size
			chunkSize := int64(currentConcurrency) * (*batchSizeFlag)
			if remainingEntries < chunkSize {
				chunkSize = remainingEntries
			}

			log.Printf("Starting concurrent fetch of %d entries from index %d with %d concurrent batches (batch size: %d, rate limited: %v)",
				chunkSize, currentIndex, currentConcurrency, *batchSizeFlag, rateLimitTracker.IsRateLimited())

			// Create context for cancellation
			fetchCtx, fetchCancel := context.WithCancel(context.Background())
			defer fetchCancel() // Ensure context is always cancelled

			// Start concurrent fetching
			collector, err := fetchLogEntriesConcurrent(proxyPool, currentIndex, chunkSize, *batchSizeFlag, currentConcurrency, fetchCtx, rateLimitTracker)
			if err != nil {
				fetchCancel()
				if err == context.Canceled {
					log.Printf("Concurrent fetch was cancelled, stopping...")
					return
				}
				log.Printf("Error starting concurrent fetch: %v", err)
				return
			}

			// Process results in order
			processedInChunk := int64(0)
			var collectorClosed bool
			for batchResult := range collector.GetResults() {
				select {
				case <-done:
					log.Printf("Received shutdown signal during result processing, stopping...")
					fetchCancel() // Cancel any pending fetches
					if !collectorClosed {
						collector.Close()
						collectorClosed = true
					}
					return
				default:
				}

				if batchResult.Error != nil {
					log.Printf("Error in batch %d (starting at %d): %v", batchResult.BatchIndex, batchResult.StartIndex, batchResult.Error)
					// Continue processing other batches, but note the error
					continue
				}

				// Process each entry in the batch in order
				for i := batchResult.StartIndex; i < batchResult.StartIndex+int64(len(batchResult.Entries)); i++ {
					// Find the entry for this index
					var foundEntry *RekorLogEntry
					var foundUUID string
					for uuid, entry := range batchResult.Entries {
						if entry.LogIndex == i {
							foundEntry = &entry
							foundUUID = uuid
							break
						}
					}

					if foundEntry == nil {
						log.Printf("Warning: Entry at index %d not found in batch result", i)
						continue
					}

					details, err := parseRekorEntry(foundUUID, *foundEntry, logInfo.TreeID)
					if err != nil {
						// Check if this is a checkpoint validation failure
						if strings.Contains(err.Error(), "Checkpoint tree ID validation failed") {
							log.Printf("%v", err)
							log.Printf("Gracefully shutting down fetch loop due to checkpoint validation failure")
							fetchCancel() // Cancel any pending fetches
							if !collectorClosed {
								collector.Close()
								collectorClosed = true
							}
							close(done)
							return
						}
						log.Printf("Error parsing Rekor entry UUID %s at index %d: %v. Skipping.", foundUUID, i, err)
						continue
					}

					// Send to background inserter (non-blocking)
					select {
					case logChan <- details:
						totalFetched++
						processedInChunk++
					case <-done:
						log.Printf("Received shutdown signal during processing, stopping...")
						fetchCancel() // Cancel any pending fetches
						if !collectorClosed {
							collector.Close()
							collectorClosed = true
						}
						return
					default:
						log.Printf("Warning: log channel is full, this may slow down fetching")
						logChan <- details
						totalFetched++
						processedInChunk++
					}
				}
			}

			// Clean up fetch context and collector
			fetchCancel()
			if !collectorClosed {
				collector.Close()
			}

			currentIndex += processedInChunk
			log.Printf("Completed concurrent fetch chunk. Processed %d entries, now at index %d", processedInChunk, currentIndex)

			// Notify rate limit tracker of successful chunk completion
			if processedInChunk > 0 {
				rateLimitTracker.OnChunkSuccess()
			}
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

	// Stop proxy refresh goroutine if it was started
	if proxyRefreshCancel != nil {
		proxyRefreshCancel()
	}

	log.Printf("Finished. Total entries processed: %d", totalFetched)
}
