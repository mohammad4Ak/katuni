const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

// These tests run the real routes against isolated transactional state. They never
// connect to the database, create a live order, or invoke a payment provider.
function load(file, dependencies = {}) {
  const source = readFileSync(path.join(__dirname, '..', file), 'utf8')
  const context = { module: { exports: {} }, require: (name) => {
    if (name === 'node:crypto') return require(name)
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  } }
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code, context)
  return context.module.exports
}
const shipping = load('src/lib/shipping.ts')
const clone = (value) => structuredClone(value)
const method = { id: 'post', name: 'پست پیشتاز', baseCost: 50000, additionalItemCost: 10000, freeShippingThreshold: null, isActive: true }
const product = { id: 'shoe', name: 'کفش', price: 100000, stock: 10, sizes: [42, 43], colors: ['سبز', 'مشکی'] }
const item = { productId: 'shoe', quantity: 2, size: 42, color: 'سبز' }
const body = { items: [item], address: 'تهران، خیابان نمونه', phone: '09123456789', shippingMethodId: 'post', expectedShippingCost: 60000, expectedSubtotal: 200000 }
const checkoutKey = '5f2727c3-580a-4d74-bb95-e0acbd6cb848'
const request = (body, method = 'POST') => new Request('http://localhost/api/orders', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

function createHarness({ products = [product], createError, overlap = false, session = { user: { id: 'customer', name: 'نام خریدار', role: 'USER' } } } = {}) {
  const committed = { products: new Map(products.map((p) => [p.id, clone(p)])), orders: [] }
  const reads = new Map()
  const mutations = []
  let queue = Promise.resolve()
  let readers = 0
  let releaseReaders
  const readersReady = new Promise((resolve) => { releaseReaders = resolve })
  const prisma = {
    order: { findFirst: async ({ where }) => {
      const found = clone(committed.orders.find((row) => row.checkoutKey === where.checkoutKey && row.userId === where.userId) ?? null)
      if (overlap && readers < 2) {
        readers++
        if (readers === 2) releaseReaders()
        await readersReady
      }
      return found
    } },
    product: { findUnique: async ({ where }) => clone(committed.products.get(where.id) ?? null) },
    $transaction: async (callback) => {
      let unlock
      const previous = queue
      queue = new Promise((resolve) => { unlock = resolve })
      await previous
      try {
      const draft = clone(committed)
      const result = await callback({
        shippingMethod: { findUnique: async () => clone(method) },
        product: {
          findUnique: async ({ where }) => {
            reads.set(where.id, (reads.get(where.id) ?? 0) + 1)
            return clone(draft.products.get(where.id) ?? null)
          },
          updateMany: async ({ where, data }) => {
            mutations.push(where.id)
            const p = draft.products.get(where.id)
            if (!p || p.stock < where.stock.gte) return { count: 0 }
            p.stock -= data.stock.decrement
            return { count: 1 }
          },
        },
        order: { create: async ({ data }) => {
          if (createError) throw createError
          if (data.checkoutKey && draft.orders.some((row) => row.checkoutKey === data.checkoutKey)) throw { code: 'P2002' }
          const order = { id: `order-${draft.orders.length + 1}`, ...data, items: data.items.create }
          draft.orders.push(order)
          return order
        } },
      })
      committed.products = draft.products
      committed.orders = draft.orders
      return result
      } finally { unlock() }
    },
  }
  const route = load('src/app/api/orders/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma },
    '@/lib/auth': { auth: async () => session }, '@/lib/shipping': shipping,
  })
  return { post: (value) => route.POST(request(value)), committed, reads, mutations }
}

test('Unknown sizes and colors, and missing color on a colored product, cannot reserve stock', async () => {
  for (const invalid of [{ ...item, size: 99 }, { ...item, color: 'قرمز' }, { ...item, color: '' }]) {
    const h = createHarness()
    const response = await h.post({ ...body, items: [invalid] })
    assert.equal(response.status, 409)
    const error = await response.json()
    assert.equal(error.code, 'INVALID_PRODUCT_VARIANT')
    assert.deepEqual(error.invalidVariants, [{ productId: 'shoe', size: invalid.size, color: invalid.color || '-' }])
    assert.equal(h.committed.products.get('shoe').stock, 10)
    assert.equal(h.committed.orders.length, 0)
    assert.equal(h.mutations.length, 0)
  }
})

test('Products with no colors accept the canonical placeholder; products with no sizes cannot be purchased', async () => {
  const colorless = createHarness({ products: [{ ...product, colors: [] }] })
  assert.equal((await colorless.post({ ...body, items: [{ ...item, color: '' }] })).status, 201)
  assert.equal(colorless.committed.orders[0].items[0].color, '-')
  const invented = createHarness({ products: [{ ...product, colors: [] }] })
  assert.equal((await invented.post(body)).status, 409)
  const noSizes = createHarness({ products: [{ ...product, sizes: [] }] })
  assert.equal((await noSizes.post(body)).status, 409)
})

test('Duplicate product lines share one catalog snapshot and aggregate their stock reservation', async () => {
  const h = createHarness()
  const response = await h.post({ ...body,
    items: [item, { ...item, size: 43, color: 'مشکی', quantity: 1 }],
    expectedSubtotal: 300000, expectedShippingCost: 70000,
  })
  assert.equal(response.status, 201)
  assert.equal(h.reads.get('shoe'), 1)
  assert.deepEqual(h.mutations, ['shoe'])
  assert.equal(h.committed.products.get('shoe').stock, 7)
  assert.equal(h.committed.orders[0].total, 370000)
  assert.equal(h.committed.orders[0].items.length, 2)
})

test('The recipient name is trimmed and captured independently from the buyer name', async () => {
  const h = createHarness()
  assert.equal((await h.post({ ...body, recipientName: '  نام گیرنده  ' })).status, 201)
  assert.equal(h.committed.orders[0].recipientName, 'نام گیرنده')
  const legacy = createHarness()
  assert.equal((await legacy.post(body)).status, 201)
  assert.equal(legacy.committed.orders[0].recipientName, 'نام خریدار')
})

test('Invalid recipient names fail before reserving inventory', async () => {
  for (const recipientName of [null, 123, '', '  ', 'x'.repeat(121)]) {
    const h = createHarness()
    assert.equal((await h.post({ ...body, recipientName })).status, 400)
    assert.equal(h.committed.orders.length, 0)
    assert.equal(h.mutations.length, 0)
  }
})

test('Only a shipping foreign-key race becomes an unavailable carrier response; stock rolls back', async () => {
  for (const [field, status, code] of [
    ['Order_shippingMethodId_fkey (index)', 409, 'SHIPPING_METHOD_UNAVAILABLE'],
    ['Order_userId_fkey (index)', 500, undefined],
    [undefined, 500, undefined],
  ]) {
    const h = createHarness({ createError: { code: 'P2003', meta: { field_name: field } } })
    const response = await h.post(body)
    assert.equal(response.status, status)
    assert.equal((await response.json()).code, code)
    assert.equal(h.committed.products.get('shoe').stock, 10)
    assert.equal(h.committed.orders.length, 0)
  }
})

test('A lost-response retry returns the historical order even after stock, price, or variants change', async () => {
  const h = createHarness()
  const first = await h.post({ ...body, checkoutKey })
  assert.equal(first.status, 201)
  const initial = await first.json()
  Object.assign(h.committed.products.get('shoe'), { stock: 0, price: 999999, sizes: [], colors: [] })
  const retry = await h.post({ ...body, checkoutKey })
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).id, initial.id)
  assert.equal(h.committed.orders.length, 1)
  assert.equal(h.mutations.length, 1)
  assert.match(h.committed.orders[0].checkoutFingerprint, /^[0-9a-f]{64}$/)
})

test('Concurrent identical checkout keys create and reserve one order, including the last available pairs', async () => {
  for (const stock of [10, 2]) {
    const h = createHarness({ products: [{ ...product, stock }], overlap: true })
    const responses = await Promise.all([h.post({ ...body, checkoutKey }), h.post({ ...body, checkoutKey })])
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201])
    const rows = await Promise.all(responses.map((r) => r.json()))
    assert.equal(rows[0].id, rows[1].id)
    assert.equal(h.committed.orders.length, 1)
    assert.equal(h.committed.products.get('shoe').stock, stock - 2)
  }
})

test('Reusing a key with changed recipient, delivery or items reconciles the prior order without creating another', async () => {
  for (const changed of [
    { recipientName: 'نام تازه' }, { address: 'آدرس تازه' }, { phone: '09121111111' },
    { shippingMethodId: 'tipax' },
    { items: [{ ...item, size: 43 }] },
  ]) {
    const h = createHarness()
    assert.equal((await h.post({ ...body, checkoutKey })).status, 201)
    const response = await h.post({ ...body, checkoutKey, ...changed })
    assert.equal(response.status, 409)
    const error = await response.json()
    assert.equal(error.code, 'CHECKOUT_KEY_REUSED')
    assert.equal(error.existingOrderId, h.committed.orders[0].id)
    assert.equal(h.committed.orders.length, 1)
    assert.equal(h.committed.products.get('shoe').stock, 8)
  }
})

test('A durable key returns the original order when automatic shipping and price quotes refresh after a lost response', async () => {
  const h = createHarness()
  const first = await h.post({ ...body, checkoutKey })
  assert.equal(first.status, 201)
  const original = await first.json()
  // Catalog and quote changes must not turn a retry into a second purchase.
  Object.assign(h.committed.products.get('shoe'), { price: 150000, stock: 0 })
  for (const quote of [
    { expectedShippingCost: 70000 }, { expectedSubtotal: 300000 },
    { expectedSubtotal: 300000, expectedShippingCost: 0 },
    { expectedSubtotal: undefined, expectedShippingCost: 123456 },
  ]) {
    const response = await h.post({ ...body, checkoutKey, ...quote })
    assert.equal(response.status, 200)
    const reused = await response.json()
    assert.equal(reused.id, original.id)
    assert.equal(reused.total, original.total)
    assert.equal(reused.shippingCost, original.shippingCost)
  }
  assert.equal(h.committed.orders.length, 1)
  assert.equal(h.mutations.length, 1)
})

test('Concurrent retries reconcile refreshed quotes or changed intent against the winning order', async () => {
  for (const [change, expectedStatus] of [
    [{ expectedSubtotal: 300000, expectedShippingCost: 70000 }, 200],
    [{ recipientName: 'گیرندهٔ متفاوت' }, 409],
  ]) {
    const h = createHarness({ overlap: true })
    const [first, retry] = await Promise.all([
      h.post({ ...body, checkoutKey }), h.post({ ...body, checkoutKey, ...change }),
    ])
    assert.equal(first.status, 201)
    assert.equal(retry.status, expectedStatus)
    const result = await retry.json()
    if (expectedStatus === 409) {
      assert.equal(result.code, 'CHECKOUT_KEY_REUSED')
      assert.equal(result.existingOrderId, h.committed.orders[0].id)
    } else assert.equal(result.id, h.committed.orders[0].id)
    assert.equal(h.committed.orders.length, 1)
    assert.equal(h.committed.products.get('shoe').stock, 8)
  }
})

test('Checkout keys are isolated per customer, accept UUID casing, and ignore untrusted extra fields', async () => {
  const session = { user: { id: 'first', name: 'نام خریدار', role: 'USER' } }
  const h = createHarness({ session })
  assert.equal((await h.post({ ...body, checkoutKey: checkoutKey.toUpperCase() })).status, 201)
  assert.equal((await h.post({ ...body, checkoutKey, total: 1, verified: true, items: [{ ...item, price: 1 }] })).status, 200)
  session.user.id = 'second'
  assert.equal((await h.post({ ...body, checkoutKey })).status, 201)
  assert.equal(h.committed.orders.length, 2)
  assert.equal(h.committed.orders[0].userId, 'first')
  assert.equal(h.committed.orders[1].userId, 'second')
  assert.notEqual(h.committed.orders[0].checkoutKey, h.committed.orders[1].checkoutKey)
})

test('Invalid checkout keys fail before stock changes; requests without keys remain compatible', async () => {
  for (const key of [null, '', 123, 'not-a-uuid', `${checkoutKey}x`, 'x'.repeat(129)]) {
    const h = createHarness()
    assert.equal((await h.post({ ...body, checkoutKey: key })).status, 400)
    assert.equal(h.mutations.length, 0)
  }
  const h = createHarness()
  assert.equal((await h.post(body)).status, 201)
  assert.equal((await h.post(body)).status, 201)
  assert.equal(h.committed.orders.length, 2)
})

const order = { id: 'order', status: 'PENDING', verified: false, updatedAt: new Date('2026-10-01T10:00:00Z'),
  user: { name: 'خریدار', email: 'buyer@example.test' },
  items: [{ productId: 'shoe', quantity: 2 }, { productId: 'shoe', quantity: 1 }],
}

// Simulate row-lock and READ COMMITTED semantics: concurrent readers may see the
// same order, but a conditional update waits for the winner and rechecks its filter.
function statusHarness({ initial = order, stocks = { shoe: 7 }, overlap = false,
  session = { user: { id: 'admin', role: 'ADMIN' } }, failDelete = false } = {}) {
  const committed = { order: clone(initial), stocks: clone(stocks) }
  const mutations = []
  let transactions = 0
  let queue = Promise.resolve()
  let readers = 0
  let releaseReaders
  const readersReady = new Promise((resolve) => { releaseReaders = resolve })
  const prisma = { $transaction: async (callback) => {
    transactions++
    let draft = null
    let unlock
    const tx = {
      order: {
        findUnique: async () => {
          const snapshot = clone((draft ?? committed).order)
          if (overlap && !draft && readers < 2) {
            readers++
            if (readers === 2) releaseReaders()
            await readersReady
          }
          return snapshot
        },
        updateMany: async ({ where, data }) => {
          const previous = queue
          queue = new Promise((resolve) => { unlock = resolve })
          await previous
          const current = committed.order
          if (!current || current.id !== where.id || current.status !== where.status ||
              current.updatedAt.getTime() !== where.updatedAt.getTime() ||
              (where.verified !== undefined && current.verified !== where.verified)) return { count: 0 }
          draft = clone(committed)
          draft.order.status = data.status
          draft.order.updatedAt = new Date(current.updatedAt.getTime() + 1)
          return { count: 1 }
        },
        delete: async () => {
          if (failDelete) throw new Error('delete failed')
          draft.order = null
        },
      },
      product: {
        update: async ({ where, data }) => {
          assert.ok(draft, 'Inventory changed before the order row was claimed')
          mutations.push(['restore', where.id, data.stock.increment])
          draft.stocks[where.id] += data.stock.increment
        },
        updateMany: async ({ where, data }) => {
          assert.ok(draft, 'Inventory changed before the order row was claimed')
          if ((draft.stocks[where.id] ?? 0) < where.stock.gte) return { count: 0 }
          mutations.push(['reserve', where.id, data.stock.decrement])
          draft.stocks[where.id] -= data.stock.decrement
          return { count: 1 }
        },
        findUnique: async () => ({ name: 'کفش' }),
      },
      orderItem: { deleteMany: async () => {} },
    }
    try {
      const result = await callback(tx)
      if (draft) Object.assign(committed, draft)
      return result
    } finally { unlock?.() }
  } }
  const route = load('src/app/api/orders/[id]/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/prisma': { prisma }, '@/lib/auth': { auth: async () => session },
  })
  const params = { params: Promise.resolve({ id: 'order' }) }
  return { committed, mutations, transactions: () => transactions,
    patch: (status) => route.PATCH(request({ status }, 'PATCH'), params),
    malformed: () => route.PATCH(new Request('http://localhost/api/orders', { method: 'PATCH', body: '{broken' }), params),
    delete: () => route.DELETE(new Request('http://localhost/api/orders', { method: 'DELETE' }), params),
  }
}

test('Admin identity is required for both order writes; malformed JSON never starts a transaction', async () => {
  for (const [session, expected] of [[null, 401], [{ user: { role: 'ADMIN' } }, 401], [{ user: { id: 'buyer', role: 'USER' } }, 403]]) {
    const h = statusHarness({ session })
    assert.equal((await h.patch('CANCELLED')).status, expected)
    assert.equal((await h.delete()).status, expected)
    assert.equal(h.transactions(), 0)
  }
  const h = statusHarness()
  assert.equal((await h.malformed()).status, 400)
  assert.equal((await h.patch('invalid')).status, 400)
  assert.equal(h.transactions(), 0)
})

test('Concurrent cancellations restore inventory once; a repeated cancellation is an idempotent no-op', async () => {
  const h = statusHarness({ overlap: true })
  const responses = await Promise.all([h.patch('CANCELLED'), h.patch('CANCELLED')])
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
  assert.equal(h.committed.order.status, 'CANCELLED')
  assert.equal(h.committed.stocks.shoe, 10)
  assert.deepEqual(h.mutations, [['restore', 'shoe', 3]])
  assert.equal((await h.patch('CANCELLED')).status, 200)
  assert.equal(h.mutations.length, 1)
})

test('Concurrent reopening reserves aggregate stock once and does not oversell duplicate lines', async () => {
  const h = statusHarness({ initial: { ...order, status: 'CANCELLED' }, stocks: { shoe: 10 }, overlap: true })
  const responses = await Promise.all([h.patch('PENDING'), h.patch('PROCESSING')])
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
  assert.equal(h.committed.stocks.shoe, 7)
  assert.deepEqual(h.mutations, [['reserve', 'shoe', 3]])
})

test('An insufficient reopening rolls back status and every earlier product reservation', async () => {
  const h = statusHarness({ initial: { ...order, status: 'CANCELLED', items: [
    { productId: 'a', quantity: 2 }, { productId: 'b', quantity: 3 },
  ] }, stocks: { a: 5, b: 2 } })
  assert.equal((await h.patch('PROCESSING')).status, 409)
  assert.equal(h.committed.order.status, 'CANCELLED')
  assert.deepEqual(h.committed.stocks, { a: 5, b: 2 })
})

test('Shipped and delivered orders cannot be cancelled, moved backward or physically deleted', async () => {
  for (const current of ['SHIPPED', 'DELIVERED']) {
    for (const next of ['PENDING', 'PROCESSING', 'CANCELLED', ...(current === 'DELIVERED' ? ['SHIPPED'] : [])]) {
      const h = statusHarness({ initial: { ...order, status: current } })
      assert.equal((await h.patch(next)).status, 409)
      assert.equal(h.committed.order.status, current)
      assert.equal(h.mutations.length, 0)
    }
    const h = statusHarness({ initial: { ...order, status: current } })
    assert.equal((await h.delete()).status, 409)
    assert.equal(h.mutations.length, 0)
  }
  const h = statusHarness({ initial: { ...order, status: 'SHIPPED' } })
  assert.equal((await h.patch('DELIVERED')).status, 200)
  assert.equal(h.committed.stocks.shoe, 7)
})

test('Cancelled orders must be reopened before fulfillment; paid cancellation keeps its payment evidence', async () => {
  for (const status of ['SHIPPED', 'DELIVERED']) {
    const h = statusHarness({ initial: { ...order, status: 'CANCELLED' } })
    assert.equal((await h.patch(status)).status, 409)
  }
  const h = statusHarness({ initial: { ...order, verified: true } })
  assert.equal((await h.patch('CANCELLED')).status, 200)
  assert.equal(h.committed.order.verified, true)
  assert.equal((await h.delete()).status, 409)
  assert.equal(h.committed.order.verified, true)
})

test('Deleting an unpaid active order returns stock; deleting an already cancelled one does not', async () => {
  for (const status of ['PENDING', 'PROCESSING', 'CANCELLED']) {
    const h = statusHarness({ initial: { ...order, status } })
    assert.equal((await h.delete()).status, 200)
    assert.equal(h.committed.order, null)
    assert.equal(h.committed.stocks.shoe, status === 'CANCELLED' ? 7 : 10)
  }
  const failed = statusHarness({ failDelete: true })
  assert.equal((await failed.delete()).status, 500)
  assert.equal(failed.committed.order.status, 'PENDING')
  assert.equal(failed.committed.stocks.shoe, 7)
})

test('Concurrent delete/cancel cannot restore stock twice, and missing orders return 404', async () => {
  const h = statusHarness({ overlap: true })
  const responses = await Promise.all([h.delete(), h.patch('CANCELLED')])
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
  assert.equal(h.committed.stocks.shoe, 10)
  assert.equal(h.mutations.length, 1)
  const absent = statusHarness({ initial: null })
  assert.equal((await absent.patch('CANCELLED')).status, 404)
  assert.equal((await absent.delete()).status, 404)
})
