import SigstoreSearchForm from "@/components/sigstore-search-form";
import RekorStats from "@/components/rekor-stats";

export const dynamic = "force-dynamic";

export default function SigstorePage() {
  return (
    <div className="min-h-full">
      <div className="container px-6 pt-6 pb-12 max-w-4xl">
        <div className="space-y-8">
          <div className="text-sm flex flex-col gap-2">
            <p>
              Sigstore is a public transparency log for software signing that
              provides cryptographic signatures and attestations for open source
              software packages. Rekor creates tamper-resistant records of
              metadata about software artifacts.
            </p>
            <p>
              Our system continuously ingests and indexes Sigstore Rekor log
              entries.
            </p>
          </div>

          <SigstoreSearchForm />
          <div>
            <p className="mb-4 font-bold">RSS Feed</p>
            <p>
              <code className="text-sm">
                https://transparency.cafe/api/sigstore/feed/[github_organization]
              </code>
              <br />
              <code className="text-sm">
                https://transparency.cafe/api/sigstore/feed/[github_organization]/[github_repository]
              </code>
            </p>
          </div>
          <RekorStats />
        </div>
      </div>
    </div>
  );
}
