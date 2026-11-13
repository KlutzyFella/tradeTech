import { DEFAULT_ROOM_RULES, roomRulesSchema, type RoomRules } from '@tradetech/contracts'

/** Room rules are stored as JSON; anything malformed is a server bug, so fail loudly. */
export function parseRoomRules(stored: unknown): RoomRules {
  return roomRulesSchema.parse({ ...DEFAULT_ROOM_RULES, ...(stored as object) })
}

export type RoomRulesOverrides = { readonly [K in keyof RoomRules]?: RoomRules[K] | undefined }

/** Only the rules actually given: a blank (undefined) field never overrides a value. */
export function definedRules(overrides: RoomRulesOverrides | undefined): Partial<RoomRules> {
  return Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined)) as Partial<RoomRules>
}

export function mergeRoomRules(overrides: RoomRulesOverrides | undefined, base: RoomRules = DEFAULT_ROOM_RULES): RoomRules {
  return roomRulesSchema.parse({ ...base, ...definedRules(overrides) })
}
