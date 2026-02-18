import type { Metadata } from "next";
import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata: Metadata = {
  title: "StayCircle",
  description: "Minimal MVP — list and create properties",
};

/**
 * RootLayout
 * - Global HTML skeleton for the Next.js App Router.
 * - Loads Tailwind styles via globals.css and applies base body classes.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
