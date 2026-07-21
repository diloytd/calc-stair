import { PRICE_CONFIG } from './priceConfig.js';

/**
 * Форматирует сумму в рублях для отображения в интерфейсе.
 * @param {number} value - Сумма в рублях.
 * @returns {string} Строка вида «120 000 ₽».
 */
export const formatPrice = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
};

/**
 * Возвращает тариф материала или деревянный по умолчанию.
 * @param {string} material - Идентификатор материала из формы.
 * @returns {object} Тариф материала.
 */
const getMaterialRate = (material) => PRICE_CONFIG.materials[material] ?? PRICE_CONFIG.materials.wood;

/**
 * Считает ориентировочную стоимость лестницы в вилке «от — до».
 * Цена показывается всегда, даже если лестница не проходит проверки по нормам.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия.
 * @param {{ errors: Array<object> }} report - Результат проверок.
 * @returns {{
 *   min: number,
 *   max: number,
 *   materialLabel: string,
 *   hasNormErrors: boolean,
 *   note: string
 * }} Ориентировочная цена и пояснение.
 */
export const calculatePrice = (form, geometry, report) => {
  const materialRate = getMaterialRate(form.material);
  const hasNormErrors = report.errors.length > 0;
  const shapeMultiplier = PRICE_CONFIG.shapeMultipliers[form.shape] ?? 1;
  const floorMultiplier = geometry.floorCount > 2 ? PRICE_CONFIG.extraFloorMultiplier : 1;
  const volumeCost = (geometry.totalVolume ?? 0) * materialRate.perCubicMeter;
  const stepsCost = geometry.safeSteps * materialRate.perStep;
  const basePrice = (stepsCost + volumeCost) * shapeMultiplier * floorMultiplier;
  const min = Math.max(Math.round(basePrice * PRICE_CONFIG.rangeSpread.min), PRICE_CONFIG.minPrice);
  const max = Math.max(Math.round(basePrice * PRICE_CONFIG.rangeSpread.max), min);

  return {
    min,
    max,
    materialLabel: materialRate.label,
    hasNormErrors,
    note: hasNormErrors
      ? 'Ориентировочно по текущим размерам. Лестница не проходит нормы — точная цена возможна после исправления или замера.'
      : 'Ориентировочно, без монтажа и доставки. Точную сумму назовём после замера.',
  };
};
