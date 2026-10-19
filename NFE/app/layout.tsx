import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CookieNotice } from "@/components/cookie-notice";

export const metadata: Metadata = {
  applicationName: "Neuravic",
  title: "Neuravic — Intelligent Systems for Complex Operations",
  description:
    "Neuravic combines AI, software, product design and operations to build systems people can actually run.",
  keywords: [
    "Neuravic",
    "AI systems",
    "software platforms",
    "product design",
    "automation",
    "Dubai",
    "Cairo",
  ],
  authors: [{ name: "Neuravic" }],
  creator: "Neuravic",
  publisher: "Neuravic",
  category: "technology",
  icons: {
    icon: "/assets/neuravic-mark.png",
    shortcut: "/assets/neuravic-mark.png",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070A12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://use.typekit.net" />
        <link rel="preconnect" href="https://p.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/okn5dwf.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
