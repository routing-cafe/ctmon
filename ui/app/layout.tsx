import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Noticia_Text } from "next/font/google";
import "./globals.css";
import Nav from "@/components/nav";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const noticiaText = Noticia_Text({
  variable: "--font-noticia-text",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "transparency.cafe",
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
      <head>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${noticiaText.variable} antialiased`}
      >
        <div className="flex flex-col h-screen bg-black text-white noticia-text-regular">
          <nav className="w-full bg-blue-900 px-4 py-2">
            <div className="flex flex-row text-xs pl-3">
              <p>
                Internet Transparency Looking Glass
              </p>
              <div className="grow"></div>
              <p>
                <Link
                  href="https://routing.cafe"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  routing.cafe
                </Link>
              </p>
            </div>
            <Nav />
          </nav>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
