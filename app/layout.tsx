import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Mapwise | BookingPal Internal Mapping", description: "BookingPal internal Supplier API property import, channel mapping, validation, approvals, and audit history." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
