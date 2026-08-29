import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ecomply",
  description:
    "An instrument that performs and accounts for compliance evidence work.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <header className="appHeader">
          <div className="container appHeaderInner">
            <a href="/" className="wordmark">
              ecomply
            </a>
          </div>
        </header>
        <main className="container appMain">
          <Breadcrumbs />
          {children}
        </main>
      </body>
    </html>
  );
}
