import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { LiveWallpaper } from '@/components/ui/LiveWallpaper';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'TransformBiz Credit Lenders Portal',
  description: 'Professional borrowing capacity calculator and credit lending portal for finance professionals',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/*
          Fonts loaded via plain <link> tags (runtime browser fetch) — NOT
          next/font/google, whose build-time fetch can fail on Render. Cabinet
          Grotesk (display) + Satoshi (body) from Fontshare, JetBrains Mono
          (numerals) from Google. globals.css declares system-font fallbacks so
          the app never depends on the font CDN being reachable.
        */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,700,800&f[]=satoshi@400,500,700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <LiveWallpaper />
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
