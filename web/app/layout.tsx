import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth';
import { TopBar } from '../components/TopBar';

export const metadata: Metadata = {
  title: 'Streamy',
  description: 'A private shared video platform for friend groups.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <TopBar />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
