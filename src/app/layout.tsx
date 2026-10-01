import './globals.css'
import type { Metadata } from 'next'
import { Vazirmatn } from 'next/font/google'
import Toaster from '@/components/ui/Toaster'
import SessionActivityProvider from '@/components/auth/SessionActivityProvider'

const vazir = Vazirmatn({
  subsets: ['arabic'],
  variable: '--font-vazir',
})

export const metadata: Metadata = {
  title: 'کفش لند - فروشگاه آنلاین کفش',
  description: 'فروشگاه تخصصی کفش کتانی و رسمی',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl" className={vazir.variable} data-scroll-behavior="smooth">
      <body className="font-body">
        <SessionActivityProvider>
          {children}
          <Toaster />
        </SessionActivityProvider>
      </body>
    </html>
  )
}
