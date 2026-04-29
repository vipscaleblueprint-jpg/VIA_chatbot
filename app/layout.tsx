import "./globals.css";
import type { Metadata } from "next";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "VIA Assistant",
  description: "Corporate Intelligence Unit AI Assistant",
  icons: {
    icon: "/icon/header.png",
    apple: "/icon/header.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}