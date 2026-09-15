import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tenderat AI Albania",
  description: "Inteligjencë private për tenderat shqiptarë të ndërtimit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="sq"><body>{children}</body></html>;
}
