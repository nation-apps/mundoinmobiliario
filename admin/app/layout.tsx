import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Condensed } from "next/font/google";
import "./globals.css";

const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-saira",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Panel | Mundo Motos",
    template: "%s | Mundo Motos",
  },
  description: "Panel de administración del bot de WhatsApp, Messenger e Instagram de Mundo Motos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${saira.variable} ${plex.variable} ${plexMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
