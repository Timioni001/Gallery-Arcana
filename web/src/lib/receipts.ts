// Receipt codes are bearer secrets. Keep them only for this tab; the order
// page always lets the buyer paste one back in or renew it.
const k = (orderId: string) => `arcana:receipt:${orderId}`
export const saveReceipt = (orderId: string, code: string) => { try { sessionStorage.setItem(k(orderId), code) } catch { /* storage unavailable */ } }
export const loadReceipt = (orderId: string) => { try { return sessionStorage.getItem(k(orderId)) ?? '' } catch { return '' } }
