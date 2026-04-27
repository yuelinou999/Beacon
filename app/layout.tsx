import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Beacon — Offline Classroom",
  description:
    "A curriculum-first offline learning system powered by Gemma 4 via Ollama.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface antialiased font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
