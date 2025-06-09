"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SigstoreSearchQuery } from "@/types/sigstore";

interface SigstoreSearchFormProps {
  onSearch?: (query: SigstoreSearchQuery) => void;
  loading?: boolean;
}

export default function SigstoreSearchForm({ onSearch, loading }: SigstoreSearchFormProps) {
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<SigstoreSearchQuery["queryType"]>(
    "x509_san",
  );
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      if (onSearch) {
        onSearch({ query: query.trim(), queryType });
      } else {
        setIsNavigating(true);
        const searchParams = new URLSearchParams({
          type: queryType,
          limit: "100",
        });
        const encodedQuery = encodeURIComponent(query.trim());
        router.push(`/sigstore/search/${encodedQuery}?${searchParams}`);
      }
    }
  };

  const getPlaceholder = () => {
    switch (queryType) {
      case "hash":
        return "Enter data hash (SHA256)...";
      case "email":
        return "Enter email address...";
      case "x509_cn":
        return "Enter X.509 common name...";
      case "x509_san":
        return "Enter X.509 SAN (e.g., example.com)...";
      case "x509_serial":
        return "Enter X.509 serial number...";
      case "pgp_fingerprint":
        return "Enter PGP key fingerprint...";
      case "pgp_email":
        return "Enter PGP signer email...";
      case "data_url":
        return "Enter artifact URL...";
      default:
        return "Enter search query...";
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto mb-12">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-none">
            <select
              value={queryType}
              onChange={(e) =>
                setQueryType(e.target.value as SigstoreSearchQuery["queryType"])}
              className="h-12 px-4 text-sm font-medium rounded-xl border border-gray-300 bg-white text-gray-900 transition-all duration-150 ease-out min-w-[180px] focus:border-blue-500 focus:outline-none"
            >
              <option value="hash">Data Hash</option>
              <option value="email">Any Email</option>
              <option value="x509_cn">X.509 Common Name</option>
              <option value="x509_san">X.509 SAN</option>
              <option value="x509_serial">X.509 Serial</option>
              <option value="pgp_fingerprint">PGP Fingerprint</option>
              <option value="pgp_email">PGP Email</option>
              <option value="data_url">Artifact URL</option>
            </select>
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={getPlaceholder()}
              className="w-full h-12 px-4 text-sm rounded-xl border border-gray-300 bg-white text-gray-900 transition-all duration-150 ease-out focus:border-blue-500 focus:outline-none"
              disabled={loading || isNavigating}
            />
          </div>
          <div className="flex-none">
            <button
              type="submit"
              disabled={loading || isNavigating || !query.trim()}
              className="w-full lg:w-auto h-12 px-8 text-sm font-medium rounded-xl transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading || isNavigating
                ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </div>
                )
                : (
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    Search
                  </div>
                )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}