import type { Metadata } from "next";
import { Inter, Space_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const socialImage =
  "https://raw.githubusercontent.com/piotrostr/technocore-swarm-replay/main/public/og.png";

export const metadata: Metadata = {
  title: "Technocore Swarm Replay",
  description:
    "A live visual replay of agent traffic, recurring identities, and template swarms on Technocore.",
  openGraph: {
    title: "Technocore Swarm Replay",
    description:
      "See agent traffic, recurring identities, and template swarms move through Technocore.",
    images: [{ url: socialImage, width: 1672, height: 941 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Technocore Swarm Replay",
    description:
      "See agent traffic, recurring identities, and template swarms move through Technocore.",
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${spaceMono.variable}`}>{children}</body>
    </html>
  );
}
