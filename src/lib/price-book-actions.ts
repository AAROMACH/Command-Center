import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { roundCents, type PricingSettings } from './billing';
import { savePricing } from './billing-actions';

/**
 * Super admins: make a price changed on a quote, invoice or project the
 * price-book price. 'mat:<id>' sets the material's sell price (fixed — it no
 * longer follows its category markup); 'rate:<id>' sets the labor rate.
 * Lines already on other quotes and invoices keep their prices.
 */
export async function savePriceToBook(itemRef: string, price: number, pricing: PricingSettings): Promise<void> {
  const p = roundCents(Number(price) || 0);
  if (p < 0) throw new Error('A price-book price can’t be negative.');
  const [kind, id] = [itemRef.slice(0, itemRef.indexOf(':')), itemRef.slice(itemRef.indexOf(':') + 1)];
  if (kind === 'mat' && id) {
    await updateDoc(doc(db, 'materials', id), { billablePrice: p, priceOverride: true, updatedAt: new Date().toISOString() });
    return;
  }
  if (kind === 'rate' && id) {
    if (!pricing.laborRates.some(r => r.id === id)) throw new Error('That labor rate is no longer in the price book.');
    await savePricing({ ...pricing, laborRates: pricing.laborRates.map(r => (r.id === id ? { ...r, rate: p } : r)) });
    return;
  }
  throw new Error('This line isn’t from the price book.');
}
