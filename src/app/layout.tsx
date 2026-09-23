import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tontine",
  description: "Suivi des cotisations, des tours et des remises de votre tontine.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f3d3e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
