import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/contexts/auth-context";

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Aaromach Command Center',
  description: 'Aaromach Command Center for operations management.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('aaromach_theme');if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}}catch(e){}` }} />
        {/* sessionStorage is per-tab; restore the signed-in user id from the session cookie so pages opened in a new tab still resolve identity */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(!sessionStorage.getItem('currentUserId')){var m=document.cookie.match(/(?:^|; )aaromach_session=([^;]+)/);if(m&&m[1]){sessionStorage.setItem('currentUserId',decodeURIComponent(m[1]));}}}catch(e){}` }} />
        {/* Apply the user's saved display-font choice before paint (avoids a flash of the default font). AuthProvider keeps this localStorage cache and the account's Firestore value in sync. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var f=localStorage.getItem('aaromach_font');if(f&&f!=='default'){document.documentElement.setAttribute('data-font',f);}}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
