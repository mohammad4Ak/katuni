import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ApiInputError, apiError, readJsonObject } from '@/lib/api-input'
import { productInput, validateStockedSizes } from '@/lib/catalog-input'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let decodedId = id
  try { decodedId = decodeURIComponent(id) } catch { /* Keep the original route parameter. */ }
  const product =
    (await prisma.product.findUnique({ where: { id: decodedId }, include: { category: true } })) ??
    (await prisma.product.findFirst({ where: { slug: decodedId }, include: { category: true } })) ??
    (await prisma.product.findFirst({ where: { slug: id }, include: { category: true } }))
  if (!product) return NextResponse.json({ error: 'محصول یافت نشد' }, { status: 404 })
  return NextResponse.json(product)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 401 })
  }
  try {
    const { id } = await params
    const data = productInput(await readJsonObject(request))
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) throw new ApiInputError('محصول یافت نشد', 404)
    validateStockedSizes(data.stock ?? existing.stock, data.sizes ?? existing.sizes)
    if (data.categoryId !== undefined) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } })
      if (!category) throw new ApiInputError('دسته بندی نامعتبر است')
    }
    const product = await prisma.product.update({ where: { id }, data, include: { category: true } })
    return NextResponse.json(product)
  } catch (error) { return apiError(error, 'خطا در ویرایش محصول') }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'دسترسی غیرمجاز' }, { status: 401 })
  }
  try {
    const { id } = await params
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true } } } })
      if (!product) throw new ApiInputError('محصول یافت نشد', 404)
      if (product._count.orderItems > 0) throw new ApiInputError('این محصول سابقه سفارش دارد و برای حفظ سوابق فروش قابل حذف نیست', 409)
      await tx.product.delete({ where: { id } })
    })
    return NextResponse.json({ success: true })
  } catch (error) { return apiError(error, 'خطا در حذف محصول') }
}
