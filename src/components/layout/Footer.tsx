import Link from 'next/link'
import { ArrowUpLeft } from 'lucide-react'
import ShoeLandMark from '@/components/ui/ShoeLandMark'

export default function Footer() {
  return (
    <footer className="home-footer">
      <div className="home-footer-top">
        <div className="home-footer-intro" data-reveal>
          <Link href="/" className="home-footer-brand">
            <span className="home-footer-mark" aria-hidden="true"><ShoeLandMark size="100%" variant="light" /></span>
            کفش لند
          </Link>
          <p>برای روزهایی که یک‌جا بند نمی‌شی.</p>
          <span className="home-footer-signature" dir="ltr">MADE FOR YOUR NEXT MOVE.</span>
        </div>
        <div className="home-footer-links" data-reveal data-reveal-delay="1">
          <nav aria-label="پیوندهای پایین صفحه">
            <span className="home-footer-label">کفش لند</span>
            <Link href="/products">همهٔ محصولات</Link>
            <Link href="/about">دربارهٔ ما</Link>
            <Link href="/contact">تماس با ما</Link>
          </nav>
          <nav aria-label="خرید و حساب کاربری">
            <span className="home-footer-label">همراه خریدت</span>
            <Link href="/profile">پیگیری سفارش</Link>
            <Link href="/profile">حساب من</Link>
            <Link href="/cart">سبد خرید</Link>
          </nav>
        </div>
        <Link href="/products" className="home-footer-shop" data-motion="action">
          یه قدم تازه بردار
          <ArrowUpLeft aria-hidden="true" size={20} />
        </Link>
      </div>
      <div className="home-footer-bottom">
        <span>کفش لند · تمامی حقوق محفوظ است.</span>
        <span dir="ltr">SHOELAND / KEEP MOVING</span>
      </div>
    </footer>
  )
}
