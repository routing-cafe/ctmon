"use client";

import { useState, useEffect } from "react";
import { SigstoreEntry, SigstoreSearchQuery } from "@/types/sigstore";

interface QueryStatistics {
  rows_read?: number;
  bytes_read?: number;
  elapsed?: number;
}

interface SigstoreResultsProps {
  query: string;
  queryType: SigstoreSearchQuery["queryType"];
  limit: number;
}

export default function SigstoreResults({ query, queryType, limit }: SigstoreResultsProps) {
  const [entries, setEntries] = useState<SigstoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<QueryStatistics | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams({
          query,
          type: queryType,
          limit: limit.toString(),
        });

        const response = await fetch(`/api/sigstore/search?${params}`);
        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        setEntries(data.entries || []);
        setStatistics(data.statistics || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, queryType, limit]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-600">Searching Sigstore entries...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span className="text-red-800 font-medium">Error</span>
        </div>
        <p className="text-red-700 mt-1">{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No entries found</h3>
          <p className="text-gray-600">Try a different search query or search type.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">
          Found {entries.length} entries
        </h2>
      </div>

      {statistics && (
        <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <h3 className="text-sm font-medium mb-3 text-gray-900">
            Query Statistics
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <span className="block font-medium text-gray-900">Rows Read</span>
              <span>{statistics.rows_read?.toLocaleString() || "N/A"}</span>
            </div>
            <div>
              <span className="block font-medium text-gray-900">Bytes Read</span>
              <span>
                {statistics.bytes_read
                  ? `${(statistics.bytes_read / 1024 / 1024).toFixed(2)} MB`
                  : "N/A"}
              </span>
            </div>
            <div>
              <span className="block font-medium text-gray-900">Elapsed Time</span>
              <span>
                {statistics.elapsed
                  ? `${(statistics.elapsed * 1000).toFixed(0)} ms`
                  : "N/A"}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <SigstoreEntryCard key={`${entry.entry_uuid}-${index}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function SigstoreEntryCard({ entry }: { entry: SigstoreEntry }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const isPgpEntry = entry.pgp_public_key_fingerprint;
  const isX509Entry = entry.x509_certificate_sha256;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-medium text-gray-900">
              {entry.kind} entry
            </h3>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {entry.signature_format}
            </span>
          </div>
          
          <div className="text-sm text-gray-600 space-y-1">
            <div>
              <span className="font-medium">UUID:</span> {entry.entry_uuid}
            </div>
            <div>
              <span className="font-medium">Integrated:</span> {formatDate(entry.integrated_time)}
            </div>
            {entry.data_hash_value && (
              <div>
                <span className="font-medium">Data Hash:</span>{" "}
                <code className="bg-gray-100 px-1 rounded text-xs">
                  {entry.data_hash_algorithm}:{entry.data_hash_value.slice(0, 32)}...
                </code>
              </div>
            )}
          </div>
        </div>
        
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-4 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          {expanded ? "Less" : "More"}
        </button>
      </div>

      {/* Main content based on entry type */}
      {isPgpEntry && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-green-900 mb-2">PGP Signature</h4>
          <div className="text-sm space-y-1">
            {entry.pgp_signer_name && (
              <div><span className="font-medium">Signer:</span> {entry.pgp_signer_name}</div>
            )}
            {entry.pgp_signer_email && (
              <div><span className="font-medium">Email:</span> {entry.pgp_signer_email}</div>
            )}
            <div>
              <span className="font-medium">Key ID:</span>{" "}
              <code className="bg-white px-1 rounded">{entry.pgp_key_id}</code>
            </div>
            <div>
              <span className="font-medium">Fingerprint:</span>{" "}
              <code className="bg-white px-1 rounded text-xs">{entry.pgp_public_key_fingerprint}</code>
            </div>
          </div>
        </div>
      )}

      {isX509Entry && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-blue-900 mb-2">X.509 Certificate</h4>
          <div className="text-sm space-y-1">
            {entry.x509_subject_cn && (
              <div><span className="font-medium">Subject CN:</span> {entry.x509_subject_cn}</div>
            )}
            {entry.x509_issuer_cn && (
              <div><span className="font-medium">Issuer CN:</span> {entry.x509_issuer_cn}</div>
            )}
            <div>
              <span className="font-medium">Serial:</span>{" "}
              <code className="bg-white px-1 rounded">{entry.x509_serial_number}</code>
            </div>
            {entry.x509_not_before && entry.x509_not_after && (
              <div>
                <span className="font-medium">Valid:</span>{" "}
                {formatDate(entry.x509_not_before)} - {formatDate(entry.x509_not_after)}
              </div>
            )}
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-200 pt-4 mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Entry Details</h5>
              <div className="space-y-1 text-gray-600">
                <div><span className="font-medium">Tree ID:</span> {entry.tree_id}</div>
                <div><span className="font-medium">Log Index:</span> {entry.log_index}</div>
                <div><span className="font-medium">API Version:</span> {entry.api_version}</div>
                {entry.data_url && (
                  <div><span className="font-medium">Data URL:</span> {entry.data_url}</div>
                )}
                {entry.signature_url && (
                  <div><span className="font-medium">Signature URL:</span> {entry.signature_url}</div>
                )}
              </div>
            </div>
            
            {isX509Entry && expanded && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">X.509 Extended</h5>
                <div className="space-y-1 text-gray-600">
                  {entry.x509_sans?.length > 0 && (
                    <div>
                      <span className="font-medium">SANs:</span>{" "}
                      {entry.x509_sans.slice(0, 3).join(", ")}
                      {entry.x509_sans.length > 3 && ` (+${entry.x509_sans.length - 3} more)`}
                    </div>
                  )}
                  {entry.x509_signature_algorithm && (
                    <div><span className="font-medium">Signature Alg:</span> {entry.x509_signature_algorithm}</div>
                  )}
                  {entry.x509_public_key_algorithm && (
                    <div>
                      <span className="font-medium">Public Key:</span>{" "}
                      {entry.x509_public_key_algorithm} ({entry.x509_public_key_size} bits)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}