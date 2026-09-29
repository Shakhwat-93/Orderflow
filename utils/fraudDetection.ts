/**
 * FRAUD & ANOMALY DETECTION UTILITY
 * Logic to identify duplicate or suspicious orders.
 * OPTIMIZED (Phase 9.8): Precomputed single-pass normalization, zero-allocation
 * mathematical bound pruning, and exact semantic equivalence preservation.
 */

export interface FraudFlag {
  type: 'DUPLICATE_PHONE' | 'SIMILAR_ADDRESS' | string;
  severity: 'high' | 'medium' | 'low';
  matchId: string | number;
  message: string;
}

export const fraudDetection = {
  normalizePhone(phone?: string | null): string {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '').replace(/^88/, '');
  },

  normalizeAddress(address?: string | null): string {
    if (!address) return '';
    return String(address)
      .toLowerCase()
      .replace(/house|road|flat|block|sector|holding|lane|avenue|street|floor/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  },

  getBigrams(str: string): Set<string> {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  },

  getSimilarity(addr1?: string | null, addr2?: string | null): number {
    const n1 = this.normalizeAddress(addr1);
    const n2 = this.normalizeAddress(addr2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 1;

    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;

    if (longer.includes(shorter)) return shorter.length / longer.length;

    const b1 = this.getBigrams(n1);
    const b2 = this.getBigrams(n2);

    let intersectionSize = 0;
    const [smallerSet, largerSet] = b1.size <= b2.size ? [b1, b2] : [b2, b1];
    for (const bg of smallerSet) {
      if (largerSet.has(bg)) intersectionSize++;
    }
    const unionSize = b1.size + b2.size - intersectionSize;

    return intersectionSize / (unionSize || 1);
  },

  checkDuplicate(newOrder: any, existingOrders: any[]): FraudFlag | null {
    if (!newOrder?.phone) return null;

    const newPhone = this.normalizePhone(newOrder.phone);

    for (const old of existingOrders) {
      if (old.id === newOrder.id) continue;

      const oldPhone = this.normalizePhone(old.phone);
      
      if (newPhone && newPhone === oldPhone && newPhone.length > 5) {
        return {
          type: 'DUPLICATE_PHONE',
          severity: 'high',
          matchId: old.id,
          message: `Exact phone match with Order #${old.id}`
        };
      }

      const similarity = this.getSimilarity(newOrder.address, old.address);
      if (similarity > 0.85) {
        return {
          type: 'SIMILAR_ADDRESS',
          severity: 'medium',
          matchId: old.id,
          message: `Address is ${Math.round(similarity * 100)}% similar to Order #${old.id}`
        };
      }
    }

    return null;
  },

  scanOrders(orders: any[]): Record<string | number, FraudFlag> {
    const flags: Record<string | number, FraudFlag> = {};
    if (!orders || orders.length === 0) return flags;

    const n = orders.length;

    // Phase 1: Precompute all normalized representations and bigram Sets ONCE
    const norm = new Array(n);

    for (let i = 0; i < n; i++) {
      const order = orders[i];
      const phone = order?.phone ? this.normalizePhone(order.phone) : '';
      const addr = order?.address ? this.normalizeAddress(order.address) : '';
      const bSet = addr.length > 1 ? this.getBigrams(addr) : null;
      const bSize = bSet ? bSet.size : 0;

      norm[i] = {
        order,
        id: order.id,
        phone,
        hasValidPhone: phone.length > 5,
        addr,
        addrLen: addr.length,
        bSet,
        bSize
      };
    }

    // Phase 2: Exact semantic candidate loop preserving original array order
    for (let i = 0; i < n; i++) {
      const current = norm[i];
      if (!current.order?.phone) continue;

      const currentHasPhone = current.hasValidPhone;
      const currentPhone = current.phone;
      const currentAddr = current.addr;
      const currentAddrLen = current.addrLen;
      const currentBSet = current.bSet;
      const currentBSize = current.bSize;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const old = norm[j];

        // 1. DUPLICATE_PHONE check
        if (currentHasPhone && old.hasValidPhone && currentPhone === old.phone) {
          flags[current.id] = {
            type: 'DUPLICATE_PHONE',
            severity: 'high',
            matchId: old.id,
            message: `Exact phone match with Order #${old.id}`
          };
          break; // Matches first in existingOrders order
        }

        // 2. SIMILAR_ADDRESS check
        if (!currentAddr || !old.addr) continue;

        // Fast identical check
        if (currentAddr === old.addr) {
          flags[current.id] = {
            type: 'SIMILAR_ADDRESS',
            severity: 'medium',
            matchId: old.id,
            message: `Address is 100% similar to Order #${old.id}`
          };
          break;
        }

        // Substring check
        const longer = currentAddrLen > old.addrLen ? currentAddr : old.addr;
        const shorter = currentAddrLen > old.addrLen ? old.addr : currentAddr;
        const longerLen = currentAddrLen > old.addrLen ? currentAddrLen : old.addrLen;
        const shorterLen = currentAddrLen > old.addrLen ? old.addrLen : currentAddrLen;

        let similarity = 0;
        if (longer.includes(shorter)) {
          similarity = shorterLen / longerLen;
        } else if (currentBSet && old.bSet) {
          // Mathematical bound: If min(bSize)/max(bSize) <= 0.85, Jaccard CANNOT exceed 0.85
          const minB = currentBSize < old.bSize ? currentBSize : old.bSize;
          const maxB = currentBSize < old.bSize ? old.bSize : currentBSize;
          if (minB / maxB > 0.85) {
            let intersectionSize = 0;
            const [sSet, lSet] = currentBSize <= old.bSize 
              ? [currentBSet, old.bSet] 
              : [old.bSet, currentBSet];
            
            for (const bg of sSet) {
              if (lSet.has(bg)) intersectionSize++;
            }
            const unionSize = currentBSize + old.bSize - intersectionSize;
            similarity = intersectionSize / (unionSize || 1);
          }
        }

        if (similarity > 0.85) {
          flags[current.id] = {
            type: 'SIMILAR_ADDRESS',
            severity: 'medium',
            matchId: old.id,
            message: `Address is ${Math.round(similarity * 100)}% similar to Order #${old.id}`
          };
          break;
        }
      }
    }

    return flags;
  }
};
