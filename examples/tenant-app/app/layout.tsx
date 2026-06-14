// Root layout for the reference tenant app. Next App Router requires a single
// root layout that renders the <html>/<body> shell every route lives inside.

export const metadata = {
  title: "next-auth-bridge — tenant app",
  description:
    "Reference multi-tenant app demonstrating the popup-bridge cross-context sign-in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
