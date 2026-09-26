import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Parallel Test-Gap Hunter',
  description: 'IBM Bob 2.0 hackathon — parallel coverage audit with risk-ranked gaps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
