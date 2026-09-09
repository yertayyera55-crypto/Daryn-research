import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ErrorEcho",
  description: "A local prototype for selective, personalized IELTS writing support.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
