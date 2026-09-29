import type { Metadata, Viewport } from 'next';
import { Inter, Geist } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'OrderFlow — Next.js Enterprise Hub',
  description: 'Next-generation intelligent e-commerce order management system',
  icons: {
    icon: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { BrandingProvider } from '@/context/BrandingContext';
import { AlertProvider } from '@/context/AlertContext';
import { ConfirmProvider } from '@/context/ConfirmContext';
import { SmoothCursor } from '@/components/ui/smooth-cursor';
import { HexagonPattern } from '@/components/ui/hexagon-pattern';
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('of_theme');if(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');document.documentElement.classList.add('dark');}else{document.documentElement.setAttribute('data-theme','light');document.documentElement.classList.remove('dark');}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen antialiased transition-colors duration-200`}>
        <ThemeProvider>
          <AuthProvider>
            <BrandingProvider>
              <AlertProvider>
                <ConfirmProvider>
                  <SmoothCursor />
                  <div className="relative min-h-screen w-full" suppressHydrationWarning>
                    <HexagonPattern
                      radius={42}
                      gap={8}
                      direction="horizontal"
                      x={-1}
                      y={-1}
                      suppressHydrationWarning
                      className="pointer-events-none absolute inset-0 z-0 h-full w-full stroke-neutral-900/[0.04] dark:stroke-white/[0.035] fill-none opacity-60 md:opacity-100"
                    />
                    <div className="relative z-10 min-h-screen w-full flex flex-col">
                      {children}
                    </div>
                  </div>
                </ConfirmProvider>
              </AlertProvider>
            </BrandingProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
