import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GenFrenzy — Live Quiz for the GenLayer Community',
  description: 'The most competitive real-time quiz platform for Genfrens.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
