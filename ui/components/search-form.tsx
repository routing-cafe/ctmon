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
          limit: "1000",
        });
        const encodedQuery = encodeURIComponent(query.trim());
        router.push(`/search/${encodedQuery}?${searchParams}`);
      }
    }
  };

  return (
    <div>
      <p className="mb-4 font-bold">Search</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-row gap-3">
            <div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="example.com"
                className="border-b-1 border-white focus:ring-offset-0 focus:ring-0 focus:outline-none font-mono"
                disabled={loading || isNavigating}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={loading || isNavigating || !query.trim()}
                className="cursor-pointer"
              >
                {loading || isNavigating
                  ? (
                    <span className="opacity-50">
                      Searching...
                    </span>
                  )
                  : (
                    <span
                      className={`underline ${
                        query.trim() ? "" : "opacity-50"
                      }`}
                    >
                      Go
                    </span>
                  )}
              </button>
            </div>
          </div>
          <div>
            <select
              value={queryType}
              onChange={(e) =>
                setQueryType(e.target.value as SearchQuery["queryType"])}
              className="focus:ring-offset-0 focus:ring-0 focus:outline-none"
              onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            >
              <option value="domain">Domain/SAN</option>
              <option value="sha256">SHA-256</option>
            </select>
          </div>
        </div>
      </form>
    </div>
  );
}
