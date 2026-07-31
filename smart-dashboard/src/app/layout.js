import "./globals.css";

export const metadata = {
  title: "SmartTempSystems App",
  description: "SmartTempSystems monitoring application.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
