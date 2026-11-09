import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { io } from "socket.io-client"

export const queryKeys = {
  me: ["me"] as const,
  market: ["market"] as const,
  portfolio: ["portfolio"] as const,
  orders: ["orders"] as const,
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    })
    socket.on("orders:changed", () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      void queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    })
    socket.on("room:status", refetchAll)
    socket.on("portfolio:reset", refetchAll)
    return () => {
      socket.disconnect()
    }
  }, [enabled, queryClient])

  return { connected }
}
