import { Suspense } from "react";
import SigstoreResults from "@/components/sigstore-results";
import { SigstoreSearchQuery } from "@/types/sigstore";

interface SigstoreSearchPageProps {
  params: Promise<{ query: string }>;
  searchParams: Promise<{ type?: string; limit?: string }>;
}

export default async function SigstoreSearchPage({
  params,
  searchParams,
}: SigstoreSearchPageProps) {
  const { query } = await params;
  const decodedQuery = decodeURIComponent(query);
  const searchParamsResolved = await searchParams;
  const queryType = searchParamsResolved.type || "x509_san";
  const limit = parseInt(searchParamsResolved.limit || "100", 10);

  return (
    <div className="min-h-full bg-white">
      <div className="container mx-auto px-6 pt-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Sigstore Search Results
          </h1>
          <p className="text-sm text-gray-600">
            Searching for{" "}
            <span className="font-medium text-gray-900">&quot;{decodedQuery}&quot;</span>
            {" "}in{" "}
            <span className="font-medium text-gray-900">{queryType}</span>
          </p>
        </div>

        <Suspense fallback={<div className="text-center py-8">Loading...</div>}>
          <SigstoreResults
            query={decodedQuery}
            queryType={queryType as SigstoreSearchQuery["queryType"]}
            limit={limit}
          />
        </Suspense>
      </div>
    </div>
  );
}