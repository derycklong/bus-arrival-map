import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./theme-picker.css";
import ServiceWorkerRegister from "@/components/service-worker-register";
import { PRECOMPUTED_THEME_VARS, PRECOMPUTED_DEFAULT_THEME } from "@/lib/precomputed-themes";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bus Arrival Map",
  description: "Singapore bus arrival times on a map",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

const noFlashScript = `
(function(){
  try {
    var db = ${JSON.stringify(PRECOMPUTED_THEME_VARS)};
    var def = ${JSON.stringify(PRECOMPUTED_DEFAULT_THEME)};
    var t = localStorage.getItem('themeId');
    var m = localStorage.getItem('mode');
    if (m !== 'light' && m !== 'dark') m = 'dark';
    if (!t || !db[t]) t = def;
    var vars = db[t] && db[t][m] ? db[t][m] : db[def][m === 'light' ? 'light' : 'dark'];
    var root = document.documentElement;
    root.setAttribute('data-theme', m);
    for (var k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) {
        root.style.setProperty(k, vars[k]);
      }
    }
  } catch (e) { /* noop */ }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${inter.className}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="m-0 p-0 h-full overflow-hidden">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
