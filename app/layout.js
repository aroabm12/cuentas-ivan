import "./globals.css";

export const metadata = {
  title: "Mis Cuentas",
  description: "Mi dinero, día a día",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
