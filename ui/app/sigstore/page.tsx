import SigstoreSearchForm from "@/components/sigstore-search-form";
import RekorStats from "@/components/rekor-stats";

export const dynamic = "force-dynamic";

export default function SigstorePage() {
  return (
    <div className="min-h-full">
      <div className="container px-6 pt-6 max-w-4xl">
        <div className="space-y-8">
          <div className="text-sm flex flex-col gap-2">
            <p>
              Sigstore is a public transparency log for software signing that provides
              cryptographic signatures and attestations for open source software packages.
              Rekor creates tamper-resistant records of metadata about software artifacts.
            </p>
            <p>
              Our system continuously ingests and indexes Sigstore Rekor log entries.
            </p>
          </div>

          <SigstoreSearchForm />
          <RekorStats />
        </div>
      </div>
    </div>
  );
}