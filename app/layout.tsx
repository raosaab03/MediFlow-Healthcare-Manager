import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediFlow Healthcare Appointment Manager",
  description: "Connected healthcare appointments, AI visit briefs, and care continuity intelligence for patients, doctors, and clinic administrators.",
  openGraph: { title: "MediFlow Healthcare Appointment Manager", description: "Connected care for patients, doctors, and clinic administrators.", type: "website" },
  twitter: { card: "summary", title: "MediFlow Healthcare Appointment Manager", description: "Connected care for patients, doctors, and clinic administrators." },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
