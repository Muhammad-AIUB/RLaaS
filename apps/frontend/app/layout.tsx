import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * Two faces, both doing a job (see DESIGN.md):
 *  - Archivo carries UI and headings
 *  - IBM Plex Mono carries every value that came out of a machine
 * Self-hosted by next/font, so there is no render-blocking CDN request and
 * no flash of fallback text.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ui',
  weight: ['400', '500', '600', '700'],
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e12' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${archivo.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="h-full font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
