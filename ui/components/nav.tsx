"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
    const path = usePathname();

    return (
        <div className="flex flex-row gap-2">
            <div>
                <Link
                    href="/"
                    className={`block px-3 py-2 rounded-md text-sm text-white hover:text-blue-900 hover:bg-gray-100 ${
                        path === "/"
                            ? "text-shadow-[0.75px_0_0_currentColor]"
                            : "underline"
                    }`}
                >
                    Certificate Transparency
                </Link>
            </div>
            <div>
                <Link
                    href="/sigstore"
                    className={`block px-3 py-2 rounded-md text-sm text-white hover:text-blue-900 hover:bg-gray-100 hidden ${
                        path === "/sigstore"
                            ? "text-shadow-[0.75px_0_0_currentColor]"
                            : "underline"
                    }`}
                >
                    Sigstore
                </Link>
            </div>
        </div>
    );
}
