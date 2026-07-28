import "./globals.css";

export const metadata = {
  title: "SmartThermoSecure",
  description: "Professional IoT monitoring dashboard for temperature and humidity.",
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
