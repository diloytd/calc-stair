import { getTotalRise } from '../stairFlightPlan.js';

const TARGET_RISER = 175;
const MIN_TREAD = 260;
const STANDARD_TREAD = 280;
const MIN_FLIGHT_WIDTH = 800;

/**
 * Ограничивает число заданными границами.
 * @param {number} value - Проверяемое число.
 * @param {number} min - Минимум.
 * @param {number} max - Максимум.
 * @returns {number} Число в диапазоне.
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Оценивает количество подъёмов по высоте этажа.
 * @param {number} totalRise - Полный подъём в миллиметрах.
 * @returns {number} Ориентировочное количество ступеней.
 */
export const estimateSteps = (totalRise) => clamp(Math.round(totalRise / TARGET_RISER), 3, 18);

/**
 * Возвращает минимальную длину зоны для прямой лестницы.
 * @param {number} steps - Количество подъёмов.
 * @returns {number} Минимальная длина в миллиметрах.
 */
export const getMinStraightLength = (steps) => Math.max(steps - 1, 1) * MIN_TREAD;

/**
 * Возвращает стандартную длину проёма при отсутствии ограничений по месту.
 * @param {number} steps - Количество подъёмов.
 * @returns {number} Рекомендуемая длина проёма в миллиметрах.
 */
export const getDefaultOpeningLength = (steps) => Math.max(steps - 1, 1) * STANDARD_TREAD;

/**
 * Подбирает тип лестницы по высоте подъёма и доступному месту.
 * @param {object} params - Входные параметры пользователя.
 * @param {number} params.height - Высота этажа, мм.
 * @param {number} [params.floors=2] - Количество этажей.
 * @param {number|null} [params.openingLength] - Длина зоны, мм.
 * @param {number} [params.flightWidth=900] - Ширина зоны, мм.
 * @param {boolean} [params.hasSpaceLimit=false] - Есть ли ограничение по месту.
 * @returns {{ shape: string, label: string, reason: string, confidence: 'high'|'medium'|'low', estimatedSteps: number }}
 */
export const suggestStairType = ({
  height,
  floors = 2,
  openingLength = null,
  flightWidth = 900,
  hasSpaceLimit = false,
}) => {
  const formStub = { height, floors, shape: 'straight', openingLength: openingLength ?? getDefaultOpeningLength(16) };
  const totalRise = getTotalRise(formStub);
  const estimatedSteps = estimateSteps(totalRise);
  const minStraight = getMinStraightLength(estimatedSteps);
  const safeWidth = Math.max(Number(flightWidth) || 900, MIN_FLIGHT_WIDTH);
  const minLShape = Math.ceil(minStraight / 2) + safeWidth;

  if (!hasSpaceLimit || !openingLength) {
    return {
      shape: 'straight',
      label: 'Прямая маршевая',
      reason: 'Принят стандартный вариант — точный тип уточняется на замере.',
      confidence: 'low',
      estimatedSteps,
    };
  }

  const availableLength = Number(openingLength);

  if (availableLength >= minStraight) {
    return {
      shape: 'straight',
      label: 'Прямая маршевая',
      reason: 'По вашим размерам помещается прямой марш — самый экономичный вариант.',
      confidence: 'high',
      estimatedSteps,
    };
  }

  if (availableLength >= minLShape) {
    return {
      shape: 'l-platform',
      label: 'Г-образная с площадкой',
      reason: 'Для этой высоты прямой марш не помещается — подойдёт поворот на 90°.',
      confidence: 'medium',
      estimatedSteps,
    };
  }

  return {
    shape: 'spiral',
    label: 'Винтовая',
    reason: 'Зона очень компактная — оптимальна винтовая лестница.',
    confidence: 'high',
    estimatedSteps,
  };
};

/**
 * Применяет простой ввод пользователя к полной форме калькулятора.
 * @param {object} currentForm - Текущая форма.
 * @param {object} patch - Изменения от SimpleInputPanel.
 * @returns {object} Обновлённая форма с автоопределённым типом.
 */
export const applySimpleInputToForm = (currentForm, patch) => {
  const next = { ...currentForm, ...patch };
  const suggestion = suggestStairType({
    height: next.height,
    floors: next.floors,
    openingLength: next.hasSpaceLimit ? next.openingLength : null,
    flightWidth: next.flightWidth,
    hasSpaceLimit: next.hasSpaceLimit,
  });
  const steps = suggestion.estimatedSteps;
  const halfSteps = Math.max(Math.floor(steps / 2), 1);
  const openingLength = next.hasSpaceLimit
    ? Number(next.openingLength)
    : getDefaultOpeningLength(steps);

  return {
    ...next,
    shape: suggestion.shape,
    openingLength,
    useAutoSteps: true,
    landingLength: Number(next.flightWidth),
    firstFlightSteps: halfSteps,
    secondFlightSteps: Math.max(steps - halfSteps, 1),
  };
};
