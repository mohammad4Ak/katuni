import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ShopMotion from '@/components/shop/ShopMotion'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ShopMotion>
      <Header />
      <main className="min-w-0 flex-1">{children}</main>
      <Footer />
    </ShopMotion>
  )
}
