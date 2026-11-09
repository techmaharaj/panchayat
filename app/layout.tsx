import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panchayat",
  description: "CFP review grounded in 3,436 real KubeCon talks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
