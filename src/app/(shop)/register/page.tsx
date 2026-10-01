'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithSessionLock as signIn } from '@/lib/session-actions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import AuthShell from '@/components/shop/AuthShell'
import styles from '@/components/shop/account.module.css'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('رمز عبور و تکرار آن یکسان نیستند')
      return
    }

    if (formData.password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد')
      return
    }

    setLoading(true)

    try {
      // ثبتنام در دیتابیس
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'خطا در ثبتنام')
        setLoading(false)
        return
      }

      // ورود خودکار پس از ثبتنام
      await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      })

      router.push('/')
      router.refresh()
    } catch {
      setError('خطای ارتباط با سرور')
      setLoading(false)
    }
  }

  return (
    <AuthShell register>
      <h1>شروع یه مسیر تازه.</h1>
      <p className={styles.authIntro}>حسابت رو بساز؛ سفارش‌ها و آدرس‌هات رو یک‌جا داشته باش.</p>
      {error && <div role="alert" className={styles.alert}>{error}</div>}
      <form onSubmit={handleSubmit} className={styles.authForm}>
        <div>
          <label htmlFor="register-name">نام و نام خانوادگی</label>
          <input id="register-name" type="text" autoComplete="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder="نام کامل شما" required />
        </div>
        <div>
          <label htmlFor="register-email">ایمیل</label>
          <input id="register-email" type="email" autoComplete="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="input-field" dir="ltr" placeholder="email@example.com" required />
        </div>
        <div>
          <label htmlFor="register-password">رمز عبور</label>
          <input id="register-password" type="password" autoComplete="new-password" minLength={6} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="input-field" dir="ltr" placeholder="••••••••" aria-describedby="password-hint" required />
          <small id="password-hint">حداقل ۶ کاراکتر انتخاب کن.</small>
        </div>
        <div>
          <label htmlFor="register-confirm">تکرار رمز عبور</label>
          <input id="register-confirm" type="password" autoComplete="new-password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="input-field" dir="ltr" placeholder="••••••••" required />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
          {loading ? 'در حال ساخت حساب…' : 'ساخت حساب'}<ArrowLeft size={18} />
        </button>
      </form>
      <p className={styles.authFooter}>قبلاً ثبت‌نام کردی؟ <Link href="/login">وارد حسابت شو</Link></p>
    </AuthShell>
  )
}
