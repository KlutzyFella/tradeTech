import type { RoomStatus } from "@tradetech/contracts"
import { Badge } from "@/components/ui/badge"

export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  draft: "Setting up",
  practice: "Practice",
  live: "Live",
  paused: "Paused",
  closed: "Closed",
}

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const variant = status === "live" ? "live" : status === "practice" ? "warning" : status === "closed" ? "outline" : "secondary"
  return <Badge variant={variant}>{ROOM_STATUS_LABEL[status]}</Badge>
}
