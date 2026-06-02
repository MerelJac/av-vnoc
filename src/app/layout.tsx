import type { Metadata } from "next";
import "./globals.css";
import { Syne, DM_Sans, Orbitron } from 'next/font/google'

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-syne',
})
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-orbitron',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-sans',
})



export const metadata: Metadata = {
  title: "CallOne NOC",
  description: "CallOne Network Operations Center",
  icons: {
    icon: "/favicon.svg",
  },
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${orbitron.variable} ${dmSans.variable}`}>
      <body
        className="bg-background text-foreground font-sans"
      >
        {children}
      </body>
    </html>
  );
}
