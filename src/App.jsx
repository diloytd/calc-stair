import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import ExportPanel from './ExportPanel.jsx';
import Staircase3D from './Staircase3D.jsx';
import { generateComponents } from './stairComponents.js';
import {
  getFlightCount,
  getFloorCount,
  getMaxStepsPerFlight,
  getTotalRise,
  resolveFlightStepsList,
} from './stairFlightPlan.js';

const SHAPES = [
  { value: 'straight', label: 'Прямая одномаршевая' },
  { value: 'l-platform', label: 'Г-образная с площадкой' },
  { value: 'u-platform', label: 'П-образная с площадкой' },
  { value: 'spiral', label: 'Винтовая (спиральная)' },
];

const MATERIALS = [
  { value: 'wood', label: 'Дерево' },
  { value: 'steel', label: 'Сталь' },
  { value: 'concrete', label: 'Железобетон' },
];

const PARAMETER_HINTS = {
  blondel: 'Расчетный показатель удобства шага: 2h + b. Ориентир по СП 55.13330.2016 и практике проектирования — 600-640 мм.',
  fireType: 'Классификация лестницы по пожарным требованиям СП 1.13130.2020. Для эвакуационных лестниц применяются более строгие ограничения.',
  flightWidth: 'Расстояние от одного края ступени до другого края ступени поперек лестницы. Ориентир по СП 55.13330.2016 для частного дома — не менее 900 мм.',
  flightLength: 'Горизонтальная длина одного марша. Прямой нормы нет: значение определяется глубиной ступени и количеством подъемов.',
  form: 'Конструктивная схема лестницы. Выбор формы влияет на проверки по СП 55.13330.2016, ГОСТ 9818-2015 и СП 1.13130.2020.',
  headroom: 'Свободная высота над лестницей в зоне прохода. Ориентир по СП 55.13330.2016 — не менее 2000 мм.',
  height: 'Высота одного этажа между чистыми полами соседних уровней. Для многоэтажной лестницы общий подъём = H × (этажей − 1).',
  floors: 'Количество этажей здания (от 2 до 3). Лестница строится от нижнего до верхнего уровня с промежуточными площадками между этажами.',
  material: 'Основной материал несущей конструкции лестницы. Требования к конструкциям учитываются по ГОСТ 9818-2015 и профильным нормам.',
  openingLength: 'Сколько места по полу есть под лестницу в длину. Это расстояние от начала лестницы до места, где она должна прийти к верхнему этажу, если смотреть сверху. Чем меньше значение, тем круче лестница; чем больше — тем глубже и удобнее ступени.',
  planSize: 'Габариты лестницы на виде сверху. Прямой нормы нет: размер должен помещаться в проем и сохранять нормативную ширину марша.',
  railingHeight: 'Высота ограждения от ступени до верха перил. Ориентир по СП 55.13330.2016 — не менее 900 мм.',
  riser: 'Высота одного подъема между соседними ступенями. Ориентир по СП 55.13330.2016 — 150-200 мм.',
  slopeAngle: 'Угол наклона лестницы относительно пола. Рекомендуемый диапазон для маршевой лестницы — 30-40°, для винтовой — 25-35°.',
  steps: 'Количество подъемов от нижнего до верхнего уровня. По ГОСТ 9818-2015 для марша используется диапазон 3-18 подъемов.',
  stringerThickness: 'Толщина боковой несущей балки (тетивы или косоура).',
  tread: 'Расчетная глубина ступени в зоне постановки стопы. Ориентир для марша: 260-300 мм.',
  treadOverhang: 'Нависание проступи над подступенком. Рекомендуется не более 50 мм.',
  treadThickness: 'Толщина доски или плиты ступени. Влияет на расход материала.',
  landingLength: 'Габарит промежуточной площадки по направлению движения. По умолчанию равен ширине марша.',
  firstFlightSteps: 'Количество подъемов до первого поворота или площадки. Остальные марши считаются от общего n.',
  secondFlightSteps: 'Остаток подъемов после 1-го марша: n минус введенный первый марш.',
  outerRadius: 'Внешний радиус винтовой лестницы от центра стойки до наружного края ступени.',
  innerRadius: 'Внутренний радиус винтовой лестницы или радиус центральной стойки.',
  spiralStepsPerTurn: 'Количество ступеней на один полный оборот винтовой лестницы.',
};

const RESULT_TABS = [
  { id: 'input-parameters', label: 'Ввод параметров' },
  { id: 'side-view', label: 'Вид сбоку' },
  { id: 'top-view', label: 'Вид сверху' },
  { id: 'three-d', label: '3D-визуализация' },
  { id: 'parameters', label: 'Параметры' },
  { id: 'checks', label: 'Проверки' },
  { id: 'export', label: 'Экспорт' },
];

const INITIAL_FORM = {
  height: 3000,
  floors: 3,
  flightWidth: 900,
  openingLength: 4200,
  useAutoSteps: true,
  steps: 16,
  shape: 'straight',
  material: 'wood',
  treadThickness: 40,
  treadOverhang: 30,
  stringerThickness: 50,
  landingLength: 900,
  firstFlightSteps: 8,
  secondFlightSteps: 4,
  outerRadius: 1000,
  innerRadius: 200,
  spiralStepsPerTurn: 12,
  headroom: 2100,
  railingHeight: 900,
  fireType: 'Л1 с окнами',
};

/**
 * Ограничивает число заданными границами.
 * Используется в авторасчете количества подъемов, чтобы не выходить за мягкий диапазон частного дома.
 * @param {number} value - Проверяемое число.
 * @param {number} min - Минимально допустимое значение.
 * @param {number} max - Максимально допустимое значение.
 * @returns {number} Число в диапазоне от `min` до `max`.
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Форматирует числовые значения для таблиц и подписей на чертежах.
 * @param {number} value - Значение для вывода.
 * @param {number} digits - Количество знаков после запятой, по умолчанию 0.
 * @returns {string} Отформатированная строка или тире, если значение некорректно.
 */
const formatNumber = (value, digits = 0) => {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

/**
 * Проверяет попадание значения в закрытый числовой диапазон.
 * @param {number} value - Проверяемое значение.
 * @param {number} min - Нижняя граница диапазона.
 * @param {number} max - Верхняя граница диапазона.
 * @returns {boolean} `true`, если значение находится в диапазоне включительно.
 */
const isBetween = (value, min, max) => value >= min && value <= max;

/**
 * Определяет, относится ли форма лестницы к маршевым схемам с обычной проступью.
 * @param {string} shape - Идентификатор формы лестницы.
 * @returns {boolean} `true` для прямой лестницы и лестниц с площадкой.
 */
const isMarchShape = (shape) => shape === 'straight' || shape.includes('platform');

const FIELD_VISIBILITY_BY_SHAPE = {
  straight: ['flightWidth', 'openingLength', 'autoSteps'],
  'l-platform': ['flightWidth', 'openingLength', 'landingLength', 'firstFlightSteps', 'secondFlightSteps'],
  'u-platform': ['flightWidth', 'openingLength', 'landingLength', 'firstFlightSteps', 'secondFlightSteps'],
  spiral: ['outerRadius', 'innerRadius', 'spiralStepsPerTurn'],
};

/**
 * Проверяет, нужно ли показывать поле для выбранной формы лестницы.
 * @param {string} shape - Идентификатор выбранной формы лестницы.
 * @param {string} fieldName - Имя поля формы.
 * @returns {boolean} `true`, если поле входит в набор параметров формы.
 */
const isFieldVisible = (shape, fieldName) => FIELD_VISIBILITY_BY_SHAPE[shape]?.includes(fieldName) ?? false;

/**
 * Возвращает количество ступеней, которое сейчас видит пользователь.
 * Нужно при смене формы, чтобы сохранить n даже если был включен авторасчет.
 * @param {object} form - Текущие значения формы.
 * @returns {number} Текущее количество подъемов.
 */
const getResolvedSteps = (form) => (form.useAutoSteps ? calculateAutoSteps(form) : Number(form.steps));

/**
 * Рассчитывает дефолтные значения дополнительных полей для выбранной формы.
 * Базовые поля H, ширина, n, материал, W, F и T не меняются.
 * @param {string} shape - Новая форма лестницы.
 * @param {object} currentForm - Текущее состояние формы до переключения.
 * @returns {object} Значения дополнительных полей для сброса.
 */
const getShapeDefaults = (shape, currentForm) => {
  const safeSteps = Math.max(getResolvedSteps(currentForm), 3);
  const halfSteps = Math.max(Math.floor(safeSteps / 2), 1);
  const thirdSteps = Math.max(Math.floor(safeSteps / 3), 1);

  return {
    landingLength: Number(currentForm.flightWidth),
    firstFlightSteps: halfSteps,
    secondFlightSteps: Math.max(safeSteps - halfSteps, 1),
    outerRadius: 1000,
    innerRadius: 200,
    spiralStepsPerTurn: 12,
  };
};

/**
 * Возвращает угол поворота для выбранной формы лестницы.
 * @param {string} shape - Идентификатор формы лестницы.
 * @returns {number} Угол поворота в градусах.
 */
const getTurnAngle = (shape) => {
  if (shape.includes('180') || shape === 'u-platform') {
    return 180;
  }

  if (shape === 'straight' || shape === 'spiral') {
    return 0;
  }

  return 90;
};

/**
 * Подбирает количество подъемов по высоте и длине проема.
 * Оценивает варианты 3-18 по высоте ступени, формуле Блонделя и глубине проступи.
 * @param {object} form - Текущие значения формы.
 * @returns {number} Рекомендуемое количество подъемов.
 */
const calculateAutoSteps = (form) => {
  const totalRise = getTotalRise(form);
  const flightCount = getFlightCount(form);
  const minSteps = Math.max(flightCount * 3, 3);
  const maxSteps = flightCount * 18;
  let bestSteps = clamp(Math.round(totalRise / 175), minSteps, maxSteps);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let steps = minSteps; steps <= maxSteps; steps += 1) {
    const riser = totalRise / steps;
    const tread = form.openingLength / Math.max(steps - 1, 1);
    const blondel = 2 * riser + tread;
    const riserPenalty = isBetween(riser, 150, 200) ? 0 : Math.abs(riser - 175) * 4;
    const treadTarget = 280;
    const treadPenalty = Math.abs(tread - treadTarget);
    const blondelPenalty = Math.abs(blondel - 620);
    const score = riserPenalty + treadPenalty + blondelPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestSteps = steps;
    }
  }

  return bestSteps;
};

/**
 * Рассчитывает длину проема L для форм, где пользователь ее не вводит.
 * @param {object} form - Текущие значения формы.
 * @returns {number} Введенная или расчетная длина проема L в миллиметрах.
 */
const calculateOpeningLength = (form) => {
  if (form.shape === 'spiral') {
    return Number(form.outerRadius) * 2;
  }

  return Number(form.openingLength);
};

/**
 * Рассчитывает длины маршей для площадочных форм по введенным пользователем ступеням.
 * Автоматические поля выводятся как остаток от общего количества n.
 * @param {object} form - Текущие значения формы.
 * @param {number} safeSteps - Общее количество подъемов.
 * @returns {object} Количество подъемов в каждом марше.
 */
const calculateFlightSteps = (form, safeSteps) => {
  const flightStepsList = resolveFlightStepsList(form, safeSteps);

  return {
    firstFlightSteps: flightStepsList[0] ?? 0,
    secondFlightSteps: flightStepsList[1] ?? 0,
    thirdFlightSteps: flightStepsList[2] ?? 0,
    flightStepsList,
    flightCount: getFlightCount(form),
    maxStepsPerFlight: getMaxStepsPerFlight(flightStepsList),
    minStepsPerFlight: flightStepsList.filter((steps) => steps > 0).length
      ? Math.min(...flightStepsList.filter((steps) => steps > 0))
      : 0,
  };
};

/**
 * Рассчитывает ориентировочный расход материала для ступеней и двух боковых несущих балок.
 * Свес F учитывается только как добавочная глубина заготовки проступи и не меняет расчетную глубину шага b.
 * @param {object} form - Текущие значения формы с толщинами W, F и T.
 * @param {object} geometry - Базовая геометрия лестницы, рассчитанная без влияния W, F и T.
 * @returns {object} Объемы в м³, длина балки в м и ориентировочный вес стали в кг.
 */
const calculateMaterialUsage = (form, geometry) => {
  const treadBlankDepth = geometry.activeTread + form.treadOverhang;
  const treadVolume = (
    geometry.safeSteps
    * geometry.treadWidth
    * treadBlankDepth
    * form.treadThickness
  ) / 1_000_000_000;
  const horizontalRun = form.shape === 'spiral' ? geometry.safeSteps * geometry.spiralLineTread : geometry.flightLength;
  const stringerLength = Math.hypot(geometry.totalRise ?? form.height, horizontalRun) / 1000;
  // Высоту балки принимаем приближенно как два подступенка, чтобы T влияла на объем несущей части.
  const stringerHeight = Math.max(geometry.riser * 2, 220);
  const stringerVolume = (2 * stringerLength * form.stringerThickness * stringerHeight) / 1_000_000;
  const totalVolume = treadVolume + stringerVolume;

  return {
    steelWeight: totalVolume * 7850,
    stringerHeight,
    stringerLength,
    stringerVolume,
    totalVolume,
    treadBlankDepth,
    treadVolume,
  };
};

/**
 * Рассчитывает геометрию лестницы по введенным параметрам.
 * Для маршевых схем использует горизонтальную проекцию, для винтовой - дугу окружности на радиусе линии хода.
 * @param {object} form - Текущие значения формы.
 * @returns {object} Рассчитанные геометрические параметры.
 */
const calculateGeometry = (form) => {
  const steps = form.useAutoSteps ? calculateAutoSteps(form) : Number(form.steps);
  const safeSteps = Math.max(steps, 1);
  const floorCount = getFloorCount(form);
  const totalRise = getTotalRise(form);
  const riser = totalRise / safeSteps;
  const turnAngle = getTurnAngle(form.shape);
  const flightSteps = calculateFlightSteps(form, safeSteps);
  const flightLength = calculateOpeningLength(form);
  const landingLength = Math.max(Number(form.landingLength), Number(form.flightWidth));
  const marchRunLength = form.shape.includes('platform')
    ? Math.max(flightLength - landingLength, 1)
    : flightLength;
  const tread = marchRunLength / Math.max(safeSteps - 1, 1);
  const innerRadius = Number(form.innerRadius);
  const outerRadius = Number(form.outerRadius);
  const walkingRadius = (outerRadius + innerRadius) / 2;
  const spiralStepsPerTurn = Math.max(Number(form.spiralStepsPerTurn), 1);
  const spiralStepAngleDeg = 360 / spiralStepsPerTurn;
  const spiralStepAngleRad = spiralStepAngleDeg * (Math.PI / 180);
  const spiralLineTread = walkingRadius * spiralStepAngleRad;
  const spiralNarrowEnd = innerRadius * spiralStepAngleRad;
  const spiralHeadroom = riser * spiralStepsPerTurn;
  const spiralTotalAngle = spiralStepAngleDeg * safeSteps;
  const treadWidth = form.shape === 'spiral' ? Math.max(outerRadius - innerRadius, 1) : Number(form.flightWidth);
  const activeTread = form.shape === 'spiral' ? spiralLineTread : tread;
  const slopeAngle = Math.atan(totalRise / Math.max((safeSteps - 1) * activeTread, 1)) * (180 / Math.PI);
  const spiralSlopeAngle = Math.atan(riser / spiralLineTread) * (180 / Math.PI);
  const blondel = 2 * riser + activeTread;
  const planLength = form.shape === 'spiral' ? outerRadius * 2 : flightLength;
  const planWidth = form.shape === 'straight' ? form.flightWidth : form.shape === 'spiral' ? outerRadius * 2 : form.flightWidth * 2;
  const materialUsage = calculateMaterialUsage(form, {
    activeTread,
    flightLength,
    riser,
    safeSteps,
    spiralLineTread,
    treadWidth,
    totalRise,
  });

  return {
    activeTread,
    blondel,
    floorCount,
    flightLength,
    ...flightSteps,
    innerRadius,
    landingLength,
    outerRadius,
    planLength,
    planWidth,
    riser,
    safeSteps,
    ...materialUsage,
    slopeAngle,
    spiralHeadroom,
    spiralLineTread,
    spiralNarrowEnd,
    spiralSlopeAngle,
    spiralStepAngleDeg,
    spiralStepsPerTurn,
    spiralTotalAngle,
    tread,
    totalRise,
    turnAngle,
    walkingRadius,
  };
};

/**
 * Создает одну строку проверки для итоговой таблицы.
 * @param {'ok'|'warn'|'error'} status - Статус проверки.
 * @param {string} title - Название проверки.
 * @param {string} value - Фактическое значение.
 * @param {string} note - Нормативное или рекомендованное условие.
 * @param {string} [fix] - Подсказка, какие поля изменить для исправления ошибки.
 * @returns {object} Объект проверки для рендера.
 */
const createCheck = (status, title, value, note, fix = '') => ({ status, title, value, note, fix });

/**
 * Формирует обязательные проверки и рекомендации по рассчитанной геометрии.
 * Красный статус означает ошибку, желтый - рекомендацию, зеленый - соответствие.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанные геометрические параметры.
 * @returns {object} Разделенные списки ошибок, предупреждений и всех проверок.
 */
const buildChecks = (form, geometry) => {
  const checks = [];
  const isSpiral = form.shape === 'spiral';
  const isMarch = isMarchShape(form.shape);
  const stepsFix = form.shape === 'straight'
    ? 'Измените высоту подъема H, длину проема L или отключите авторасчет и задайте количество подъемов вручную.'
    : 'Измените высоту подъема H или общее количество ступеней n.';
  const treadFix = 'Измените длину проема L, количество подъемов n или распределение ступеней по маршам.';

  checks.push(
    createCheck(
      geometry.flightCount > 1
        ? (geometry.minStepsPerFlight >= 3 && geometry.maxStepsPerFlight <= 18 ? 'ok' : 'error')
        : (isBetween(geometry.safeSteps, 3, 18) ? 'ok' : 'error'),
      'Число ступеней в марше',
      geometry.flightCount > 1
        ? `${geometry.maxStepsPerFlight} шт. макс. (${geometry.flightCount} маршей)`
        : `${geometry.safeSteps} шт.`,
      'Обязательный диапазон: 3-18 на каждый марш',
      stepsFix,
    ),
  );
  checks.push(
    createCheck(
      isBetween(geometry.riser, 150, 200) ? 'ok' : 'error',
      'Высота ступени',
      `${formatNumber(geometry.riser, 1)} мм`,
      'Обязательный диапазон: 150-200 мм',
      'Измените количество подъемов n или общую высоту подъема H.',
    ),
  );

  if (isMarch) {
    checks.push(
      createCheck(
        isBetween(geometry.tread, 260, 300) ? 'ok' : 'error',
        'Глубина проступи маршевой лестницы',
        `${formatNumber(geometry.tread, 1)} мм`,
        'Обязательный диапазон: 260-300 мм',
        treadFix,
      ),
    );
  }

  if (isSpiral) {
    checks.push(
      createCheck(
        geometry.spiralLineTread >= 180 ? 'ok' : 'error',
        'Винтовая: проступь по линии хода',
        `${formatNumber(geometry.spiralLineTread, 1)} мм`,
        'Минимум 180 мм',
        'Увеличьте внешний радиус R, уменьшите внутренний радиус r или уменьшите количество ступеней на полный оборот.',
      ),
    );
    checks.push(
      createCheck(
        geometry.spiralNarrowEnd >= 100 ? 'ok' : 'error',
        'Винтовая: узкая часть',
        `${formatNumber(geometry.spiralNarrowEnd, 1)} мм`,
        'Минимум 100 мм',
        'Увеличьте внутренний радиус r или уменьшите количество ступеней на полный оборот.',
      ),
    );
    checks.push(
      createCheck(
        geometry.spiralHeadroom >= 2000 ? 'ok' : 'error',
        'Винтовая: высота прохода между витками',
        `${formatNumber(geometry.spiralHeadroom, 0)} мм`,
        'Минимум 2000 мм',
        'Увеличьте высоту подъема H или уменьшите количество ступеней на полный оборот.',
      ),
    );
  }

  checks.push(
    createCheck('ok', 'Одинаковая высота и глубина ступеней', 'Да', 'Расчет ведется единым h и b'),
  );
  checks.push(
    createCheck(
      isBetween(geometry.blondel, 600, 640) ? 'ok' : 'warn',
      'Формула Блонделя',
      `2h + b = ${formatNumber(geometry.blondel, 1)} мм`,
      'Рекомендация: 600-640 мм',
    ),
  );
  checks.push(
    createCheck(
      isSpiral
        ? isBetween(geometry.spiralSlopeAngle, 25, 35) ? 'ok' : 'warn'
        : isBetween(geometry.slopeAngle, 30, 40) ? 'ok' : 'warn',
      'Угол наклона',
      `${formatNumber(isSpiral ? geometry.spiralSlopeAngle : geometry.slopeAngle, 1)}°`,
      isSpiral ? 'Рекомендация для винтовых: 25-35°' : 'Рекомендация: 30-40°',
    ),
  );
  checks.push(
    createCheck(
      isSpiral || form.flightWidth >= 900 ? 'ok' : 'warn',
      'Ширина марша',
      isSpiral ? 'Не применяется' : `${formatNumber(form.flightWidth, 0)} мм`,
      isSpiral ? 'Для винтовой задаются внутренний и внешний радиусы' : 'Рекомендация: не менее 900 мм',
    ),
  );
  checks.push(
    createCheck(
      form.treadOverhang > 50 ? 'warn' : 'ok',
      'Свес проступи',
      `${formatNumber(form.treadOverhang, 0)} мм`,
      'Свес более 50 мм не рекомендуется',
    ),
  );

  const errors = checks.filter((check) => check.status === 'error');
  const warnings = checks.filter((check) => check.status === 'warn');

  return { checks, errors, warnings };
};

/**
 * Подготавливает Canvas к четкой отрисовке на экранах с разной плотностью пикселей.
 * @param {HTMLCanvasElement} canvas - Canvas-элемент.
 * @returns {CanvasRenderingContext2D|null} Контекст 2D или `null`, если элемент недоступен.
 */
const prepareCanvas = (canvas) => {
  if (!canvas) {
    return null;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return ctx;
};

/**
 * Рисует подпись размера с линией-выноской.
 * @param {CanvasRenderingContext2D} ctx - Контекст Canvas.
 * @param {string} text - Текст подписи.
 * @param {number} x1 - Начальная координата X.
 * @param {number} y1 - Начальная координата Y.
 * @param {number} x2 - Конечная координата X.
 * @param {number} y2 - Конечная координата Y.
 * @returns {void}
 */
const drawDimension = (ctx, text, x1, y1, x2, y2) => {
  ctx.save();
  ctx.strokeStyle = '#64748b';
  ctx.fillStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.fillText(text, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6);
  ctx.restore();
};

/**
 * Рисует профиль лестницы сбоку: уровни полов, ступени, высоту и горизонтальную проекцию.
 * @param {HTMLCanvasElement} canvas - Canvas профиля.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанные параметры.
 * @returns {void}
 */
const drawProfile = (canvas, form, geometry) => {
  const ctx = prepareCanvas(canvas);

  if (!ctx) {
    return;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = 44;
  const horizontalRun = form.shape === 'spiral' ? geometry.safeSteps * geometry.spiralLineTread : geometry.flightLength;
  const scale = Math.min((width - padding * 2) / horizontalRun, (height - padding * 2) / geometry.totalRise);
  const baseX = padding;
  const baseY = height - padding;
  const topY = baseY - geometry.totalRise * scale;
  const endX = baseX + horizontalRun * scale;

  ctx.font = '13px Arial';
  ctx.lineCap = 'round';
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(baseX - 12, baseY);
  ctx.lineTo(endX + 50, baseY);
  ctx.moveTo(endX - 20, topY);
  ctx.lineTo(endX + 90, topY);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.fillText('Чистый пол нижнего этажа', baseX, baseY + 24);
  ctx.fillText('Чистый пол верхнего этажа (не ступень)', endX - 140, topY - 12);

  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  const profileStepRun = horizontalRun / Math.max(geometry.safeSteps, 1);

  for (let index = 1; index <= geometry.safeSteps; index += 1) {
    const x = baseX + (index - 1) * profileStepRun * scale;
    const nextX = baseX + index * profileStepRun * scale;
    const y = baseY - index * geometry.riser * scale;
    ctx.lineTo(x, y);
    ctx.lineTo(nextX, y);
  }

  ctx.stroke();

  ctx.strokeStyle = '#f97316';
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.lineTo(endX, topY);
  ctx.stroke();
  ctx.setLineDash([]);

  drawDimension(ctx, `H = ${formatNumber(geometry.totalRise)} мм`, baseX - 22, baseY, baseX - 22, topY);
  drawDimension(ctx, `L = ${formatNumber(horizontalRun)} мм`, baseX, baseY + 36, endX, baseY + 36);

  ctx.fillStyle = '#334155';
  ctx.fillText(`h = ${formatNumber(geometry.riser, 1)} мм`, baseX + 12, topY + 32);
  ctx.fillText(`b = ${formatNumber(geometry.activeTread, 1)} мм`, baseX + 120, topY + 32);
  ctx.fillText(`угол = ${formatNumber(form.shape === 'spiral' ? geometry.spiralSlopeAngle : geometry.slopeAngle, 1)}°`, baseX + 230, topY + 32);
  ctx.fillText(`W = ${formatNumber(form.treadThickness)} мм, F = ${formatNumber(form.treadOverhang)} мм, T = ${formatNumber(form.stringerThickness)} мм`, baseX + 12, topY + 52);
};

/**
 * Рисует прямоугольный марш на плане.
 * @param {CanvasRenderingContext2D} ctx - Контекст Canvas.
 * @param {number} x - Координата X начала марша.
 * @param {number} y - Координата Y начала марша.
 * @param {number} length - Длина марша на чертеже.
 * @param {number} width - Ширина марша на чертеже.
 * @param {number} steps - Количество подъемов.
 * @param {'horizontal'|'vertical'} direction - Направление марша.
 * @returns {void}
 */
const drawFlightPlan = (ctx, x, y, length, width, steps, direction = 'horizontal') => {
  ctx.strokeStyle = '#0ea5e9';
  ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, length, width);
  ctx.fillRect(x, y, length, width);

  const lines = Math.max(steps - 1, 1);

  for (let index = 1; index < lines; index += 1) {
    ctx.beginPath();

    if (direction === 'horizontal') {
      const stepX = x + (length / lines) * index;
      ctx.moveTo(stepX, y);
      ctx.lineTo(stepX, y + width);
    } else {
      const stepY = y + (length / lines) * index;
      ctx.moveTo(x, stepY);
      ctx.lineTo(x + width, stepY);
    }

    ctx.stroke();
  }
};

/**
 * Рисует план винтовой лестницы с радиусами и линией хода.
 * @param {CanvasRenderingContext2D} ctx - Контекст Canvas.
 * @param {number} cx - Центр окружностей X.
 * @param {number} cy - Центр окружностей Y.
 * @param {number} scale - Масштаб чертежа.
 * @param {object} geometry - Рассчитанные параметры.
 * @returns {void}
 */
const drawSpiralPlan = (ctx, cx, cy, scale, geometry) => {
  const inner = geometry.innerRadius * scale;
  const outer = geometry.outerRadius * scale;
  const walk = geometry.walkingRadius * scale;
  const totalAngle = geometry.spiralTotalAngle * (Math.PI / 180);
  const stepAngle = geometry.spiralStepAngleDeg * (Math.PI / 180);

  ctx.strokeStyle = '#0ea5e9';
  ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = '#f97316';
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, walk, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = '#334155';

  for (let angle = 0; angle <= totalAngle; angle += stepAngle) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  drawDimension(ctx, `Rвнут = ${formatNumber(geometry.innerRadius)} мм`, cx, cy, cx + inner, cy);
  drawDimension(ctx, `Rход = ${formatNumber(geometry.walkingRadius)} мм`, cx, cy + 16, cx + walk, cy + 16);
  drawDimension(ctx, `Rвнеш = ${formatNumber(geometry.outerRadius)} мм`, cx, cy + 32, cx + outer, cy + 32);
};

/**
 * Рисует план лестницы с габаритами и специальной графикой для винтовых схем.
 * @param {HTMLCanvasElement} canvas - Canvas плана.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанные параметры.
 * @returns {void}
 */
const drawPlan = (canvas, form, geometry) => {
  const ctx = prepareCanvas(canvas);

  if (!ctx) {
    return;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const padding = 44;
  const scale = Math.min((width - padding * 2) / geometry.planLength, (height - padding * 2) / geometry.planWidth);
  const originX = padding;
  const originY = padding;
  const flightWidth = form.flightWidth * scale;
  const flightLength = geometry.flightLength * scale;
  const landing = geometry.landingLength * scale;

  ctx.font = '13px Arial';
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  if (form.shape === 'spiral') {
    drawSpiralPlan(ctx, width / 2, height / 2, scale, geometry);
    return;
  }

  if (form.shape === 'straight') {
    drawFlightPlan(ctx, originX, originY + flightWidth / 2, flightLength, flightWidth, geometry.safeSteps);
    drawDimension(ctx, `${formatNumber(geometry.flightLength)} мм`, originX, originY + flightWidth * 1.8, originX + flightLength, originY + flightWidth * 1.8);
    drawDimension(ctx, `${formatNumber(form.flightWidth)} мм`, originX - 16, originY + flightWidth / 2, originX - 16, originY + flightWidth * 1.5);
    return;
  }

  if (form.shape === 'l-platform') {
    const marchRun = Math.max(geometry.flightLength - geometry.landingLength, 1) * scale;
    const firstFlightLength = marchRun * (geometry.firstFlightSteps / Math.max(geometry.firstFlightSteps + geometry.secondFlightSteps, 1));
    const secondFlightLength = Math.max(marchRun - firstFlightLength, flightWidth);

    drawFlightPlan(ctx, originX, originY + landing, firstFlightLength, flightWidth, geometry.firstFlightSteps);
    drawFlightPlan(ctx, originX + firstFlightLength, originY, secondFlightLength, flightWidth, geometry.secondFlightSteps, 'vertical');
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(originX + firstFlightLength, originY + landing, landing, flightWidth);
    ctx.fillText(`Площадка ${formatNumber(geometry.landingLength)}×${formatNumber(form.flightWidth)} мм`, originX + firstFlightLength + 8, originY + landing + 22);
  } else if (form.shape === 'u-platform') {
    const marchRun = Math.max(geometry.flightLength - geometry.landingLength, 1) * scale;
    const totalSteps = Math.max(geometry.firstFlightSteps + geometry.secondFlightSteps, 1);
    const firstFlightLength = marchRun * (geometry.firstFlightSteps / totalSteps);
    const secondFlightLength = Math.max(marchRun - firstFlightLength, flightWidth);

    drawFlightPlan(ctx, originX, originY + flightWidth, firstFlightLength, flightWidth, geometry.firstFlightSteps);
    drawFlightPlan(
      ctx,
      originX + firstFlightLength - secondFlightLength,
      originY,
      secondFlightLength,
      flightWidth,
      geometry.secondFlightSteps,
    );
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(originX + firstFlightLength, originY, landing, flightWidth * 2);
    ctx.fillText(`Площадка ${formatNumber(geometry.landingLength)} мм`, originX + firstFlightLength + 8, originY + flightWidth);
  }

  drawDimension(ctx, `Габарит ${formatNumber(geometry.planLength)} мм`, originX, height - 28, originX + geometry.planLength * scale, height - 28);
  drawDimension(ctx, `Ширина ${formatNumber(geometry.planWidth)} мм`, width - 32, originY, width - 32, originY + geometry.planWidth * scale);
};

/**
 * Возвращает CSS-класс строки проверки по ее статусу.
 * @param {'ok'|'warn'|'error'} status - Статус проверки.
 * @returns {string} CSS-класс для строки таблицы.
 */
const getCheckClassName = (status) => `check check--${status}`;

/**
 * Возвращает визуальный маркер проверки.
 * @param {'ok'|'warn'|'error'} status - Статус проверки.
 * @returns {string} Символ статуса для пользователя.
 */
const getStatusIcon = (status) => {
  if (status === 'error') {
    return '❌';
  }

  if (status === 'warn') {
    return '⚠️';
  }

  return '✅';
};

/**
 * Рендерит название параметра с простой всплывающей подсказкой.
 * Подсказка доступна при наведении мыши и при фокусе с клавиатуры.
 * @param {string} label - Видимое название параметра.
 * @param {string} hint - Короткое объяснение значения параметра простыми словами.
 * @returns {JSX.Element} Название параметра с интерактивной подсказкой.
 */
const renderParameterHeader = (label, hint) => (
  <span className="parameter-hint" tabIndex="0" aria-label={`${label}: ${hint}`} title={hint}>
    <span className="parameter-hint__label">{label}</span>
    <span className="parameter-hint__icon" aria-hidden="true">?</span>
    <span className="parameter-hint__bubble" role="tooltip">{hint}</span>
  </span>
);

/**
 * Возвращает расчетные параметры, которые относятся именно к выбранной форме лестницы.
 * Используется в форме, чтобы ошибки по винтовым элементам были связаны с видимыми значениями.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @returns {Array<{label: string, value: string, note: string}>} Список параметров выбранной формы для вывода.
 */
const buildShapeParameters = (form, geometry) => {
  if (form.shape === 'spiral') {
    return [
      { label: 'Этажей', value: `${geometry.floorCount} шт.`, note: 'Общий подъём = H × (этажей − 1)' },
      { label: 'Подъёмов n', value: `${geometry.safeSteps} шт.`, note: 'На всю высоту лестницы' },
      { label: 'Расчетная длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Диаметр по внешнему радиусу, только для чтения' },
      { label: 'Проступь по линии хода', value: `${formatNumber(geometry.spiralLineTread, 1)} мм`, note: 'Минимум 180 мм' },
      { label: 'Узкая часть ступени', value: `${formatNumber(geometry.spiralNarrowEnd, 1)} мм`, note: 'Минимум 100 мм' },
      { label: 'Высота между витками', value: `${formatNumber(geometry.spiralHeadroom)} мм`, note: 'Минимум 2000 мм' },
      { label: 'Внутренний радиус', value: `${formatNumber(geometry.innerRadius)} мм`, note: 'Задается в форме' },
      { label: 'Внешний радиус', value: `${formatNumber(geometry.outerRadius)} мм`, note: 'Задается в форме' },
      { label: 'Радиус линии хода', value: `${formatNumber(geometry.walkingRadius)} мм`, note: 'Расчетное значение' },
    ];
  }

  if (form.shape.includes('platform')) {
    const flightSummary = geometry.flightCount > 2
      ? `${geometry.flightCount} маршей: ${geometry.flightStepsList.join(' + ')}`
      : `${geometry.firstFlightSteps} + ${geometry.secondFlightSteps}`;

    return [
      { label: 'Этажей', value: `${geometry.floorCount} шт.`, note: 'Общий подъём = H × (этажей − 1)' },
      { label: 'Маршей', value: `${geometry.flightCount} шт.`, note: flightSummary },
      { label: 'Длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Задается полем L' },
      { label: 'Глубина проступи', value: `${formatNumber(geometry.tread, 1)} мм`, note: 'Обязательный диапазон: 260-300 мм' },
      { label: 'Размер площадки', value: `${formatNumber(geometry.landingLength)} мм`, note: 'Не меньше ширины марша' },
      { label: 'Поворот лестницы', value: `${geometry.turnAngle}°`, note: 'Зависит от формы' },
    ];
  }

  if (form.shape === 'straight' && geometry.flightCount > 1) {
    return [
      { label: 'Этажей', value: `${geometry.floorCount} шт.`, note: 'Общий подъём = H × (этажей − 1)' },
      { label: 'Маршей', value: `${geometry.flightCount} шт.`, note: geometry.flightStepsList.join(' + ') },
      { label: 'Длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'На один пролёт' },
      { label: 'Глубина проступи', value: `${formatNumber(geometry.tread, 1)} мм`, note: 'Обязательный диапазон: 260-300 мм' },
      { label: 'Габарит плана', value: `${formatNumber(geometry.planLength)} × ${formatNumber(geometry.planWidth)} мм`, note: 'Расчетный размер сверху' },
    ];
  }

  return [
    { label: 'Длина марша', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Задается полем L' },
    { label: 'Глубина проступи', value: `${formatNumber(geometry.tread, 1)} мм`, note: 'Обязательный диапазон: 260-300 мм' },
    { label: 'Габарит плана', value: `${formatNumber(geometry.planLength)} × ${formatNumber(geometry.planWidth)} мм`, note: 'Расчетный размер сверху' },
  ];
};

/**
 * Форматирует компонентную конфигурацию для JSON-редактора.
 * Используется при автогенерации и сбросе ручной конфигурации.
 * @param {Array<object>} components - Массив компонентов лестницы.
 * @returns {string} Отформатированный JSON с отступами.
 */
const formatComponentsJson = (components) => JSON.stringify(components, null, 2);

/**
 * Создает полный расчетный снимок формы: геометрию и компонентную 3D-конфигурацию.
 * Zustand-store вызывает функцию при каждом изменении параметров лестницы.
 * @param {object} form - Текущие значения формы.
 * @returns {{geometry: object, generatedComponents: Array<object>}} Расчетная геометрия и компоненты.
 */
const createStairSnapshot = (form) => {
  const geometry = calculateGeometry(form);

  return {
    generatedComponents: generateComponents(form, geometry),
    geometry,
  };
};

const initialStairSnapshot = createStairSnapshot(INITIAL_FORM);

/**
 * Хранит параметры лестницы, расчетную геометрию и активную JSON-конфигурацию 3D.
 * При изменении любого параметра автоматически пересчитывает `geometry` и `generatedComponents`.
 */
const useStairStore = create((set) => ({
  activeResultTab: RESULT_TABS[0].id,
  componentJson: formatComponentsJson(initialStairSnapshot.generatedComponents),
  componentJsonError: '',
  form: INITIAL_FORM,
  generatedComponents: initialStairSnapshot.generatedComponents,
  geometry: initialStairSnapshot.geometry,
  isCustomConfig: false,
  customComponents: initialStairSnapshot.generatedComponents,
  /**
   * Обновляет форму и пересчитывает все производные данные лестницы.
   * @param {object|Function} updater - Объект новых полей или callback от текущей формы.
   * @returns {void}
   */
  setForm: (updater) => set((state) => {
    const nextForm = typeof updater === 'function' ? updater(state.form) : { ...state.form, ...updater };
    const snapshot = createStairSnapshot(nextForm);

    return {
      form: nextForm,
      generatedComponents: snapshot.generatedComponents,
      geometry: snapshot.geometry,
      componentJson: formatComponentsJson(snapshot.generatedComponents),
      componentJsonError: '',
      customComponents: snapshot.generatedComponents,
      isCustomConfig: false,
    };
  }),
  /**
   * Переключает активную вкладку результата калькулятора.
   * @param {string} tabId - Идентификатор вкладки.
   * @returns {void}
   */
  setActiveResultTab: (tabId) => set({ activeResultTab: tabId }),
  /**
   * Парсит ручной JSON и включает кастомную 3D-конфигурацию при валидном массиве.
   * @param {string} nextJson - Текст JSON из редактора.
   * @returns {void}
   */
  setComponentJson: (nextJson) => set((state) => {
    try {
      const parsedComponents = JSON.parse(nextJson);

      if (!Array.isArray(parsedComponents)) {
        return {
          componentJson: nextJson,
          componentJsonError: 'JSON должен быть массивом компонентов.',
          isCustomConfig: state.isCustomConfig,
        };
      }

      return {
        componentJson: nextJson,
        componentJsonError: '',
        customComponents: parsedComponents,
        isCustomConfig: true,
      };
    } catch (error) {
      return {
        componentJson: nextJson,
        componentJsonError: error instanceof Error ? error.message : 'Не удалось разобрать JSON.',
        isCustomConfig: state.isCustomConfig,
      };
    }
  }),
  /**
   * Возвращает 3D-конфигурацию к автоматической генерации из текущих параметров формы.
   * @returns {void}
   */
  resetComponents: () => set((state) => ({
    componentJson: formatComponentsJson(state.generatedComponents),
    componentJsonError: '',
    customComponents: state.generatedComponents,
    isCustomConfig: false,
  })),
}));

/**
 * Главный React-компонент калькулятора лестниц.
 * Хранит ввод пользователя, запускает расчеты и синхронизирует Canvas-чертежи с результатами.
 * @returns {JSX.Element} Интерфейс калькулятора.
 */
const App = () => {
  const activeResultTab = useStairStore((state) => state.activeResultTab);
  const componentJson = useStairStore((state) => state.componentJson);
  const componentJsonError = useStairStore((state) => state.componentJsonError);
  const customComponents = useStairStore((state) => state.customComponents);
  const form = useStairStore((state) => state.form);
  const generatedComponents = useStairStore((state) => state.generatedComponents);
  const geometry = useStairStore((state) => state.geometry);
  const isCustomConfig = useStairStore((state) => state.isCustomConfig);
  const resetComponents = useStairStore((state) => state.resetComponents);
  const setActiveResultTab = useStairStore((state) => state.setActiveResultTab);
  const setComponentJson = useStairStore((state) => state.setComponentJson);
  const setForm = useStairStore((state) => state.setForm);
  const profileCanvasRef = useRef(null);
  const planCanvasRef = useRef(null);
  const activeComponents = isCustomConfig ? customComponents : generatedComponents;
  const report = useMemo(() => buildChecks(form, geometry), [form, geometry]);
  const selectedShape = SHAPES.find((shape) => shape.value === form.shape)?.label;
  const selectedMaterial = MATERIALS.find((material) => material.value === form.material)?.label;
  const isSpiral = form.shape === 'spiral';
  const canUseAutoSteps = isFieldVisible(form.shape, 'autoSteps');
  const shapeParameters = useMemo(() => buildShapeParameters(form, geometry), [form, geometry]);
  const exportData = useMemo(() => ({
    form,
    geometry,
    isSpiral,
    report,
    selectedMaterial,
    selectedShape,
  }), [form, geometry, isSpiral, report, selectedMaterial, selectedShape]);

  /**
   * Обновляет числовое поле формы с приведением к Number.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие изменения поля.
   * @returns {void}
   */
  const handleNumberChange = (event) => {
    const { name, value } = event.target;
    let nextValue = Number(value);

    if (name === 'floors') {
      nextValue = Math.min(3, Math.max(2, Number.isFinite(nextValue) ? nextValue : 2));
    }

    setForm((currentForm) => ({
      ...currentForm,
      [name]: nextValue,
    }));
  };

  /**
   * Меняет форму лестницы и сбрасывает только параметры, специфичные для предыдущей формы.
   * Базовые размеры и материал сохраняются, чтобы пользователь не терял основной ввод.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - Событие выбора новой формы.
   * @returns {void}
   */
  const handleShapeChange = (event) => {
    const nextShape = event.target.value;

    setForm((currentForm) => {
      const resolvedSteps = getResolvedSteps(currentForm);
      const shapeDefaults = getShapeDefaults(nextShape, currentForm);

      return {
        ...currentForm,
        ...shapeDefaults,
        shape: nextShape,
        steps: resolvedSteps,
        useAutoSteps: nextShape === 'straight' ? currentForm.useAutoSteps : false,
      };
    });
  };

  /**
   * Обновляет строковое поле формы.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - Событие изменения select.
   * @returns {void}
   */
  const handleSelectChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  };

  /**
   * Переключает ручной и автоматический расчет количества ступеней.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие изменения checkbox.
   * @returns {void}
   */
  const handleAutoStepsChange = (event) => {
    setForm((currentForm) => ({
      ...currentForm,
      useAutoSteps: event.target.checked,
    }));
  };

  /**
   * Переключает активную вкладку калькулятора.
   * @param {string} tabId - Идентификатор вкладки из `RESULT_TABS`.
   * @returns {void}
   */
  const handleResultTabClick = (tabId) => {
    setActiveResultTab(tabId);
  };

  useEffect(() => {
    /**
     * Перерисовывает оба Canvas при изменении расчетов или размеров окна.
     * @returns {void}
     */
    const handleDraw = () => {
      drawProfile(profileCanvasRef.current, form, geometry);
      drawPlan(planCanvasRef.current, form, geometry);
    };

    handleDraw();
    window.addEventListener('resize', handleDraw);

    return () => window.removeEventListener('resize', handleDraw);
  }, [activeResultTab, form, geometry]);

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="hero__eyebrow">СП 55.13330.2016 · ГОСТ 9818-2015 · СП 1.13130.2020</p>
          <h1 className="hero__title">Калькулятор лестниц для частного жилого дома</h1>
          <p className="hero__text">
            Мягкая проверка норм для домов до 3 этажей: маршевые и винтовые лестницы,
            материалы дерево, сталь и железобетон. Пожарный тип по умолчанию: {form.fireType}.
          </p>
        </div>
        <div className={report.errors.length ? 'hero__status hero__status--error' : 'hero__status hero__status--ok'}>
          {report.errors.length ? 'Есть ошибки' : 'Соответствует нормам'}
        </div>
      </section>

      <nav className="result-tabs no-print" aria-label="Разделы калькулятора">
        {RESULT_TABS.map((tab) => (
          <button
            aria-current={activeResultTab === tab.id ? 'page' : undefined}
            className={activeResultTab === tab.id ? 'result-tabs__button result-tabs__button--active' : 'result-tabs__button'}
            key={tab.id}
            onClick={() => handleResultTabClick(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className={activeResultTab === 'input-parameters' ? 'layout result-panel result-panel--active' : 'layout result-panel'}>
        <form className="card form" aria-label="Параметры лестницы">
          <div className="form__grid">
            <label className="field">
              <span className="field__label">Форма лестницы</span>
              <select className="field__control" name="shape" onChange={handleShapeChange} value={form.shape}>
                {SHAPES.map((shape) => (
                  <option key={shape.value} value={shape.value}>
                    {shape.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">{renderParameterHeader('Высота подъема H, мм', PARAMETER_HINTS.height)}</span>
              <input
                className="field__control"
                min="450"
                name="height"
                onChange={handleNumberChange}
                type="number"
                value={form.height}
              />
            </label>

            <label className="field">
              <span className="field__label">{renderParameterHeader('Количество этажей', PARAMETER_HINTS.floors)}</span>
              <input
                className="field__control"
                min="2"
                max="3"
                name="floors"
                onChange={handleNumberChange}
                type="number"
                value={form.floors}
              />
            </label>

            {isFieldVisible(form.shape, 'flightWidth') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Ширина марша, мм', PARAMETER_HINTS.flightWidth)}</span>
                <input
                  className="field__control"
                  min="600"
                  name="flightWidth"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.flightWidth}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'openingLength') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Длина проема / проекция L, мм', PARAMETER_HINTS.openingLength)}</span>
                <input
                  className="field__control"
                  min="600"
                  name="openingLength"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.openingLength}
                />
              </label>
            )}

            {canUseAutoSteps && (
              <label className="field field--checkbox">
                <input checked={form.useAutoSteps} onChange={handleAutoStepsChange} type="checkbox" />
                <span>Авторасчет количества ступеней</span>
              </label>
            )}

            <label className="field">
              <span className="field__label">{renderParameterHeader('Количество ступеней / подъемов n', PARAMETER_HINTS.steps)}</span>
              <input
                className="field__control"
                disabled={canUseAutoSteps && form.useAutoSteps}
                min="3"
                name="steps"
                onChange={handleNumberChange}
                type="number"
                value={canUseAutoSteps && form.useAutoSteps ? geometry.safeSteps : form.steps}
              />
            </label>

            {isFieldVisible(form.shape, 'landingLength') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Длина площадки, мм', PARAMETER_HINTS.landingLength)}</span>
                <input
                  className="field__control"
                  min={form.flightWidth}
                  name="landingLength"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.landingLength}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'firstFlightSteps') && geometry.flightCount === 2 && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Количество ступеней в 1-м марше', PARAMETER_HINTS.firstFlightSteps)}</span>
                <input
                  className="field__control"
                  min="0"
                  name="firstFlightSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.firstFlightSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'secondFlightSteps') && geometry.flightCount === 2 && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Количество ступеней во 2-м марше', PARAMETER_HINTS.secondFlightSteps)}</span>
                <input
                  className="field__control"
                  disabled={form.shape === 'l-platform' || form.shape === 'u-platform'}
                  min="0"
                  name="secondFlightSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.shape.includes('platform') ? geometry.secondFlightSteps : form.secondFlightSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'outerRadius') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Внешний радиус R, мм', PARAMETER_HINTS.outerRadius)}</span>
                <input
                  className="field__control"
                  min="800"
                  name="outerRadius"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.outerRadius}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'innerRadius') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Внутренний радиус r, мм', PARAMETER_HINTS.innerRadius)}</span>
                <input
                  className="field__control"
                  min="100"
                  name="innerRadius"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.innerRadius}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'spiralStepsPerTurn') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Ступеней на полный оборот', PARAMETER_HINTS.spiralStepsPerTurn)}</span>
                <input
                  className="field__control"
                  min="1"
                  name="spiralStepsPerTurn"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.spiralStepsPerTurn}
                />
              </label>
            )}

            <label className="field">
              <span className="field__label">Материал</span>
              <select className="field__control" name="material" onChange={handleSelectChange} value={form.material}>
                {MATERIALS.map((material) => (
                  <option key={material.value} value={material.value}>
                    {material.label}
                  </option>
                ))}
              </select>
            </label>

            <details className="additional-params form__wide" open>
              <summary className="additional-params__summary">Дополнительные параметры</summary>
              <div className="additional-params__grid">
                <label className="field">
                  <span className="field__label">{renderParameterHeader('Толщина ступеней W, мм', PARAMETER_HINTS.treadThickness)}</span>
                  <input
                    className="field__control"
                    min="1"
                    name="treadThickness"
                    onChange={handleNumberChange}
                    type="number"
                    value={form.treadThickness}
                  />
                </label>

                <label className="field">
                  <span className="field__label">{renderParameterHeader('Свес проступи F, мм', PARAMETER_HINTS.treadOverhang)}</span>
                  <input
                    aria-describedby={form.treadOverhang > 50 ? 'tread-overhang-warning' : undefined}
                    className="field__control"
                    min="0"
                    name="treadOverhang"
                    onChange={handleNumberChange}
                    type="number"
                    value={form.treadOverhang}
                  />
                  {form.treadOverhang > 50 && (
                    <span className="field__warning" id="tread-overhang-warning">⚠️ Свес более 50 мм не рекомендуется</span>
                  )}
                </label>

                <label className="field">
                  <span className="field__label">
                    {renderParameterHeader(isSpiral ? 'Толщина центральной стойки T, мм' : 'Толщина тетивы / косоура T, мм', PARAMETER_HINTS.stringerThickness)}
                  </span>
                  <input
                    className="field__control"
                    min="1"
                    name="stringerThickness"
                    onChange={handleNumberChange}
                    type="number"
                    value={form.stringerThickness}
                  />
                </label>
              </div>
            </details>

          </div>

          <section className="shape-params" aria-label="Расчетные параметры выбранной формы лестницы">
            <h2 className="shape-params__title">Параметры выбранной формы</h2>
            <div className="shape-params__grid">
              {shapeParameters.map((parameter) => (
                <article className="shape-params__item" key={parameter.label}>
                  <span className="shape-params__label">{parameter.label}</span>
                  <strong className="shape-params__value">{parameter.value}</strong>
                  <span className="shape-params__note">{parameter.note}</span>
                </article>
              ))}
            </div>
          </section>
        </form>

        <section className="card summary" aria-label="Итоговое заключение">
          <h2>Итог</h2>
          <p className={report.errors.length ? 'summary__result summary__result--error' : 'summary__result summary__result--ok'}>
            {report.errors.length ? 'Не соответствует: требуется исправить ошибки' : 'Соответствует нормам'}
          </p>

          {report.errors.length > 0 && (
            <div className="summary__errors" aria-label="Ошибки, которые необходимо исправить">
              <h3 className="summary__subtitle">Что необходимо исправить</h3>
              <ul className="summary__list">
                {report.errors.map((error) => (
                  <li key={error.title}>
                    <strong>{error.title}</strong>
                    <span>Сейчас: {error.value}</span>
                    <span>Требуется: {error.note}</span>
                    {error.fix && <span className="summary__fix">Как исправить: {error.fix}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="summary__note">
            Верхний этаж не считается ступенью: при n = {geometry.safeSteps} физических подъемов точка выхода находится
            на следующем уровне чистого пола.
          </p>
        </section>
      </section>

      <section className={activeResultTab === 'side-view' ? 'drawings result-panel result-panel--active' : 'drawings result-panel'}>
        <article className="card drawing">
          <h2>Вид сбоку</h2>
          <canvas ref={profileCanvasRef} aria-label="Canvas с профилем лестницы" />
        </article>
      </section>

      <section className={activeResultTab === 'top-view' ? 'drawings result-panel result-panel--active' : 'drawings result-panel'}>
        <article className="card drawing">
          <h2>Вид сверху</h2>
          <canvas ref={planCanvasRef} aria-label="Canvas с планом лестницы" />
        </article>
      </section>

      <section className={activeResultTab === 'three-d' ? 'drawings result-panel result-panel--active' : 'drawings result-panel'}>
        <Staircase3D
          componentJson={componentJson}
          componentJsonError={componentJsonError}
          components={activeComponents}
          form={form}
          isCustomConfig={isCustomConfig}
          onComponentJsonChange={setComponentJson}
          onResetComponents={resetComponents}
        />
      </section>

      <section className={activeResultTab === 'parameters' ? 'card table-card result-panel result-panel--active' : 'card table-card result-panel'}>
        <h2>Введенные и рассчитанные параметры</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th>{renderParameterHeader('Форма', PARAMETER_HINTS.form)}</th><td>{selectedShape}</td></tr>
              <tr><th>{renderParameterHeader('Материал', PARAMETER_HINTS.material)}</th><td>{selectedMaterial}</td></tr>
              <tr><th>{renderParameterHeader('Пожарный тип', PARAMETER_HINTS.fireType)}</th><td>{form.fireType}</td></tr>
              <tr><th>{renderParameterHeader('Толщина ступеней W', PARAMETER_HINTS.treadThickness)}</th><td>{formatNumber(form.treadThickness)} мм</td></tr>
              <tr><th>{renderParameterHeader('Свес проступи F', PARAMETER_HINTS.treadOverhang)}</th><td>{formatNumber(form.treadOverhang)} мм</td></tr>
              <tr><th>{renderParameterHeader(isSpiral ? 'Толщина центральной стойки T' : 'Толщина тетивы / косоура T', PARAMETER_HINTS.stringerThickness)}</th><td>{formatNumber(form.stringerThickness)} мм</td></tr>
              <tr><th>{renderParameterHeader('Высота подъема H', PARAMETER_HINTS.height)}</th><td>{formatNumber(form.height)} мм</td></tr>
              {isFieldVisible(form.shape, 'flightWidth') && <tr><th>{renderParameterHeader('Ширина марша', PARAMETER_HINTS.flightWidth)}</th><td>{formatNumber(form.flightWidth)} мм</td></tr>}
              <tr><th>{renderParameterHeader('Количество подъемов n', PARAMETER_HINTS.steps)}</th><td>{geometry.safeSteps} шт.</td></tr>
              {form.shape.includes('platform') && (
                <>
                  <tr><th>{renderParameterHeader('Длина площадки', PARAMETER_HINTS.landingLength)}</th><td>{formatNumber(geometry.landingLength)} мм</td></tr>
                  <tr><th>{renderParameterHeader('Ступени 1-го марша', PARAMETER_HINTS.firstFlightSteps)}</th><td>{geometry.firstFlightSteps} шт.</td></tr>
                  <tr><th>{renderParameterHeader('Ступени 2-го марша', PARAMETER_HINTS.secondFlightSteps)}</th><td>{geometry.secondFlightSteps} шт.</td></tr>
                </>
              )}
              <tr><th>{renderParameterHeader('Высота ступени h', PARAMETER_HINTS.riser)}</th><td>{formatNumber(geometry.riser, 1)} мм</td></tr>
              <tr><th>{renderParameterHeader('Глубина / линия хода b', PARAMETER_HINTS.tread)}</th><td>{formatNumber(geometry.activeTread, 1)} мм</td></tr>
              <tr><th>Глубина заготовки ступени b + F</th><td>{formatNumber(geometry.treadBlankDepth, 1)} мм</td></tr>
              <tr><th>{renderParameterHeader('Длина проема L', PARAMETER_HINTS.flightLength)}</th><td>{formatNumber(geometry.flightLength)} мм</td></tr>
              <tr><th>Длина тетивы / косоура</th><td>{formatNumber(geometry.stringerLength, 2)} м</td></tr>
              <tr><th>Объем ступеней</th><td>{formatNumber(geometry.treadVolume, 3)} м³</td></tr>
              <tr><th>Объем двух несущих балок</th><td>{formatNumber(geometry.stringerVolume, 3)} м³</td></tr>
              <tr><th>Расход материала</th><td>{formatNumber(geometry.totalVolume, 3)} м³</td></tr>
              {form.material === 'steel' && <tr><th>Ориентировочный вес стали</th><td>{formatNumber(geometry.steelWeight, 1)} кг</td></tr>}
              <tr><th>{renderParameterHeader('Угол наклона', PARAMETER_HINTS.slopeAngle)}</th><td>{formatNumber(isSpiral ? geometry.spiralSlopeAngle : geometry.slopeAngle, 1)}°</td></tr>
              <tr><th>{renderParameterHeader('Формула Блонделя', PARAMETER_HINTS.blondel)}</th><td>{formatNumber(geometry.blondel, 1)} мм</td></tr>
              <tr><th>{renderParameterHeader('Габарит плана', PARAMETER_HINTS.planSize)}</th><td>{formatNumber(geometry.planLength)} × {formatNumber(geometry.planWidth)} мм</td></tr>
              {isSpiral && (
                <>
                  <tr><th>Внутренний радиус</th><td>{formatNumber(geometry.innerRadius)} мм</td></tr>
                  <tr><th>Внешний радиус</th><td>{formatNumber(geometry.outerRadius)} мм</td></tr>
                  <tr><th>Радиус линии хода</th><td>{formatNumber(geometry.walkingRadius)} мм</td></tr>
                  <tr><th>Ступеней на полный оборот</th><td>{formatNumber(geometry.spiralStepsPerTurn, 1)} шт.</td></tr>
                  <tr><th>Высота между витками</th><td>{formatNumber(geometry.spiralHeadroom)} мм</td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={activeResultTab === 'checks' ? 'card table-card result-panel result-panel--active' : 'card table-card result-panel'}>
        <h2>Проверки</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Статус</th>
                <th>Проверка</th>
                <th>Значение</th>
                <th>Норма / рекомендация</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((check) => (
                <tr className={getCheckClassName(check.status)} key={check.title}>
                  <td>{getStatusIcon(check.status)}</td>
                  <td>{check.title}</td>
                  <td>{check.value}</td>
                  <td>{check.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={activeResultTab === 'export' ? 'result-panel result-panel--active' : 'result-panel'}>
        <ExportPanel exportData={exportData} planCanvasRef={planCanvasRef} profileCanvasRef={profileCanvasRef} />
      </section>
    </main>
  );
};

export default App;
