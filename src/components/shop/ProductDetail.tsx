'use client'

import { SneakerIcon } from '@/components/ui/BrandIcons'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Minus, Plus, RotateCcw, ShieldCheck, ShoppingBag, Truck } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { toast } from '@/lib/toast'
import { formatPrice } from '@/lib/utils'
import styles from './commerce.module.css'

interface ApiProduct {
  id: string
  name: string
  slug: string
  description: string
  price: number
  images: string[]
  sizes: number[]
  colors: string[]
  stock: number
  category: { name: string }
}

export default function ProductDetail({ slug }: { slug: string }) {
  const [product, setProduct] = useState<ApiProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSize, setSelectedSize] = useState<number | null>(null)
  const [activeColor, setActiveColor] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [activeImage, setActiveImage] = useState(0)
  const addItem = useCart((state) => state.addItem)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/products/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then((data: ApiProduct) => {
        if (cancelled) return
        setProduct(data)
        setSelectedSize(data.sizes?.includes(42) ? 42 : (data.sizes?.[0] ?? null))
        setActiveColor(data.colors?.[0] ?? '-')
      })
      .catch(() => { if (!cancelled) setProduct(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return <div className={styles.page} aria-busy="true" aria-label="در حال بارگذاری محصول"><div className={styles.detailGrid}>
      <div className={styles.skeleton}><div className={styles.skeletonPhoto} /></div>
      <div className={styles.detailInfo}>{[0, 1, 2, 3, 4].map((i) => <div key={i} className={styles.skeletonText} />)}</div>
    </div></div>
  }

  if (!product) {
    return <div className={styles.page}><div className={styles.empty}>
      <span className={styles.emptyIcon}><SneakerIcon size={36} /></span>
      <h1>این مدل رو پیدا نکردیم.</h1><p>مدل‌های دیگهٔ ویترین منتظر انتخاب تو هستند.</p>
      <Link href="/products" className="btn-primary">مشاهدهٔ محصولات <ArrowLeft size={18} /></Link>
    </div></div>
  }

  const outOfStock = product.stock <= 0
  const mainImage = product.images[activeImage] ?? product.images[0]
  const handleAddToCart = () => {
    if (outOfStock || !selectedSize || !product.sizes.includes(selectedSize)) return
    addItem({ productId: product.id, name: product.name, price: product.price, image: product.images[0], size: selectedSize, color: activeColor, quantity })
    toast('محصول به سبد خرید اضافه شد', product.name)
  }

  return <div className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="مسیر صفحه">
      <Link href="/">خانه</Link><span>/</span><Link href="/products">محصولات</Link><span>/</span><span>{product.name}</span>
    </nav>
    <div className={styles.detailGrid}>
      <div className={styles.gallery} data-reveal>
        <div className={styles.mainImage}>
          {mainImage ? <Image src={mainImage} alt={product.name} fill sizes="(max-width: 900px) 95vw, 48vw" unoptimized={mainImage.startsWith('http')} /> : <span className={styles.placeholder}><SneakerIcon size={75} /></span>}
        </div>
        {product.images.length > 1 && <div className={styles.thumbnails}>
          {product.images.map((src, i) => <button key={i} onClick={() => setActiveImage(i)} aria-label={`نمایش تصویر ${formatPrice(i + 1)}`} aria-pressed={activeImage === i} className={`${styles.thumbnail} ${activeImage === i ? styles.thumbnailActive : ''}`}>
            <Image src={src} alt="" fill sizes="120px" unoptimized={src.startsWith('http')} />
          </button>)}
        </div>}
      </div>
      <div className={styles.detailInfo}>
        <span className={styles.detailCategory}>{product.category?.name}</span>
        <h1>{product.name}</h1>
        <div className={styles.detailPrice}>
          <p className={styles.price}>{formatPrice(product.price)} <small>تومان</small></p>
          <span className={styles.stock}>{outOfStock ? 'فعلاً ناموجود' : `${formatPrice(product.stock)} جفت موجود در انبار`}</span>
        </div>
        {product.description && <p className={styles.description}>{product.description}</p>}
        {product.sizes.length > 0 && <div className={styles.options}>
          <h2>سایزت رو انتخاب کن</h2>
          <div className={styles.choices}>{product.sizes.map((size) => <button key={size} onClick={() => setSelectedSize(size)} aria-pressed={selectedSize === size} className={`${styles.choice} ${selectedSize === size ? styles.choiceActive : ''}`}>{formatPrice(size)}</button>)}</div>
        </div>}
        {product.colors.length > 0 && <div className={styles.options}>
          <h2>رنگ دلخواهت</h2>
          <div className={styles.choices}>{product.colors.map((color) => <button key={color} onClick={() => setActiveColor(color)} aria-pressed={activeColor === color} className={`${styles.choice} ${activeColor === color ? styles.choiceActive : ''}`}>{color}</button>)}</div>
        </div>}
        <div className={styles.purchase}>
          <div className={styles.quantity}>
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={outOfStock || quantity <= 1} aria-label="کاهش تعداد"><Minus size={15} /></button>
            <span aria-live="polite">{formatPrice(quantity)}</span>
            <button onClick={() => setQuantity(Math.min(Math.max(product.stock, 1), quantity + 1))} disabled={outOfStock || quantity >= product.stock} aria-label="افزایش تعداد"><Plus size={15} /></button>
          </div>
          <button onClick={handleAddToCart} disabled={outOfStock || !selectedSize} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"><ShoppingBag size={18} />{outOfStock ? 'فعلاً ناموجود' : !selectedSize ? 'سایزی برای خرید موجود نیست' : 'افزودن به سبد خرید'}</button>
        </div>
        {!outOfStock && quantity >= product.stock && product.stock > 0 && <p className="text-mist text-xs mt-3">بیشتر از این مقدار موجود نیست</p>}
        <Link href="/cart" className={styles.cartLink}>مشاهدهٔ سبد خرید <ArrowLeft size={16} /></Link>
        <div className={styles.perks}>
          <span><RotateCcw />۷ روز ضمانت بازگشت</span>
          <span><ShieldCheck />ضمانت اصالت کالا</span>
          <span><Truck />ارسال در ۴۸ ساعت</span>
        </div>
      </div>
    </div>
  </div>
}
