import React from "react";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";import "./globals.css";

// Outfit for all text and headings (font-sans and font-heading both point at it in globals.css).
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shortlist - Job Tracker",
  description: "Track your job applications with ease",
};

const themeInitScript = `
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {/* The script is passed to React as an HTML string, not as a <script> element. React 19
            logs "Encountered a script tag while rendering React component" for a <script> in
            JSX, and next/script's beforeInteractive would run it only after Next's JavaScript
            loads, so a dark-mode user could see the light theme flash first. As part of the
            server HTML, the browser runs it while parsing, before the first paint. */}
        <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${themeInitScript}</script>` }} />
        <div className="flex flex-1">
          {children}
        </div>
      </body>
    </html>
  );
}

