/** First focusable element: lets keyboard users jump past the header to the content. */
export function SkipLink({ href = "#main" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only z-50 rounded-md bg-brand px-4 py-2 font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  )
}
