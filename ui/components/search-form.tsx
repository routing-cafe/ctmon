"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchQuery } from "@/types/certificate";

interface SearchFormProps {
  onSearch?: (query: SearchQuery) => void;
  loading?: boolean;
}

export default function SearchForm({ onSearch, loading }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<SearchQuery["queryType"]>(
    "domain",
  );
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      // If onSearch is provided, use the old behavior (for backwards compatibility)
      if (onSearch) {
        onSearch({ query: query.trim(), queryType });
      } else {
        // Navigate to search results page
        setIsNavigating(true);
        const searchParams = new URLSearchParams({
          type: queryType,
          limit: "100",
        });
        const encodedQuery = encodeURIComponent(query.trim());
        router.push(`/search/${encodedQuery}?${searchParams}`);
      }
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
                setQueryType(e.target.value as SearchQuery["queryType"])}
              className="h-12 px-4 text-sm font-medium rounded-xl border transition-all duration-150 ease-out min-w-[160px]"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            >
              <option value="domain">Domain/SAN</option>
              <option value="commonName">Common Name</option>
              <option value="serialNumber">Serial Number</option>
              <option value="sha256">SHA-256</option>
              <option value="issuer">Issuer</option>
            </select>
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search query (e.g., example.com, *.example.com)"
              className="w-full h-12 px-4 text-sm rounded-xl border transition-all duration-150 ease-out"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
              disabled={loading || isNavigating}
            />
          </div>
          <div className="flex-none">
            <button
              type="submit"
              disabled={loading || isNavigating || !query.trim()}
              className="w-full lg:w-auto h-12 px-8 text-sm font-medium rounded-xl transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading || isNavigating || !query.trim()
                  ? "var(--muted)"
                  : "var(--primary)",
                color: loading || isNavigating || !query.trim()
                  ? "var(--muted-foreground)"
                  : "var(--primary-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!loading && !isNavigating && query.trim()) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 12px rgb(0 0 0 / 0.15)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
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
