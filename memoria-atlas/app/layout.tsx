import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

// Type system (owner-selected 2026-06-29): Inter = general UI (default),
// IBM Plex Mono = data/label/ID accent, IBM Plex Serif = reading prose.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Project Memoria",
  description: "Project Memoria application foundation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        "font-sans",
        inter.variable,
        plexMono.variable,
        plexSerif.variable
      )}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
