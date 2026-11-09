const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 })
const wholeRupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })
const shares = new Intl.NumberFormat("en-IN")
const percent = new Intl.NumberFormat("en-IN", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" })

/** Integer paise → "₹1,00,652.43". */
export const formatPaise = (paise: number): string => rupees.format(paise / 100)
export const formatPaiseWhole = (paise: number): string => wholeRupees.format(Math.round(paise / 100))
export const formatPrice = (price: number): string => rupees.format(price)
export const formatShares = (n: number): string => shares.format(n)
export const formatChange = (fraction: number): string => percent.format(fraction)

/** Signed paise with an explicit + for gains. */
export const formatSignedPaise = (paise: number): string => (paise > 0 ? "+" : "") + formatPaise(paise)

export const trend = (value: number): "gain" | "loss" | "flat" => (value > 0 ? "gain" : value < 0 ? "loss" : "flat")
