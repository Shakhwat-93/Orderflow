/**
 * FRAUD & ANOMALY DETECTION UTILITY
 * Logic to identify duplicate or suspicious orders.
 */

export const fraudDetection = {
  /**
   * Normalizes a phone number for comparison.
   * @param {string} phone 
   * @returns {string}
   */
  normalizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '').replace(/^88/, ''); // Remove non-digits and BD prefix if present
  },

  /**
   * Normalizes an address for fuzzy comparison.
   * @param {string} address 
   * @returns {string}
   */
  normalizeAddress(address) {
    if (!address) return '';
    return String(address)
      .toLowerCase()
      .replace(/house|road|flat|block|sector|holding|lane|avenue|street|floor/g, '') // Remove common identifiers
      .replace(/[^a-z0-9]/g, '') // Remove special characters and spaces
      .trim();
  },

  /**
   * Calculates similarity between two addresses (simplified Levenshtein or overlap).
   * @param {string} addr1 
   * @param {string} addr2 
   * @returns {number} 0 to 1
   */
  getSimilarity(addr1, addr2) {
    const n1 = this.normalizeAddress(addr1);
    const n2 = this.normalizeAddress(addr2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 1;

    // Length of the longest common substring / length of the shorter string
    // A simple but effective heuristic for addresses
    let longer = n1.length > n2.length ? n1 : n2;
    let shorter = n1.length > n2.length ? n2 : n1;

    if (longer.includes(shorter)) return shorter.length / longer.length;

    // Jaccard-like bigram similarity for more fuzzy matching
    const getBigrams = (str) => {
      const bigrams = new Set();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.slice(i, i + 2));
      }
      return bigrams;
    };

    const b1 = getBigrams(n1);
    const b2 = getBigrams(n2);
    const intersection = new Set([...b1].filter(x => b2.has(x)));
    const union = new Set([...b1, ...b2]);

    return intersection.size / union.size;
  },

  /**
   * Checks a new order against existing orders for duplicates.
   * @param {Object} newOrder 
   * @param {Array} existingOrders 
   * @returns {Object|null} The flag object if a duplicate is found.
   */
  checkDuplicate(newOrder, existingOrders) {
    if (!newOrder.phone) return null;

    const newPhone = this.normalizePhone(newOrder.phone);
    const newAddr = this.normalizeAddress(newOrder.address);

    for (const old of existingOrders) {
      if (old.id === newOrder.id) continue;

      const oldPhone = this.normalizePhone(old.phone);
      
      // Phone match (+ check if it's not a generic number like "00000000000")
      if (newPhone && newPhone === oldPhone && newPhone.length > 5) {
        return {
          type: 'DUPLICATE_PHONE',
          severity: 'high',
          matchId: old.id,
          message: `Exact phone match with Order #${old.id}`
        };
      }

      // Address match (high similarity)
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

  /**
   * Scans a full list of orders for fraud/duplicates.
   * @param {Array} orders 
   * @returns {Object} { orderId: flag }
   */
  scanOrders(orders) {
    const flags = {};
    orders.forEach(order => {
      const result = this.checkDuplicate(order, orders);
      if (result) flags[order.id] = result;
    });
    return flags;
  }
};
