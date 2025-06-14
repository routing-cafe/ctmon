"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SigstoreSearchQuery } from "@/types/sigstore";

interface SigstoreSearchFormProps {
  onSearch?: (query: SigstoreSearchQuery) => void;
  loading?: boolean;
}

export default function SigstoreSearchForm(
  { onSearch, loading }: SigstoreSearchFormProps,
) {
  const [query, setQuery] = useState("");
  const [queryType, setQueryType] = useState<SigstoreSearchQuery["queryType"]>(
    "github_repository",
  );
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      if (queryType === "entry_uuid") {
        setIsNavigating(true);
        router.push(`/sigstore/entry/${encodeURIComponent(query.trim())}`);
      } else if (onSearch) {
        onSearch({ query: query.trim(), queryType });
      } else {
        setIsNavigating(true);
        const searchParams = new URLSearchParams({
          type: queryType,
          limit: "1000",
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
      case "x509_san":
        return "Enter X.509 SAN (e.g., example.com)...";
      case "pgp_fingerprint":
        return "Enter PGP key fingerprint...";
      case "pgp_email":
        return "Enter PGP signer email...";
      case "entry_uuid":
        return "Enter entry UUID...";
      case "github_repository":
        return "Enter GitHub repository (e.g., owner/repo)...";
      case "github_organization":
        return "Enter GitHub organization (e.g., microsoft)...";
      default:
        return "Enter search query...";
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
                placeholder={getPlaceholder()}
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
              onChange={(e) => setQueryType(
                e.target.value as SigstoreSearchQuery["queryType"],
              )}
              className="focus:ring-offset-0 focus:ring-0 focus:outline-none"
              onFocus={(e) => e.target.style.borderColor = "var(--primary)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border)"}
            >
              <option value="hash">Data Hash</option>
              <option value="x509_san">X.509 SAN</option>
              <option value="pgp_fingerprint">PGP Fingerprint</option>
              <option value="pgp_email">PGP Email</option>
              <option value="entry_uuid">Entry UUID</option>
              <option value="github_repository">GitHub Repository</option>
              <option value="github_organization">GitHub Organization</option>
            </select>
          </div>
        </div>
      </form>
    </div>
  );
}
