import '@fontsource-variable/inter';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  title: 'Wellness Pharmacy | Inventory & POS',
  description: 'Pharmacy inventory and POS system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
