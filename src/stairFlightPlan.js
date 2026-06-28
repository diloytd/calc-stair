const RIGHT_ANGLE = 90;
const U_TURN_ANGLE = 180;
const MAX_STEPS_PER_FLIGHT = 18;

/**
 * Минимальное и максимальное число этажей для частного дома по СП.
 * @type {number}
 */
export const MIN_FLOOR_COUNT = 2;

/**
 * @type {number}
 */
export const MAX_FLOOR_COUNT = 3;

/**
 * Возвращает количество этажей здания в диапазоне 2–3.
 * @param {object} form - Текущие параметры формы калькулятора.
 * @returns {number} Число этажей.
 */
export const getFloorCount = (form) => Math.min(
  MAX_FLOOR_COUNT,
  Math.max(Math.round(Number(form.floors) || MIN_FLOOR_COUNT), MIN_FLOOR_COUNT),
);

/**
 * Возвращает полный вертикальный подъём лестницы от нижнего до верхнего этажа.
 * @param {object} form - Текущие параметры формы с высотой этажа `height`.
 * @returns {number} Суммарный подъём в миллиметрах.
 */
export const getTotalRise = (form) => form.height * (getFloorCount(form) - 1);

/**
 * Возвращает количество маршей на один межэтажный пролёт для выбранной формы.
 * @param {string} shape - Идентификатор формы лестницы.
 * @returns {number} Число маршей между соседними этажами.
 */
export const getFlightsPerSegment = (shape) => {
  if (shape === 'l-platform' || shape === 'u-platform') {
    return 2;
  }

  return 1;
};

/**
 * Возвращает общее количество маршей для всей лестницы.
 * @param {object} form - Текущие параметры формы.
 * @returns {number} Число маршей от низа до верха.
 */
export const getFlightCount = (form) => {
  if (form.shape === 'spiral') {
    return 1;
  }

  return getFlightsPerSegment(form.shape) * (getFloorCount(form) - 1);
};

/**
 * Равномерно распределяет ступени между маршами.
 * @param {number} totalSteps - Общее количество подъёмов.
 * @param {number} flightCount - Количество маршей.
 * @returns {number[]} Массив ступеней по каждому маршу.
 */
export const distributeStepsEvenly = (totalSteps, flightCount) => {
  const safeCount = Math.max(Math.round(flightCount), 1);
  const safeTotal = Math.max(Math.round(totalSteps), 0);
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal % safeCount;

  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
};

/**
 * Формирует список ступеней по маршам с учётом ручного ввода первого марша.
 * @param {object} form - Текущие параметры формы.
 * @param {number} totalSteps - Общее количество подъёмов.
 * @returns {number[]} Ступени в каждом марше.
 */
export const resolveFlightStepsList = (form, totalSteps) => {
  const flightCount = getFlightCount(form);
  const safeTotal = Math.max(Math.round(totalSteps), 0);

  if (flightCount <= 1) {
    return [safeTotal];
  }

  if (flightCount === 2 && form.shape.includes('platform')) {
    const firstFlightSteps = Math.max(Math.round(Number(form.firstFlightSteps) || 0), 0);

    return [
      firstFlightSteps,
      Math.max(safeTotal - firstFlightSteps, 0),
    ];
  }

  return distributeStepsEvenly(safeTotal, flightCount);
};

/**
 * Возвращает угол поворота поворотной площадки внутри одного этажного пролёта.
 * @param {string} shape - Форма лестницы.
 * @returns {number} Угол поворота в градусах.
 */
export const getTurnPlatformAngle = (shape) => {
  if (shape === 'l-platform') {
    return RIGHT_ANGLE;
  }

  if (shape === 'u-platform') {
    return U_TURN_ANGLE;
  }

  return 0;
};

/**
 * Возвращает true, если после марша нужна межэтажная площадка.
 * @param {string} shape - Форма лестницы.
 * @param {number} flightIndex - Индекс марша.
 * @param {number} flightCount - Общее число маршей.
 * @returns {boolean} Нужна ли отдельная площадка между этажами.
 */
export const needsFloorLandingAfter = (shape, flightIndex, flightCount) => (
  shape === 'l-platform'
  && flightIndex % 2 === 1
  && flightIndex < flightCount - 1
);

/**
 * Возвращает ширину поворотной площадки для выбранной формы лестницы.
 * П-образная лестница всегда использует площадку на две ширины марша.
 * @param {string} shape - Форма лестницы.
 * @param {number} flightWidth - Ширина марша в миллиметрах.
 * @returns {number} Ширина площадки в миллиметрах.
 */
export const getPlatformWidth = (shape, flightWidth) => {
  if (shape === 'u-platform') {
    return flightWidth * 2;
  }

  return flightWidth;
};

/**
 * Возвращает угол поворота после площадки для марша в цепочке.
 * @param {string} shape - Форма лестницы.
 * @param {number} flightIndex - Индекс марша (0-based).
 * @param {number} flightCount - Общее число маршей.
 * @returns {number} Угол поворота в градусах или 0 для финального марша.
 */
export const getPlatformTurnAngle = (shape, flightIndex, flightCount) => {
  if (flightIndex >= flightCount - 1) {
    return 0;
  }

  return getTurnPlatformAngle(shape);
};

/**
 * Создаёт план маршей: ступени, площадки и метаданные для layout.
 * Поворотная площадка только у прямых маршей (0, 2, 4…).
 * Между этажами — отдельная площадка после обратного марша (1, 3…).
 * @param {object} form - Текущие параметры формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @returns {Array<{steps: number, flightIndex: number, flightCount: number, shape: string, platform: object|null, floorLandingAfter: boolean}>} План маршей.
 */
export const buildFlightPlan = (form, geometry) => {
  const flightCount = getFlightCount(form);
  const flightSteps = resolveFlightStepsList(form, geometry.safeSteps);
  const turnAngle = getTurnPlatformAngle(form.shape);

  return flightSteps.map((steps, flightIndex) => {
    const isLast = flightIndex === flightCount - 1;
    const isForward = flightIndex % 2 === 0;
    const hasTurnPlatform = form.shape === 'u-platform'
      ? !isLast
      : isForward && !isLast;

    return {
      steps,
      flightIndex,
      flightCount,
      shape: form.shape,
      floorLandingAfter: needsFloorLandingAfter(form.shape, flightIndex, flightCount),
      platform: hasTurnPlatform
        ? {
          length: geometry.landingLength,
          thickness: form.treadThickness,
          turnAngle,
          width: getPlatformWidth(form.shape, geometry.flightWidth ?? form.flightWidth),
        }
        : null,
    };
  });
};

/**
 * Возвращает максимальное число ступеней в одном марше для проверок.
 * @param {number[]} flightSteps - Ступени по маршам.
 * @returns {number} Максимум ступеней в марше.
 */
export const getMaxStepsPerFlight = (flightSteps) => {
  if (!flightSteps.length) {
    return 0;
  }

  return Math.max(...flightSteps);
};

/**
 * Проверяет, что все марши укладываются в допустимый диапазон ступеней.
 * @param {number[]} flightSteps - Ступени по маршам.
 * @param {number} [maxSteps=18] - Максимум ступеней в марше.
 * @returns {boolean} `true`, если ни один марш не превышает лимит.
 */
export const areFlightStepsWithinLimit = (flightSteps, maxSteps = MAX_STEPS_PER_FLIGHT) => (
  flightSteps.every((steps) => steps === 0 || steps <= maxSteps)
);

export { MAX_STEPS_PER_FLIGHT };
