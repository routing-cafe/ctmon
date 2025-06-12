import CtStats from "@/components/ct-stats";
import SearchForm from "@/components/search-form";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-full">
      <div className="container px-6 pt-6 max-w-4xl">
        <div className="space-y-8">
          <div className="text-sm flex flex-col gap-2">
            <p>
              Certificate Transparency (CT) is a public logging system that
              records SSL/TLS certificates issued by Certificate Authorities.
              These logs help detect misissued certificates and improve web
              security by making certificate issuance transparent and auditable.
            </p>
            <p>
              Our system continuously ingests and indexes multiple CT logs.
            </p>
          </div>

          <SearchForm />
          <CtStats />
        </div>
      </div>
    </div>
  );
}
