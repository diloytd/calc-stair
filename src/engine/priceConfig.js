/**
 * Базовые тарифы для ориентировочного расчёта стоимости лестницы.
 * Значения в рублях, без монтажа и доставки.
 */
export const PRICE_CONFIG = {
  materials: {
    wood: {
      label: 'Дерево',
      perStep: 8500,
      perCubicMeter: 120000,
    },
    steel: {
      label: 'Металл',
      perStep: 12000,
      perCubicMeter: 180000,
    },
    concrete: {
      label: 'Бетон',
      perStep: 15000,
      perCubicMeter: 95000,
    },
    combined: {
      label: 'Комбинированная',
      perStep: 14000,
      perCubicMeter: 150000,
    },
  },
  shapeMultipliers: {
    straight: 1,
    'l-platform': 1.25,
    'u-platform': 1.45,
    spiral: 1.35,
  },
  rangeSpread: {
    min: 0.88,
    max: 1.22,
  },
  extraFloorMultiplier: 1.12,
  minPrice: 45000,
};
