import type { HostNewsView, HostRoomSummary, HostRoomView } from "@tradetech/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "./api"

/** Host screens poll: a host watches one room at a time and needs fresh numbers, not push. */
const HOST_POLL_MS = 2000

export const hostKeys = {
  rooms: ["host", "rooms"] as const,
  room: (id: string) => ["host", "room", id] as const,
  news: (id: string) => ["host", "news", id] as const,
  board: (id: string) => ["host", "board", id] as const,
}

export const useHostRooms = () =>
  useQuery({ queryKey: hostKeys.rooms, queryFn: () => api.get<HostRoomSummary[]>("/host/rooms") })

export const useHostRoom = (roomId: string) =>
  useQuery({
    queryKey: hostKeys.room(roomId),
    queryFn: () => api.get<HostRoomView>(`/host/rooms/${roomId}`),
    refetchInterval: HOST_POLL_MS,
  })

export const useHostNews = (roomId: string) =>
  useQuery({
    queryKey: hostKeys.news(roomId),
    queryFn: () => api.get<HostNewsView[]>(`/host/rooms/${roomId}/news`),
    refetchInterval: HOST_POLL_MS,
  })

interface HostActionOptions<TVars> {
  /** Toast shown on success. */
  success?: string
  /**
   * The request body. Defaults to the variables as-is; set it whenever the
   * variables also carry URL parameters (ids), because the server rejects
   * unknown body fields.
   */
  body?: (vars: TVars) => unknown
}

/**
 * A host command against one room: POSTs, refreshes everything about the
 * room, and reports success or the server's explanation as a toast.
 */
export function useHostAction<TVars = unknown>(roomId: string, path: (vars: TVars) => string, options: HostActionOptions<TVars> = {}) {
  const queryClient = useQueryClient()
  const { success, body = (vars: TVars) => vars } = options
  return useMutation({
    mutationFn: (vars: TVars) => api.post(`/host/rooms/${roomId}${path(vars)}`, body(vars) ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["host"] })
      if (success) toast.success(success)
    },
    onError: (error) => toast.error(error.message),
  })
}
