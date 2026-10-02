'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Eye, X } from 'lucide-react'
import MultiImageInput from '@/components/admin/MultiImageInput'
import { formatPrice } from '@/lib/utils'
import styles from '@/components/admin/admin.module.css'

interface Product {
  id: string
  name: string
  slug: string
  description: string
  price: number
  images: string[]
  type: 'SNEAKER' | 'FORMAL'
  sizes: number[]
  colors: string[]
  stock: number
  featured: boolean
  categoryId: string
  category: { name: string }
}

const emptyForm = {
  name: '',
  description: '',
  price: '',
  images: [] as string[],
  categoryId: '',
  sizes: '40, 41, 42, 43',
  colors: 'مشکی, سفید',
  stock: '',
  featured: false,
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [originalStock, setOriginalStock] = useState<number | null>(null)
  const [stockConflict, setStockConflict] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProducts() {
      try {
        const responses = await Promise.all([
          fetch('/api/products', { signal: controller.signal, cache: 'no-store' }),
          fetch('/api/categories', { signal: controller.signal, cache: 'no-store' }),
        ])
        const data = await Promise.all(responses.map((response) => response.json().catch(() => null)))
        for (const [index, response] of responses.entries()) {
          if (!response.ok) throw new Error(typeof data[index]?.error === 'string' ? data[index].error : 'دریافت محصولات و دسته‌بندی‌ها انجام نشد.')
          if (!Array.isArray(data[index])) throw new Error('پاسخ محصولات یا دسته‌بندی‌ها معتبر نیست.')
        }
        if (!controller.signal.aborted) {
          setProducts(data[0])
          setCategories(data[1])
          setLoadError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted) setLoadError(cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'ارتباط با سرور برقرار نشد.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadProducts()
    return () => controller.abort()
  }, [reloadKey])

  const openCreateModal = () => {
    setEditingId(null)
    setOriginalStock(null)
    setStockConflict(false)
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' })
    setMessage(null)
    setModalOpen(true)
  }


  const openEditModal = (product: Product) => {
    setEditingId(product.id)
    setOriginalStock(product.stock)
    setStockConflict(false)
    setForm({
      name: product.name,
      description: product.description,
      price: String(product.price),
      images: product.images,
      categoryId: product.categoryId,
      sizes: product.sizes.join(', '),
      colors: product.colors.join(', '),
      stock: String(product.stock),
      featured: product.featured,
    })
    setMessage(null)
    setModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || stockConflict) return
    const sizeText = form.sizes.trim()
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - '۰'.charCodeAt(0)))
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - '٠'.charCodeAt(0)))
    const sizeEntries = sizeText === '' ? [] : sizeText.split(/[,،]/).map((value) => value.trim())
    if (sizeEntries.some((value) => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 2_147_483_647)) {
      setMessage({ text: 'سایزها باید عدد صحیح و بزرگ‌تر از صفر باشند و با کاما جدا شوند؛ مثل ۴۰، ۴۱، ۴۲. سایز اعشاری یا متن نامعتبر ذخیره نمی‌شود.', error: true })
      return
    }
    setSaving(true)
    setMessage(null)

    const payload = {
      name: form.name,
      description: form.description,
      price: Number(form.price),
      images: form.images,
      categoryId: form.categoryId,
      sizes: sizeEntries.map(Number),
      colors: form.colors.split(',').map((c) => c.trim()).filter(Boolean),
      ...(!editingId ? { stock: Number(form.stock) } : Number(form.stock) !== originalStock
        ? { stock: Number(form.stock), expectedStock: originalStock }
        : {}),
      featured: form.featured,
    }

    try {
      const res = await fetch(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'PRODUCT_STOCK_CHANGED') setStockConflict(true)
        setMessage({ text: data.error || 'خطا در ذخیره محصول', error: true })
        return
      }

      setMessage({ text: editingId ? 'محصول ویرایش شد ✓' : 'محصول اضافه شد ✓', error: false })
      setModalOpen(false)
      setLoading(true)
      setReloadKey((value) => value + 1)
    } catch {
      setMessage({ text: 'خطای ارتباط با سرور', error: true })
    } finally {
      setSaving(false)
    }
  }

  const refreshStock = async () => {
    if (!editingId || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(editingId)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'دریافت موجودی تازه انجام نشد.')
      if (!Number.isSafeInteger(data.stock) || data.stock < 0) throw new Error('پاسخ موجودی معتبر نیست.')
      setOriginalStock(data.stock)
      setForm((previous) => ({ ...previous, stock: String(data.stock) }))
      setStockConflict(false)
      setMessage({ text: 'موجودی تازه بارگذاری شد. مقدار موجودی را بررسی کن و سپس تغییرات را ذخیره کن.', error: false })
    } catch (cause) {
      setMessage({ text: cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'دریافت موجودی تازه انجام نشد.', error: true })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('این محصول حذف شود؟')) return
    setMessage(null)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : 'خطا در حذف محصول')
      }
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } catch (cause) {
      setMessage({ text: cause instanceof Error && cause.name !== 'TypeError' ? cause.message : 'ارتباط با سرور برقرار نشد.', error: true })
    }
  }

  const filtered = products.filter((p) => p.name.includes(searchQuery))

  return (
    <div>
      <div className={styles.pageHeader}>
        <div><span className={styles.eyebrow}>ویترین فروشگاه</span><h1>مدیریت محصولات</h1><p>مدل‌ها، قیمت و موجودی را از اینجا مدیریت کن.</p></div>
        <button onClick={openCreateModal} disabled={loading || !!loadError} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          <Plus className="w-5 h-5" />
          محصول جدید
        </button>
      </div>

      {message && !modalOpen && <p role={message.error ? 'alert' : 'status'} className={`px-4 py-3 rounded-2xl mb-6 ${message.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message.text}</p>}

      {/* Search */}
      <div className={styles.searchPanel}>
        <input
          type="text"
          placeholder="جستجو در محصولات..."
          aria-label="جستجو در محصولات"
          className="input-field"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Products Table */}
      <div className={styles.tablePanel}>
        {loading ? (
          <div className="p-12 text-center text-mist">در حال بارگذاری...</div>
        ) : loadError ? (
          <div className="p-12 text-center"><p role="alert" className="text-red-700 mb-4">{loadError}</p><button className="btn-outline" onClick={() => { setLoading(true); setLoadError(''); setReloadKey((value) => value + 1) }}>تلاش دوباره</button></div>
        ) : (
          <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
            <thead className="bg-night text-white">
              <tr>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">نام محصول</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">دسته بندی</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">قیمت</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">موجودی</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">ویژه</th>
                <th className="px-4 py-3 md:px-6 md:py-4 text-right">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((product) => (
                <tr key={product.id} className="hover:bg-fog/30">
                  <td className="px-4 py-3 md:px-6 md:py-4 font-medium">{product.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-brand/10 text-brand rounded-full text-sm">
                      {product.category.name}
                    </span>
                  </td>
                  <td className="px-6 py-4">{formatPrice(product.price)} تومان</td>
                  <td className="px-6 py-4">{product.stock}</td>
                  <td className="px-6 py-4">
                    {product.featured && <span className="text-green-600 font-bold">✓</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/products/${product.slug}`}
                        className="p-2 hover:bg-fog rounded-2xl transition-colors"
                        title="مشاهده در فروشگاه"
                      >
                        <Eye className="w-5 h-5 text-night" />
                      </Link>
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 hover:bg-fog rounded-2xl transition-colors"
                        title="ویرایش"
                      >
                        <Pencil className="w-5 h-5 text-brand" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2 hover:bg-fog rounded-2xl transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-mist">
                    محصولی پیدا نشد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className={styles.dialogBackdrop}>
          <div className={`${styles.dialog} max-w-2xl`} role="dialog" aria-modal="true" aria-label={editingId ? 'ویرایش محصول' : 'محصول جدید'}>
            <div className={styles.dialogHeader}>
              <h2 className="text-xl font-bold">
                {editingId ? 'ویرایش محصول' : 'محصول جدید'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="بستن فرم محصول"
                className="p-2 hover:bg-fog rounded-2xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block font-bold mb-2">نام محصول *</label>
                <input
                  required
                  className="input-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-bold mb-2">توضیحات</label>
                <textarea
                  rows={3}
                  className="input-field"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-2">قیمت (تومان) *</label>
                  <input
                    required
                    type="number"
                    min={0}
                    className="input-field"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-2">موجودی</label>
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-2">دسته بندی *</label>
                  <select
                    required
                    className="input-field"
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  >
                    <option value="" disabled>
                      انتخاب دسته بندی
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-mist mt-1">
                    بهعنوان برچسب روی کارت محصول نمایش داده میشود
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold mb-2">سایزها (با کاما جدا کنید)</label>
                  <input
                    className="input-field"
                    dir="ltr"
                    value={form.sizes}
                    onChange={(e) => setForm({ ...form, sizes: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block font-bold mb-2">رنگها (با کاما جدا کنید)</label>
                  <input
                    className="input-field"
                    value={form.colors}
                    onChange={(e) => setForm({ ...form, colors: e.target.value })}
                  />
                </div>
              </div>

              <MultiImageInput
                images={form.images}
                onChange={(imgs) => setForm((f) => ({ ...f, images: imgs }))}
              />


              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                  className="w-5 h-5 accent-brand"
                />
                <span className="font-medium">نمایش در محصولات ویژه صفحه اصلی</span>
              </label>

              {message && (
                <div
                  role={message.error ? 'alert' : 'status'}
                  className={`px-4 py-3 rounded-2xl ${
                    message.error
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : 'bg-green-50 border border-green-200 text-green-700'
                  }`}
                >
                  {message.text}
                  {stockConflict && <button type="button" onClick={() => void refreshStock()} disabled={saving} className="btn-outline mt-3 block disabled:opacity-50">تازه‌سازی موجودی</button>}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving || stockConflict}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {saving ? 'در حال ذخیره...' : editingId ? 'ذخیره تغییرات' : 'افزودن محصول'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="btn-outline flex-1"
                >
                  انصراف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
