import type { HostMonitorView, HostNewsView, HostRoomSummary, HostRoomView, HostTemplateSummary } from "@tradetech/contracts"
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
  templates: ["host", "templates"] as const,
  monitor: (id: string) => ["host", "monitor", id] as const,
}

export const useHostRooms = () =>
  useQuery({
    queryKey: hostKeys.rooms,
    queryFn: () => api.get<HostRoomSummary[]>("/host/rooms"),
  })

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

/** Shared by the Monitor tab and the nav's alert count: one poll, two readers. */
export const useHostMonitor = (roomId: string) =>
  useQuery({
    queryKey: hostKeys.monitor(roomId),
    queryFn: () => api.get<HostMonitorView>(`/host/rooms/${roomId}/monitor`),
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
  /** DELETE sends no body. */
  method?: "POST" | "DELETE"
}

/**
 * A host command against one room: POSTs, refreshes everything about the
 * room, and reports success or the server's explanation as a toast.
 */
export function useHostAction<TVars = unknown>(roomId: string, path: (vars: TVars) => string, options: HostActionOptions<TVars> = {}) {
  const queryClient = useQueryClient()
  const { success, body = (vars: TVars) => vars, method = "POST" } = options
  return useMutation({
    mutationFn: (vars: TVars) =>
      method === "DELETE" ? api.del(`/host/rooms/${roomId}${path(vars)}`) : api.post(`/host/rooms/${roomId}${path(vars)}`, body(vars) ?? {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["host"] })
      if (success) toast.success(success)
    },
    onError: (error) => toast.error(error.message),
  })
}

export const useHostTemplates = () =>
  useQuery({
    queryKey: hostKeys.templates,
    queryFn: () => api.get<HostTemplateSummary[]>("/host/templates"),
  })

/** Template commands live outside any room; they refresh the template list. */
export function useTemplateAction<TVars>(request: (vars: TVars) => Promise<unknown>, success?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hostKeys.templates })
      if (success) toast.success(success)
    },
    onError: (error) => toast.error(error.message),
  })
}
