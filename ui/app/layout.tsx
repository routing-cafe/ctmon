import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Transparency Search",
  description:
    "Search SSL/TLS certificates and Sigstore entries from transparency logs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex h-screen">
          <nav className="w-64 bg-gray-50 border-r border-gray-200 p-6">
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-gray-900">
                Transparency Search
              </h1>
            </div>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                >
                  Certificate Transparency
                </Link>
              </li>
              <li>
                <Link
                  href="/sigstore"
                  className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                >
                  Sigstore
                </Link>
              </li>
            </ul>
          </nav>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
