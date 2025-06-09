import SigstoreSearchForm from "@/components/sigstore-search-form";

export default function SigstorePage() {
  return (
    <div className="min-h-full bg-white">
      <div className="container mx-auto px-6 pt-12 max-w-7xl">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
              Sigstore Search
            </h1>
          </div>
          <p className="text-lg font-normal text-gray-600">
            Search and monitor signed artifacts from Sigstore Rekor transparency log
          </p>
        </header>

        <SigstoreSearchForm />
      </div>
    </div>
  );
}