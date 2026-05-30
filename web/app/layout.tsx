import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bus Arrival Map",
  description: "Singapore bus arrival times on a map",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="m-0 p-0 h-full overflow-hidden">{children}</body>
    </html>
  );
}
