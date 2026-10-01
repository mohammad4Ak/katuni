'use client'

import { Fragment, useState, useEffect, useCallback } from 'react'
import { Trash2, ChevronDown } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import styles from '@/components/admin/admin.module.css'

interface Order {
  id: string
  total: number
  shippingMethodName: string | null
  shippingCost: number
  status: string
  verified: boolean
  recipientName: string | null
  address: string
  phone: string
  createdAt: string
  user: { name: string; email: string }
  items: { id: string; quantity: number; size: number; color: string; price: number; product: { name: string } }[]
}

const statusLabels: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'در انتظار پرداخت', color: 'bg-yellow-100 text-yellow-700' },
  PROCESSING: { label: 'در حال پردازش', color: 'bg-sky-50 text-sky-700' },
  SHIPPED: { label: 'ارسال شده', color: 'bg-teal-50 text-teal-700' },
  DELIVERED: { label: 'تحویل شده', color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'لغو شده', color: 'bg-red-100 text-red-700' },
}

const allStatuses = Object.keys(statusLabels)
const choicesFor = (status: string) => status === 'DELIVERED' ? ['DELIVERED']
  : status === 'SHIPPED' ? ['SHIPPED', 'DELIVERED']
  : status === 'CANCELLED' ? ['CANCELLED', 'PENDING', 'PROCESSING'] : allStatuses

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busyIds, setBusyIds] = useState<string[]>([])

  const loadOrders = useCallback((signal?: AbortSignal) => fetch('/api/orders', { signal, cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error('سفارش‌ها بارگذاری نشدند. دوباره تلاش کنید.')
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('پاسخ سفارش‌ها معتبر نیست.')
      if (!signal?.aborted) setOrders(data)
    })
    .catch((cause) => { if (!signal?.aborted) setError(cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'خطای ارتباط با سرور') })
    .finally(() => { if (!signal?.aborted) setLoading(false) }), [])

  useEffect(() => {
    const controller = new AbortController()
    void loadOrders(controller.signal)
    return () => controller.abort()
  }, [loadOrders])

  const handleStatusChange = async (id: string, status: string) => {
    setError('')
    setBusyIds((previous) => [...previous, id])
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) await loadOrders()
        throw new Error(data.error || 'خطا در تغییر وضعیت')
      }
      setOrders((prev) => prev.map((order) => order.id === id ? data : order))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خطای ارتباط با سرور')
    } finally {
      setBusyIds((previous) => previous.filter((value) => value !== id))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('این سفارش حذف شود؟')) return

    setError('')
    setBusyIds((previous) => [...previous, id])
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در حذف سفارش')
      setOrders((prev) => prev.filter((o) => o.id !== id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خطای ارتباط با سرور')
    } finally {
      setBusyIds((previous) => previous.filter((value) => value !== id))
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}><div><span className={styles.eyebrow}>از انتخاب تا تحویل</span><h1>مدیریت سفارش‌ها</h1><p>جزئیات خریدها و وضعیت هر سفارش، یک‌جا پیش روی تو.</p></div></div>
      {error && <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button onClick={() => { setError(''); setLoading(true); void loadOrders() }} className="mr-3 underline">بارگذاری دوباره</button></div>}

      <div className={styles.tablePanel}>
        {loading ? (
          <div className="p-12 text-center text-mist">در حال بارگذاری...</div>
        ) : error && orders.length === 0 ? <div className="p-12 text-center text-mist">اطلاعات سفارش‌ها در دسترس نیست.</div> : orders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-xl font-bold mb-2">هنوز سفارشی ثبت نشده</p>
            <p className="text-mist mb-6">سفارشها پس از خرید مشتریان اینجا نمایش داده میشوند</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
            <thead className="bg-night text-white">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">شماره</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">مشتری</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">اقلام</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">مبلغ</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">وضعیت</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">تاریخ</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((order) => (
                <Fragment key={order.id}>
                  <tr className="hover:bg-fog/30">
                    <td className="px-4 py-3 md:px-6 md:py-4 font-mono">#{order.id.slice(-6)}</td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-medium">{order.user.name}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        aria-expanded={expandedId === order.id}
                        className="flex items-center gap-1 hover:text-brand"
                      >
                        {order.items.length} قلم
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === order.id ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 font-bold">{formatPrice(order.total)}<span className={`block text-xs font-normal mt-1 ${order.verified ? 'text-green-700' : 'text-amber-700'}`}>{order.verified ? 'پرداخت تأییدشده' : 'پرداخت تأیید نشده'}</span></td>
                    <td className="px-6 py-4">
                      <select
                        value={order.status}
                        disabled={busyIds.includes(order.id)}
                        aria-label={`وضعیت سفارش ${order.id.slice(-6)}`}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`px-3 py-2 rounded-full text-sm border-none cursor-pointer ${statusLabels[order.status].color}`}
                      >
                        {choicesFor(order.status).map((s) => (
                          <option key={s} value={s}>{s === 'PENDING' && order.verified ? 'در انتظار بررسی' : statusLabels[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 md:px-6 md:py-4 text-mist">
                      {new Date(order.createdAt).toLocaleDateString('fa-IR')}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleDelete(order.id)}
                        disabled={busyIds.includes(order.id) || order.verified || ['SHIPPED', 'DELIVERED'].includes(order.status)}
                        className="p-2 hover:bg-fog rounded-2xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={order.verified || ['SHIPPED', 'DELIVERED'].includes(order.status) ? 'سابقهٔ سفارش پرداخت‌شده یا ارسال‌شده حفظ می‌شود' : 'حذف'}
                        aria-label={`حذف سفارش ${order.id.slice(-6)}`}
                      >
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </button>
                    </td>
                  </tr>
                  {expandedId === order.id && (
                    <tr className="bg-fog/50">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="space-y-2 text-sm">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between">
                              <span>
                                {item.product.name} — سایز {item.size} — رنگ {item.color} × {item.quantity}
                              </span>
                              <span>{formatPrice(item.price * item.quantity)} تومان</span>
                            </div>
                          ))}
                          <div className="border-t border-line pt-3 space-y-2">
                            <p className="flex justify-between gap-3"><span className="text-mist">روش ارسال</span><span>{order.shippingMethodName || 'ثبت نشده'}</span></p>
                            <p className="flex justify-between gap-3"><span className="text-mist">هزینهٔ ارسال</span><span>{order.shippingCost === 0 ? 'رایگان' : `${formatPrice(order.shippingCost)} تومان`}</span></p>
                            <p className="flex justify-between gap-3 font-bold"><span>مجموع سفارش</span><span>{formatPrice(order.total)} تومان</span></p>
                          </div>
                          <div className="border-t border-line pt-2 flex justify-between text-mist">
                            <span>گیرنده: {order.recipientName || order.user.name} | آدرس: {order.address} | تلفن: {order.phone}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                   )}
                 </Fragment>
               ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  )
}
