import { DEFAULT_ROOM_RULES, roomRulesSchema, type RoomRules } from '@tradetech/contracts'

/** Room rules are stored as JSON; anything malformed is a server bug, so fail loudly. */
export function parseRoomRules(stored: unknown): RoomRules {
  return roomRulesSchema.parse({ ...DEFAULT_ROOM_RULES, ...(stored as object) })
}

export type RoomRulesOverrides = { readonly [K in keyof RoomRules]?: RoomRules[K] | undefined }

export function mergeRoomRules(overrides: RoomRulesOverrides | undefined): RoomRules {
  const defined = Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined))
  return roomRulesSchema.parse({ ...DEFAULT_ROOM_RULES, ...defined })
}
