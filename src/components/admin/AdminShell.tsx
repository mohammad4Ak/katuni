'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingBag,
  Users,
  Store,
  LogOut,
  Truck,
} from 'lucide-react'
import { signOutWithSessionLock as signOut } from '@/lib/session-actions'
import styles from './admin.module.css'
import ShoeLandMark from '@/components/ui/ShoeLandMark'

const adminNav = [
  { href: '/admin', label: 'داشبورد', Icon: LayoutDashboard },
  { href: '/admin/products', label: 'محصولات', Icon: Package },
  { href: '/admin/categories', label: 'دسته‌بندی‌ها', Icon: Tags },
  { href: '/admin/orders', label: 'سفارش‌ها', Icon: ShoppingBag },
  { href: '/admin/shipping', label: 'روش‌های ارسال', Icon: Truck },
  { href: '/admin/users', label: 'کاربران', Icon: Users },
]

export default function AdminShell({
  children,
  userName,
}: {
  children: React.ReactNode
  userName?: string | null
}) {
  const pathname = usePathname()

  return (
    <div className={styles.shell}>
      {/* Top bar */}
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <ShoeLandMark size="100%" />
            </span>
            <span>کفش لند <small>مدیریت فروشگاه</small></span>
          </Link>

          <div className="flex items-center gap-3">
            {userName && (
              <span className={styles.avatar} title={userName}>
                {userName.trim().charAt(0)}
              </span>
            )}
            <Link
              href="/"
              className={styles.storeLink}
              aria-label="مشاهده فروشگاه"
            >
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">فروشگاه</span>
            </Link>
            <button
              onClick={() => signOut({ redirectTo: '/' })}
              aria-label="خروج از حساب"
              title="خروج از حساب"
              className={styles.logout}
            >
              <LogOut className="w-4 h-4 rotate-180" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile horizontal nav */}
      <nav
        aria-label="ناوبری پنل"
        className={styles.mobileNav}
      >
        <div className="flex gap-2 px-4 py-3 w-max">
          {adminNav.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${styles.navLink} ${active ? styles.active : ''}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className={styles.workspace}>
        {/* Desktop sticky sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarInner}>
            <p className={styles.navLabel}>
              فضای مدیریت
            </p>
            <nav className="space-y-2" aria-label="منوی مدیریت">
              {adminNav.map(({ href, label, Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`${styles.navLink} ${active ? styles.active : ''}`}
                  >
                    <Icon className={`w-5 h-5 ${active ? '' : 'opacity-70'}`} />
                    {label}
                  </Link>
                )
              })}
            </nav>

            {/* Footer info */}
            <div className={styles.sidebarNote}>
              <span aria-hidden="true" />
              <p>همه‌چیز برای قدم بعدی.</p>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
