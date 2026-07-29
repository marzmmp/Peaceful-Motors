import "./globals.css";

export const metadata = {
  title: "Peaceful OS — Estimates & Invoices",
  description: "Peaceful Motors mobile estimate & invoice system. An Ease of Mind is Simply Divine.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Peaceful OS" },
};
export const viewport = { themeColor: "#7A1F1F", width: "device-width", initialScale: 1,
  viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
