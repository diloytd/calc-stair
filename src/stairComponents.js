import {
  buildFlightPlan,
  getFlightCount,
  getTurnPlatformAngle,
  resolveFlightStepsList,
} from './stairFlightPlan.js';

/**
 * Возвращает безопасное положительное число для размеров 3D-компонентов.
 * Используется генератором, чтобы JSON-конфигурация не получала нулевые габариты.
 * @param {number} value - Проверяемое числовое значение.
 * @param {number} fallback - Значение, которое используется при некорректном вводе.
 * @returns {number} Положительное число для геометрии компонента.
 */
const getPositiveNumber = (value, fallback) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return fallback;
  }

  return Number(value);
};

/**
 * Создает компонент прямого марша для последующей сборки в `StairAssembly`.
 * @param {object} params - Параметры марша.
 * @param {number} params.steps - Количество ступеней в марше.
 * @param {number} params.width - Ширина марша в миллиметрах.
 * @param {number} params.treadDepth - Глубина одной ступени в миллиметрах.
 * @param {number} params.riser - Высота подступенка в миллиметрах.
 * @param {number} params.thickness - Толщина ступени в миллиметрах.
 * @returns {object} Описание компонента типа `march`.
 */
const createMarchComponent = ({ steps, width, treadDepth, riser, thickness, layoutRole }) => ({
  type: 'march',
  steps: Math.max(Math.round(steps), 0),
  width: getPositiveNumber(width, 900),
  treadDepth: getPositiveNumber(treadDepth, 260),
  riser: getPositiveNumber(riser, 175),
  thickness: getPositiveNumber(thickness, 40),
  ...(layoutRole ? { layoutRole } : {}),
});

/**
 * Создает блок «марш + площадка» с общей локальной системой координат.
 * Площадка всегда стыкуется с концом марша внутри одной 3D-группы.
 * @param {object} params - Параметры блока.
 * @param {number} params.steps - Количество ступеней в марше.
 * @param {number} params.width - Ширина марша в миллиметрах.
 * @param {number} params.treadDepth - Глубина одной ступени в миллиметрах.
 * @param {number} params.riser - Высота подступенка в миллиметрах.
 * @param {number} params.thickness - Толщина ступени в миллиметрах.
 * @param {object|null} params.platform - Площадка после марша или `null` для финального марша.
 * @param {string} [params.layoutRole] - Роль блока в схеме лестницы.
 * @param {number} [params.flightIndex] - Порядковый номер марша.
 * @param {number} [params.flightCount] - Общее количество маршей.
 * @param {string} [params.shape] - Форма лестницы для layout.
 * @param {number} [params.anchorMarchLength] - Длина якорного марша для межэтажной площадки.
 * @param {boolean} [params.endsOnFloorLanding] - Последний подъём марша заменяется межэтажной площадкой.
 * @returns {object} Описание компонента типа `flight`.
 */
const createFlightComponent = ({
  steps,
  width,
  treadDepth,
  riser,
  thickness,
  platform,
  layoutRole,
  flightIndex,
  flightCount,
  shape,
  anchorMarchLength,
  endsOnFloorLanding,
}) => ({
  type: 'flight',
  steps: Math.max(Math.round(steps), 0),
  width: getPositiveNumber(width, 900),
  treadDepth: getPositiveNumber(treadDepth, 260),
  riser: getPositiveNumber(riser, 175),
  thickness: getPositiveNumber(thickness, 40),
  platform: platform
    ? {
      length: getPositiveNumber(platform.length, width),
      width: getPositiveNumber(platform.width ?? width, width),
      thickness: getPositiveNumber(platform.thickness ?? thickness, thickness),
      turnAngle: Number(platform.turnAngle) || 0,
    }
    : null,
  ...(layoutRole ? { layoutRole } : {}),
  ...(Number.isFinite(flightIndex) ? { flightIndex } : {}),
  ...(Number.isFinite(flightCount) ? { flightCount } : {}),
  ...(shape ? { shape } : {}),
  ...(Number.isFinite(anchorMarchLength) ? { anchorMarchLength } : {}),
  ...(endsOnFloorLanding ? { endsOnFloorLanding: true } : {}),
});

/**
 * Создает компонент забежного или винтового блока с трапециевидными ступенями по дуге.
 * @param {object} params - Параметры дугового блока.
 * @param {number} params.steps - Количество ступеней в блоке.
 * @param {number} params.innerRadius - Внутренний радиус ступени.
 * @param {number} params.outerRadius - Внешний радиус ступени.
 * @param {number} params.riser - Высота подступенка.
 * @param {number} params.thickness - Толщина ступени.
 * @param {number} params.turnAngle - Угол блока в градусах.
 * @param {string} params.variant - Назначение блока: `winder` или `spiral`.
 * @param {number} [params.startAngleDeg] - Начальный угол первой ступени блока в градусах.
 * @returns {object} Описание компонента типа `spiral`.
 */
const createSpiralComponent = ({ steps, innerRadius, outerRadius, riser, thickness, turnAngle, variant, startAngleDeg = 0 }) => ({
  type: 'spiral',
  steps: Math.max(Math.round(steps), 0),
  innerRadius: getPositiveNumber(innerRadius, 100),
  outerRadius: getPositiveNumber(outerRadius, 900),
  riser: getPositiveNumber(riser, 175),
  thickness: getPositiveNumber(thickness, 40),
  turnAngle: Number(turnAngle) || 90,
  startAngleDeg: Number(startAngleDeg) || 0,
  variant,
});

/**
 * Возвращает сумму ступеней в одном межэтажном пролёте для расчёта проступи.
 * @param {number[]} flightSteps - Ступени по маршам.
 * @param {number} flightIndex - Индекс текущего марша.
 * @param {string} shape - Форма лестницы.
 * @returns {number} Ступени в текущем пролёте.
 */
const getSegmentStepCount = (flightSteps, flightIndex, shape) => {
  if (shape === 'straight') {
    return flightSteps[flightIndex] ?? 1;
  }

  if (shape.includes('platform')) {
    const segmentIndex = Math.floor(flightIndex / 2) * 2;
    const first = flightSteps[segmentIndex] ?? 0;
    const second = flightSteps[segmentIndex + 1] ?? 0;

    return Math.max(first + second, 1);
  }

  return flightSteps.reduce((sum, steps) => sum + steps, 0);
};

/**
 * Возвращает массив блоков `flight` для маршевых лестниц с площадками.
 * Поддерживает произвольное число этажей и маршей.
 * @param {object} form - Текущие параметры формы калькулятора.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @returns {Array<object>} Массив компонентов `flight`.
 */
const generatePlatformComponents = (form, geometry) => {
  const width = getPositiveNumber(form.flightWidth, 900);
  const flightPlan = buildFlightPlan(form, { ...geometry, flightWidth: width });
  const flightSteps = resolveFlightStepsList(form, geometry.safeSteps);
  const marchRunLength = Math.max(geometry.flightLength - geometry.landingLength, 1);

  return flightPlan.flatMap((plan) => {
    const segmentSteps = getSegmentStepCount(flightSteps, plan.flightIndex, form.shape);
    const treadDepth = Math.max(marchRunLength / Math.max(segmentSteps, 1), 1);
    const flightComponent = createFlightComponent({
      riser: geometry.riser,
      thickness: form.treadThickness,
      treadDepth,
      width,
      steps: plan.steps,
      platform: plan.platform,
      layoutRole: `flight-${plan.flightIndex}`,
      flightIndex: plan.flightIndex,
      flightCount: plan.flightCount,
      shape: plan.shape,
      ...(plan.floorLandingAfter ? { endsOnFloorLanding: true } : {}),
    });

    if (!plan.floorLandingAfter) {
      return [flightComponent];
    }

    return [
      flightComponent,
      createFlightComponent({
        riser: geometry.riser,
        thickness: form.treadThickness,
        treadDepth,
        width,
        steps: 0,
        anchorMarchLength: plan.steps * treadDepth,
        platform: {
          length: geometry.landingLength,
          thickness: form.treadThickness,
          turnAngle: getTurnPlatformAngle(form.shape),
          width,
        },
        layoutRole: 'l-floor-landing',
        flightIndex: plan.flightIndex,
        shape: plan.shape,
      }),
    ];
  });
};

/**
 * Возвращает цепочку прямых маршей с промежуточными площадками для многоэтажной прямой лестницы.
 * @param {object} form - Текущие параметры формы калькулятора.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @returns {Array<object>} Массив компонентов `flight`.
 */
const generateStraightMultiFlightComponents = (form, geometry) => {
  const width = getPositiveNumber(form.flightWidth, 900);
  const flightPlan = buildFlightPlan(form, { ...geometry, flightWidth: width });
  const flightSteps = resolveFlightStepsList(form, geometry.safeSteps);

  return flightPlan.map((plan) => {
    const segmentSteps = getSegmentStepCount(flightSteps, plan.flightIndex, 'straight');
    const treadDepth = Math.max(geometry.flightLength / Math.max(segmentSteps, 1), 180);

    return createFlightComponent({
      riser: geometry.riser,
      thickness: form.treadThickness,
      treadDepth,
      width,
      steps: plan.steps,
      platform: plan.platform
        ? {
          ...plan.platform,
          width,
        }
        : null,
      layoutRole: `flight-${plan.flightIndex}`,
      flightIndex: plan.flightIndex,
      flightCount: plan.flightCount,
      shape: 'straight',
    });
  });
};

/**
 * Генерирует компонентную конфигурацию 3D-лестницы для всех поддерживаемых форм.
 * Используется Zustand-store при каждом изменении параметров формы.
 * @param {object} form - Текущие параметры лестницы.
 * @param {object} params - Рассчитанные параметры геометрии.
 * @returns {Array<{type: 'march'|'platform'|'flight'|'spiral'}>} Массив компонентов для `StairAssembly`.
 */
export const generateComponents = (form, params) => {
  if (form.shape === 'spiral') {
    return [
      createSpiralComponent({
        innerRadius: params.innerRadius,
        outerRadius: params.outerRadius,
        riser: params.riser,
        steps: params.safeSteps,
        thickness: form.treadThickness,
        turnAngle: params.spiralTotalAngle,
        variant: 'spiral',
      }),
    ];
  }

  if (form.shape === 'straight') {
    if (getFlightCount(form) > 1) {
      return generateStraightMultiFlightComponents(form, params);
    }

    return [
      createMarchComponent({
        riser: params.riser,
        steps: params.safeSteps,
        thickness: form.treadThickness,
        treadDepth: Math.max(params.tread, 180),
        width: form.flightWidth,
      }),
    ];
  }

  if (form.shape.includes('platform')) {
    return generatePlatformComponents(form, params);
  }

  return [];
};

export { getFlightCount, resolveFlightStepsList };
