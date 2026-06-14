// Root layout for the host-shell app. Next App Router requires a single root
// layout that renders the <html>/<body> shell every route lives inside.

export const metadata = {
  title: "next-auth-bridge — host shell",
  description:
    "Simulated enterprise host that embeds the tenant app as a cross-site iframe.",
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
