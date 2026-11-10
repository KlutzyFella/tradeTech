import { brand } from "@/brand"
import { cn } from "@/lib/utils"

/** The client's square symbol. Decorative when next to a visible name. */
export function BrandMark({ className, decorative = true }: { className?: string; decorative?: boolean }) {
  return (
    <img
      src={brand.markSrc}
      alt={decorative ? "" : brand.clientName}
      aria-hidden={decorative || undefined}
      width={432}
      height={351}
      className={cn("h-7 w-auto shrink-0 select-none", className)}
      draggable={false}
    />
  )
}

/** Stacked symbol + wordmark, for sign-in and splash moments. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <img
      src={brand.lockupSrc}
      alt={brand.clientName}
      width={469}
      height={472}
      fetchPriority="high"
      className={cn("h-auto w-40 select-none", className)}
      draggable={false}
    />
  )
}

/**
 * Product + client lockup for headers: the client's mark, the product name,
 * and the client's wordmark: "TradeTech × ecotech".
 */
export function ProductLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span translate="no" className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className={compact ? "h-6" : "h-7"} />
      <span className="flex items-baseline gap-1.5 font-heading">
        <span className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-lg")}>{brand.productName}</span>
        {!compact && (
          <>
            <span aria-hidden className="text-muted-foreground">
              ×
            </span>
            <img
              src={brand.wordmarkSrc}
              alt={brand.clientName}
              width={461}
              height={100}
              className="h-3.5 w-auto translate-y-px select-none"
              draggable={false}
            />
          </>
        )}
      </span>
    </span>
  )
}
