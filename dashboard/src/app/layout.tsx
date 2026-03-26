import type { Metadata } from "next";
import { Libre_Baskerville, Libre_Franklin } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-libre-baskerville",
});

const libreFranklin = Libre_Franklin({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-libre-franklin",
});

export const metadata: Metadata = {
  title: "Tokenomics Content System",
  description: "AI-powered content generation dashboard for Tokenomics.net",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${libreBaskerville.variable} ${libreFranklin.variable} tm-shell`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
