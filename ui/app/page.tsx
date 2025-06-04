import SearchForm from "@/components/search-form";

export default function Home() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="container mx-auto px-6 pt-24 max-w-7xl">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Certificate Search
            </h1>
          </div>
          <p
            className="text-lg font-normal"
            style={{ color: "var(--muted-foreground)" }}
          >
            Search and monitor SSL/TLS certificates from Certificate
            Transparency logs
          </p>
        </header>

        <SearchForm />
      </div>
    </div>
  );
}
