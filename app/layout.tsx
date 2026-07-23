import type { Metadata } from "next";
import { Geist_Mono, Inter, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

// Display face: the brand wordmarks (header + footer). DIN-rounded look.
const mPlusRounded = M_PLUS_Rounded_1c({
  variable: "--font-m-plus-rounded",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Body face.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Mono face: card index numbers and countdown figures.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Race Reminder — Trail Ultra Registration Dates, Deadlines & Lotteries",
  description:
    "A living calendar of trail ultra registrations. Track opening dates, closing deadlines, and lottery draws for UTMB, Western States, Hardrock, and more — sorted by what needs action next.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${mPlusRounded.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
