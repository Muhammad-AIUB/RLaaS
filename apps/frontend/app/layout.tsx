import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.mjubayer.dev'),
  title: {
    default: 'RLaaS Platform | Modern Rate Limiting Control Plane',
    template: '%s | RLaaS Platform',
  },
  description:
    'A modern RLaaS control plane for managing API keys, rate-limit rules, analytics, audit logs, and gateway protection from one operator dashboard.',
  keywords: [
    'RLaaS',
    'rate limiting',
    'API gateway',
    'NestJS',
    'Next.js',
    'Redis',
    'Prisma',
    'PostgreSQL',
    'operator dashboard',
    'API security',
  ],
  applicationName: 'RLaaS Platform',
  authors: [
    {
      name: 'Muhammad Jubayer',
      url: 'https://www.mjubayer.dev/',
    },
  ],
  creator: 'Muhammad Jubayer',
  publisher: 'Muhammad Jubayer',
  category: 'technology',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'RLaaS Platform',
    title: 'RLaaS Platform | Modern Rate Limiting Control Plane',
    description:
      'Inspect traffic, tune rate-limit rules, issue API keys, and protect production APIs with a clean RLaaS operator console.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RLaaS Platform | Modern Rate Limiting Control Plane',
    description:
      'Inspect traffic, tune rate-limit rules, issue API keys, and protect production APIs with a clean RLaaS operator console.',
    creator: '@mjubayerdev',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f8fafc',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
