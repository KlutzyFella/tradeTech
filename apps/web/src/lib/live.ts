import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { io } from "socket.io-client"
import { toast } from "sonner"

export const queryKeys = {
  me: ["me"] as const,
  market: ["market"] as const,
  portfolio: ["portfolio"] as const,
  orders: ["orders"] as const,
  news: ["news"] as const,
  standings: ["standings"] as const,
  history: ["history"] as const,
  rules: ["rules"] as const,
}

/**
 * Subscribes to the room's change signals and refetches authoritative state.
 * Sockets never carry prices or balances; a reconnect refetches everything,
 * so a missed signal cannot leave the screen stale.
 */
export function useLiveUpdates(enabled: boolean): { connected: boolean } {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const socket = io({ withCredentials: true })
    const refetchAll = () => {
      void queryClient.invalidateQueries()
    }
    socket.on("connect", () => {
      setConnected(true)
      refetchAll()
    })
    socket.on("disconnect", () => setConnected(false))
    socket.on("market:changed", () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.market })
      void queryClient.invalidateQueries({ queryKey: queryKeys.history })
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    })
    socket.on("news:published", () => {
      // The breaking-news strip announces it, with the headline and stocks named.
      void queryClient.invalidateQueries({ queryKey: queryKeys.news })
    })
    socket.on("orders:changed", (payload: { liquidated?: boolean }) => {
      if (payload?.liquidated) toast.warning("Your positions were closed because your account fell below the margin requirement.")
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    })
    socket.on("room:status", refetchAll)
    socket.on("standings:changed", () => void queryClient.invalidateQueries({ queryKey: queryKeys.standings }))
    socket.on("portfolio:reset", refetchAll)
    return () => {
      socket.disconnect()
    }
  }, [enabled, queryClient])

  return { connected }
}
