import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GIKI Admissions Assistant',
  description: 'Chatbot for GIKI undergraduate & graduate admissions queries.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
