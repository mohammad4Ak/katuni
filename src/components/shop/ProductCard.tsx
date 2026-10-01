'use client'

import { SneakerIcon } from '@/components/ui/BrandIcons'

import Link from 'next/link'
import Image from 'next/image'
import { Plus } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import styles from './commerce.module.css'

interface Product {
  id: string
  name: string
  slug: string
  price: number
  image: string
  category: string
  stock?: number
}

interface ProductCardProps {
  product: Product
  revealDelay?: 0 | 1 | 2 | 3
}

export default function ProductCard({ product, revealDelay = 0 }: ProductCardProps) {
  const outOfStock = product.stock !== undefined && product.stock <= 0
  const href = `/products/${encodeURIComponent(product.slug)}`

  return (
    <article className={styles.product} data-reveal data-reveal-delay={revealDelay}>
      <Link href={`/products/${encodeURIComponent(product.slug)}`} className={styles.productPhoto}>
        {product.image ? <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 900px) 50vw, (max-width: 1150px) 33vw, 25vw"
          unoptimized={product.image.startsWith('http')}
          className={outOfStock ? 'grayscale opacity-60' : ''}
        /> : <span className={styles.placeholder}><SneakerIcon size={45} /></span>}

        {/* برچسب دسته بندی */}
        {product.category && (
          <span className={styles.productTag}>
            {product.category}
          </span>
        )}

        {/* برچسب ناموجود */}
        {outOfStock && (
          <span className={styles.unavailable}>
            ناموجود
          </span>
        )}
      </Link>

      <div className={styles.productInfo}>
        <h3>
          <Link href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link>
        </h3>

        <div className={styles.productBottom}>
          <span className={styles.price}>
            {formatPrice(product.price)} <small>تومان</small>
          </span>
          {outOfStock ? <button disabled aria-label={`${product.name} ناموجود است`} title="ناموجود" className={styles.add}><Plus size={19} /></button> :
            <Link href={href} aria-label={`انتخاب سایز و رنگ ${product.name}`} title="انتخاب سایز و رنگ" className={styles.add} data-motion="lift"><Plus size={19} /></Link>}
        </div>
      </div>
    </article>
  )
}
