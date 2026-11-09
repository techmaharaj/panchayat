import type { Metadata } from "next";
import { Sidebar } from "./Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panchayat",
  description: "CFP review grounded in 3,436 real KubeCon talks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main style={{ minWidth: 0 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
