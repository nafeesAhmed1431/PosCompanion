import { useEffect, useMemo, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Read-only browse/reference view (product grid + category tabs), NOT the
// Laravel admin menu editor — mirrors the product-grid portion of
// pos.tsx's visual style but with no cart/add-to-order behavior at all.
export default function MenuPage() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [categoryId, setCategoryId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(localApiUrl('/api/menu'))
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not load the menu.')
        setCategories(data.categories)
        setProducts(data.products)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const visibleProducts = useMemo(
    () => (categoryId ? products.filter((p) => p.category_id === categoryId) : products),
    [products, categoryId]
  )

  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold">Menu</h1>
        <p className="text-muted-foreground">Browse the current menu — reference only.</p>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {!loading && categories.length > 0 && (
        <Tabs value={categoryId ?? 'all'} onValueChange={(v) => setCategoryId(v === 'all' ? null : v)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {loading ? (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      ) : visibleProducts.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleProducts.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow"
            >
              <div className="aspect-4/3 w-full shrink-0 overflow-hidden bg-secondary">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                    <UtensilsCrossed className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                <span className="text-sm leading-tight font-medium">{p.name}</span>
                <span className="text-sm text-primary">{Number(p.display_price).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-muted-foreground">No products in this category.</p>
      )}
    </div>
  )
}
