const DEFAULT_PRODUCTS = [
  { name: 'TOY BOX', category: 'TOY BOX', unit_price: 1250, color: '#f97316' },
  { name: 'ORGANIZER', category: 'ORGANIZER', unit_price: 850, color: '#059669' },
  { name: 'Travel bag', category: 'Bags', unit_price: 950, color: '#1d4ed8' },
  { name: 'TOY BOX + ORG', category: 'TOY BOX', unit_price: 2000, color: '#5b21b6' },
  { name: 'Gym bag', category: 'Bags', unit_price: 750, color: '#b91c1c' },
  { name: 'VLOGGER FOR FREE', category: 'Accessories', unit_price: 650, color: '#334155' },
  { name: 'MMB', category: 'Accessories', unit_price: 550, color: '#c084fc' },
  { name: 'Quran', category: 'Religious', unit_price: 1200, color: '#6366f1' },
  { name: 'WAIST BAG', category: 'Bags', unit_price: 450, color: '#134e4a' },
  { name: 'BAGPACK', category: 'Bags', unit_price: 1500, color: '#3b82f6' },
  { name: 'Moshari', category: 'Other', unit_price: 850, color: '#22c55e' }
];

const CATEGORY_COLORS = {
  'TOY BOX': '#f97316',
  ORGANIZER: '#059669',
  Bags: '#1d4ed8',
  Accessories: '#5b21b6',
  Religious: '#6366f1',
  Other: '#64748b'
};

const normalize = (value = '') => String(value).trim().toLowerCase();
export const normalizeProductName = (value = '') => String(value).trim();

const hashColor = (value = '') => {
  const palette = ['#f97316', '#059669', '#1d4ed8', '#5b21b6', '#b91c1c', '#334155', '#c084fc', '#6366f1', '#134e4a', '#3b82f6', '#22c55e'];
  const hash = String(value)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
};

const inferSerialTracking = (product = {}) =>
  normalize(product.category) === 'toy box' || normalize(product.name).includes('toy box');

export const isToyBoxProduct = (product, inventory = []) => {
  if (!product) return false;

  if (typeof product === 'object') {
    if (typeof product.isToyBox === 'boolean') return product.isToyBox;
    if (typeof product.supports_serial_tracking === 'boolean') return product.supports_serial_tracking;
    return inferSerialTracking(product);
  }

  const directMatch = buildProductCatalog(inventory).find((item) => item.name === normalizeProductName(product));
  if (directMatch) return directMatch.isToyBox;

  return normalize(product).includes('toy box');
};

export const buildProductCatalog = (inventory = []) => {
  const source = Array.isArray(inventory) && inventory.length > 0 ? inventory : DEFAULT_PRODUCTS;

  return source
    .filter((item) => item?.name)
    .map((item) => {
      const category = item.category || 'Other';
      const supportsSerialTracking = typeof item.supports_serial_tracking === 'boolean'
        ? item.supports_serial_tracking
        : inferSerialTracking(item);

      return {
        ...item,
        name: normalizeProductName(item.name),
        category,
        unit_price: Number(item.unit_price) || 0,
        supports_serial_tracking: supportsSerialTracking,
        isToyBox: supportsSerialTracking,
        color: item.color || CATEGORY_COLORS[category] || hashColor(item.name)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getProductOptions = (inventory = []) => buildProductCatalog(inventory).map((item) => item.name);

export const getProductPriceMap = (inventory = []) => buildProductCatalog(inventory).reduce((acc, item) => {
  acc[item.name] = item.unit_price;
  return acc;
}, {});

export const findProductRecordByName = (inventory = [], productName = '') =>
  buildProductCatalog(inventory).find((item) => item.name === normalizeProductName(productName)) || null;

export const findBestProductMatch = (query = '', inventory = []) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const catalog = buildProductCatalog(inventory);
  const exact = catalog.find((item) => normalize(item.name) === normalizedQuery);
  if (exact) return exact;

  const inclusive = catalog.find((item) =>
    normalize(item.name).includes(normalizedQuery) || normalizedQuery.includes(normalize(item.name))
  );
  if (inclusive) return inclusive;

  return catalog.find((item) => {
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const itemTokens = normalize(item.name).split(/\s+/).filter(Boolean);
    return queryTokens.every((token) => itemTokens.some((itemToken) => itemToken.includes(token) || token.includes(itemToken)));
  }) || null;
};

export const createProductLine = (inventory = [], productName = 'TOY BOX', overrides = {}) => {
  const catalog = buildProductCatalog(inventory);
  const fallback = catalog.find((item) => item.name === 'TOY BOX') || catalog[0] || DEFAULT_PRODUCTS[0];
  const selected = findProductRecordByName(inventory, productName) || fallback;

  return {
    name: selected.name,
    quantity: 1,
    size: '',
    price: selected.unit_price,
    isToyBox: selected.isToyBox,
    toyBoxNumber: null,
    ...overrides
  };
};

export const getSerialTrackedProducts = (inventory = []) =>
  buildProductCatalog(inventory).filter((item) => item.supports_serial_tracking);

export const filterToyBoxesByProduct = (toyBoxes = [], productName = '') =>
  (toyBoxes || [])
    .filter((box) => normalizeProductName(box.product_name || 'TOY BOX') === normalizeProductName(productName))
    .sort((a, b) => Number(a.toy_box_number || 0) - Number(b.toy_box_number || 0));

export const getToyBoxStockKey = (productName = '', toyBoxNumber = null) =>
  `${normalizeProductName(productName || 'TOY BOX')}::${Number(toyBoxNumber || 0)}`;

export const getProductCheckpoints = (inventory = []) => {
  const catalog = buildProductCatalog(inventory);
  return [
    { id: 'all', name: 'All Products', color: '#64748b' },
    ...catalog.map((item) => ({
      id: normalize(item.name).replace(/[^a-z0-9]+/g, '-'),
      name: item.name,
      color: item.color
    }))
  ];
};
