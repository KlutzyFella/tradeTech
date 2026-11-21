import { test as base, type BrowserContext } from "@playwright/test"

/** Makes the "How it works" sheet count as already read in this context. */
export async function rulesAlreadyRead(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (this: Storage, key: string) {
      return key.startsWith("tradetech:rules-seen:") ? "1" : getItem.call(this, key)
    }
  })
}

/**
 * Specs start from empty browser storage, so every team would first see the
 * "How it works" sheet. Treat it as already read here; rules.spec.ts uses the
 * plain Playwright test to check the real first-visit behaviour. Contexts a
 * spec creates itself need rulesAlreadyRead().
 */
export const test = base.extend({
  // Playwright's fixture callback is usually called `use`; naming it `provide` keeps
  // the React hooks lint rule from mistaking it for React's use() hook.
  context: async ({ context }, provide) => {
    await rulesAlreadyRead(context)
    await provide(context)
  },
})
