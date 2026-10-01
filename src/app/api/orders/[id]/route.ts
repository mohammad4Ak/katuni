import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const
type OrderStatus = typeof validStatuses[number]
const orderDetails = {
  user: { select: { name: true, email: true } },
  items: { include: { product: { select: { name: true } } } },
} as const

class StatusError extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}

function isStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && validStatuses.includes(value as OrderStatus)
}

function quantities(items: { productId: string; quantity: number }[]) {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity)
  // All order mutations lock product rows in the same order to avoid deadlocks.
  return [...totals].sort(([left], [right]) => left.localeCompare(right))
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const { id } = await params
  let nextStatus: OrderStatus
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || !('status' in body) || !isStatus(body.status)) throw new Error()
    nextStatus = body.status
  } catch {
    return NextResponse.json({ error: 'وضعیت نامعتبر است' }, { status: 400 })
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id }, include: orderDetails })
      if (!existing) throw new StatusError('سفارش یافت نشد', 404)
      if (existing.status === nextStatus) return existing

      // A cancellation is not a return: shipped goods cannot be put back into stock.
      if (existing.status === 'DELIVERED' ||
          (existing.status === 'SHIPPED' && nextStatus !== 'DELIVERED')) {
        throw new StatusError('سفارش ارسال‌شده یا تحویل‌شده قابل بازگشت به وضعیت قبلی یا لغو نیست؛ مرجوعی باید جداگانه بررسی شود')
      }
      if (existing.status === 'CANCELLED' && nextStatus !== 'PENDING' && nextStatus !== 'PROCESSING') {
        throw new StatusError('برای بازگشایی سفارش لغوشده ابتدا وضعیت انتظار یا پردازش را انتخاب کنید')
      }

      // Claim the status change before changing stock. Concurrent requests must not
      // both restore or reserve inventory using the same stale order snapshot.
      const changed = await tx.order.updateMany({
        where: { id, status: existing.status, updatedAt: existing.updatedAt },
        data: { status: nextStatus },
      })
      if (changed.count !== 1) throw new StatusError('وضعیت سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه کنید')

      if (nextStatus === 'CANCELLED') {
        for (const [productId, quantity] of quantities(existing.items)) {
          await tx.product.update({ where: { id: productId }, data: { stock: { increment: quantity } } })
        }
      } else if (existing.status === 'CANCELLED') {
        for (const [productId, quantity] of quantities(existing.items)) {
          const decremented = await tx.product.updateMany({
            where: { id: productId, stock: { gte: quantity } },
            data: { stock: { decrement: quantity } },
          })
          if (decremented.count === 0) {
            const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } })
            throw new StatusError(`موجودی «${product?.name ?? 'محصول'}» برای بازگشایی سفارش کافی نیست`)
          }
        }
      }

      return tx.order.findUnique({ where: { id }, include: orderDetails })
    })

    return NextResponse.json(order)
  } catch (error) {
    if (error instanceof StatusError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'خطا در تغییر وضعیت' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 403 })

  const { id } = await params

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } })
      if (!order) throw new StatusError('سفارش یافت نشد', 404)
      if (order.verified || order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new StatusError('سوابق سفارش پرداخت‌شده، ارسال‌شده یا تحویل‌شده قابل حذف نیست')
      }

      const claimed = await tx.order.updateMany({
        where: { id, status: order.status, updatedAt: order.updatedAt, verified: false },
        data: { status: 'CANCELLED' },
      })
      if (claimed.count !== 1) throw new StatusError('وضعیت سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه کنید')

      if (order.status !== 'CANCELLED') {
        for (const [productId, quantity] of quantities(order.items)) {
          await tx.product.update({ where: { id: productId }, data: { stock: { increment: quantity } } })
        }
      }

      await tx.orderItem.deleteMany({ where: { orderId: id } })
      await tx.order.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof StatusError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'خطا در حذف سفارش' }, { status: 500 })
  }
}
