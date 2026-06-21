import { useEffect, useMemo, useRef, useState } from 'react';
import ExportPanel from './ExportPanel.jsx';
import Staircase3D from './Staircase3D.jsx';

const SHAPES = [
  { value: 'straight', label: 'Прямая одномаршевая' },
  { value: 'l-platform', label: 'Г-образная с площадкой' },
  { value: 'l-winder', label: 'Г-образная с забежными ступенями' },
  { value: 'u-platform', label: 'П-образная с площадкой' },
  { value: 'u-winder', label: 'П-образная с забежными ступенями' },
  { value: 'winder-90', label: 'Забежные ступени, поворот 90°' },
  { value: 'winder-180', label: 'Забежные ступени, поворот 180°' },
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
  height: 'Общая высота между чистым полом нижнего и верхнего этажей. Нормативного рекомендуемого значения нет: это исходный размер здания.',
  material: 'Основной материал несущей конструкции лестницы. Требования к конструкциям учитываются по ГОСТ 9818-2015 и профильным нормам.',
  openingLength: 'Сколько места по полу есть под лестницу в длину. Это расстояние от начала лестницы до места, где она должна прийти к верхнему этажу, если смотреть сверху. Чем меньше значение, тем круче лестница; чем больше — тем глубже и удобнее ступени.',
  planSize: 'Габариты лестницы на виде сверху. Прямой нормы нет: размер должен помещаться в проем и сохранять нормативную ширину марша.',
  railingHeight: 'Высота ограждения от ступени до верха перил. Ориентир по СП 55.13330.2016 — не менее 900 мм.',
  riser: 'Высота одного подъема между соседними ступенями. Ориентир по СП 55.13330.2016 — 150-200 мм.',
  slopeAngle: 'Угол наклона лестницы относительно пола. Рекомендуемый диапазон для маршевой лестницы — 30-40°, для винтовой — 25-35°.',
  steps: 'Количество подъемов от нижнего до верхнего уровня. По ГОСТ 9818-2015 для марша используется диапазон 3-18 подъемов.',
  stringerThickness: 'Толщина боковой несущей балки (тетивы или косоура).',
  tread: 'Расчетная глубина ступени в зоне постановки стопы. Ориентир: марш 260-300 мм, забежные по линии хода 200-250 мм, узкий край не менее 100 мм.',
  treadOverhang: 'Нависание проступи над подступенком. Рекомендуется не более 50 мм.',
  treadThickness: 'Толщина доски или плиты ступени. Влияет на расход материала.',
  landingLength: 'Габарит промежуточной площадки по направлению движения. По умолчанию равен ширине марша.',
  firstFlightSteps: 'Количество подъемов до первого поворота или площадки. Остальные марши считаются от общего n.',
  secondFlightSteps: 'Количество подъемов между двумя поворотами П-образной лестницы.',
  thirdFlightSteps: 'Остаток подъемов после первого и второго марша: n минус введенные марши.',
  winderSteps: 'Количество забежных ступеней на повороте. Для 90° обычно используют 3-5 ступеней.',
  firstTurnWinderSteps: 'Количество забежных ступеней в первом повороте П-образной лестницы.',
  secondTurnWinderSteps: 'Количество забежных ступеней во втором повороте П-образной лестницы.',
  turnRadius: 'Радиус поворота по средней линии движения. По умолчанию равен ширине марша.',
  outerRadius: 'Внешний радиус винтовой лестницы от центра стойки до наружного края ступени.',
  innerRadius: 'Внутренний радиус винтовой лестницы или радиус центральной стойки.',
  spiralStepsPerTurn: 'Количество ступеней на один полный оборот винтовой лестницы.',
};

const INITIAL_FORM = {
  height: 3000,
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
  firstTurnWinderSteps: 3,
  secondTurnWinderSteps: 3,
  winderSteps: 3,
  turnRadius: 900,
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
 * Определяет, относится ли форма лестницы к лестницам с забежными ступенями.
 * @param {string} shape - Идентификатор формы лестницы.
 * @returns {boolean} `true` для Г-, П-образных и отдельных забежных схем.
 */
const isWinderShape = (shape) => shape.includes('winder');

/**
 * Определяет, относится ли форма лестницы к маршевым схемам с обычной проступью.
 * @param {string} shape - Идентификатор формы лестницы.
 * @returns {boolean} `true` для прямой лестницы и лестниц с площадкой.
 */
const isMarchShape = (shape) => shape === 'straight' || shape.includes('platform');

const FIELD_VISIBILITY_BY_SHAPE = {
  straight: ['flightWidth', 'openingLength', 'autoSteps'],
  'l-platform': ['flightWidth', 'openingLength', 'landingLength', 'firstFlightSteps', 'secondFlightSteps'],
  'l-winder': ['flightWidth', 'winderSteps', 'turnRadius'],
  'u-platform': ['flightWidth', 'openingLength', 'landingLength', 'firstFlightSteps', 'secondFlightSteps', 'thirdFlightSteps'],
  'u-winder': ['flightWidth', 'firstTurnWinderSteps', 'secondTurnWinderSteps', 'turnRadius'],
  'winder-90': ['flightWidth', 'winderSteps', 'turnRadius'],
  'winder-180': ['flightWidth', 'winderSteps', 'turnRadius'],
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
    firstFlightSteps: shape === 'u-platform' ? thirdSteps : halfSteps,
    secondFlightSteps: shape === 'u-platform' ? thirdSteps : Math.max(safeSteps - halfSteps, 1),
    firstTurnWinderSteps: 3,
    secondTurnWinderSteps: 3,
    winderSteps: shape === 'winder-180' ? 6 : 3,
    turnRadius: Number(currentForm.flightWidth),
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
  if (shape.includes('180') || shape === 'u-winder' || shape === 'u-platform') {
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
  let bestSteps = clamp(Math.round(form.height / 175), 3, 18);
  let bestScore = Number.POSITIVE_INFINITY;

  for (let steps = 3; steps <= 18; steps += 1) {
    const riser = form.height / steps;
    const tread = form.openingLength / Math.max(steps - 1, 1);
    const blondel = 2 * riser + tread;
    const riserPenalty = isBetween(riser, 150, 200) ? 0 : Math.abs(riser - 175) * 4;
    const treadTarget = isWinderShape(form.shape) ? 225 : 280;
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
 * Возвращает суммарное количество забежных ступеней для выбранной формы.
 * Для П-образной схемы складывает два отдельных поворота.
 * @param {object} form - Текущие значения формы.
 * @returns {number} Количество забежных ступеней с учетом минимальных значений.
 */
const getWinderStepsCount = (form) => {
  if (form.shape === 'u-winder') {
    return Math.max(Number(form.firstTurnWinderSteps), 3) + Math.max(Number(form.secondTurnWinderSteps), 3);
  }

  if (form.shape === 'winder-180') {
    return Math.max(Number(form.winderSteps), 6);
  }

  return Math.max(Number(form.winderSteps), 3);
};

/**
 * Рассчитывает длину проема L для форм, где пользователь ее не вводит.
 * У забежных это длина линии хода: прямые проступи плюс дуга поворота по средней линии.
 * @param {object} form - Текущие значения формы.
 * @param {number} safeSteps - Количество подъемов после нормализации.
 * @param {number} turnAngle - Угол поворота лестницы в градусах.
 * @param {number} winderSteps - Количество забежных ступеней.
 * @returns {number} Введенная или расчетная длина проема L в миллиметрах.
 */
const calculateOpeningLength = (form, safeSteps, turnAngle, winderSteps) => {
  if (form.shape === 'spiral') {
    return Number(form.outerRadius) * 2;
  }

  if (!isWinderShape(form.shape)) {
    return Number(form.openingLength);
  }

  const turnArcLength = Number(form.turnRadius) * (turnAngle * Math.PI / 180);
  const straightSteps = Math.max(safeSteps - winderSteps, 0);
  const straightRun = straightSteps * 280;

  return straightRun + turnArcLength;
};

/**
 * Рассчитывает длины маршей для площадочных форм по введенным пользователем ступеням.
 * Автоматические поля выводятся как остаток от общего количества n.
 * @param {object} form - Текущие значения формы.
 * @param {number} safeSteps - Общее количество подъемов.
 * @returns {object} Количество подъемов в каждом марше.
 */
const calculateFlightSteps = (form, safeSteps) => {
  const firstFlightSteps = Math.max(Number(form.firstFlightSteps), 0);

  if (form.shape === 'u-platform') {
    const secondFlightSteps = Math.max(Number(form.secondFlightSteps), 0);

    return {
      firstFlightSteps,
      secondFlightSteps,
      thirdFlightSteps: Math.max(safeSteps - firstFlightSteps - secondFlightSteps, 0),
    };
  }

  return {
    firstFlightSteps,
    secondFlightSteps: Math.max(safeSteps - firstFlightSteps, 0),
    thirdFlightSteps: 0,
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
  const stringerLength = Math.hypot(form.height, horizontalRun) / 1000;
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
 * Для маршевых схем использует горизонтальную проекцию, для забежных - среднюю линию хода,
 * для винтовой - дугу окружности на радиусе линии хода.
 * @param {object} form - Текущие значения формы.
 * @returns {object} Рассчитанные геометрические параметры.
 */
const calculateGeometry = (form) => {
  const steps = form.useAutoSteps ? calculateAutoSteps(form) : Number(form.steps);
  const safeSteps = Math.max(steps, 1);
  const riser = form.height / safeSteps;
  const turnAngle = getTurnAngle(form.shape);
  const winderSteps = getWinderStepsCount(form);
  const flightSteps = calculateFlightSteps(form, safeSteps);
  const flightLength = calculateOpeningLength(form, safeSteps, turnAngle, winderSteps);
  const landingLength = Math.max(Number(form.landingLength), Number(form.flightWidth));
  const marchRunLength = form.shape.includes('platform')
    ? Math.max(flightLength - landingLength, 1)
    : flightLength;
  const tread = marchRunLength / Math.max(safeSteps - 1, 1);
  const turnRadius = Math.max(Number(form.turnRadius), 1);
  const winderArcLength = turnRadius * (turnAngle * Math.PI / 180);
  const winderMiddleTread = isWinderShape(form.shape) ? winderArcLength / Math.max(winderSteps, 1) : tread;
  const winderStepAngle = turnAngle / Math.max(winderSteps, 1);
  const winderInnerRadius = Math.max(turnRadius - Number(form.flightWidth) / 2, 100);
  const winderOuterRadius = turnRadius + Number(form.flightWidth) / 2;
  const winderNarrowEnd = winderInnerRadius * (winderStepAngle * Math.PI / 180);
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
  const activeTread = form.shape === 'spiral' ? spiralLineTread : isWinderShape(form.shape) ? winderMiddleTread : tread;
  const slopeAngle = Math.atan(form.height / Math.max((safeSteps - 1) * activeTread, 1)) * (180 / Math.PI);
  const spiralSlopeAngle = Math.atan(riser / spiralLineTread) * (180 / Math.PI);
  const blondel = 2 * riser + activeTread;
  const planLength = form.shape === 'spiral' ? outerRadius * 2 : flightLength;
  const planWidth = form.shape === 'straight' ? form.flightWidth : form.shape === 'spiral' ? outerRadius * 2 : Math.max(form.flightWidth * 2, winderOuterRadius);
  const materialUsage = calculateMaterialUsage(form, {
    activeTread,
    flightLength,
    riser,
    safeSteps,
    spiralLineTread,
    treadWidth,
  });

  return {
    activeTread,
    blondel,
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
    turnAngle,
    turnRadius,
    walkingRadius,
    winderArcLength,
    winderInnerRadius,
    winderMiddleTread,
    winderNarrowEnd,
    winderOuterRadius,
    winderStepAngle,
    winderSteps,
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
  const isWinder = isWinderShape(form.shape);
  const isMarch = isMarchShape(form.shape);
  const stepsFix = form.shape === 'straight'
    ? 'Измените высоту подъема H, длину проема L или отключите авторасчет и задайте количество подъемов вручную.'
    : 'Измените высоту подъема H или общее количество ступеней n.';
  const treadFix = isWinder
    ? 'Измените радиус поворота по средней линии или количество забежных ступеней.'
    : 'Измените длину проема L, количество подъемов n или распределение ступеней по маршам.';

  checks.push(
    createCheck(
      isBetween(geometry.safeSteps, 3, 18) ? 'ok' : 'error',
      'Число ступеней в марше',
      `${geometry.safeSteps} шт.`,
      'Обязательный диапазон: 3-18',
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

  if (isWinder) {
    checks.push(
      createCheck(
        isBetween(geometry.winderMiddleTread, 200, 250) ? 'ok' : 'error',
        'Забежные: ширина по средней линии',
        `${formatNumber(geometry.winderMiddleTread, 1)} мм`,
        'Обязательный диапазон: 200-250 мм',
        'Измените радиус поворота по средней линии или количество забежных ступеней. Длина L для этой формы считается автоматически.',
      ),
    );
    checks.push(
      createCheck(
        geometry.winderNarrowEnd >= 100 ? 'ok' : 'error',
        'Забежные: узкий конец',
        `${formatNumber(geometry.winderNarrowEnd, 1)} мм`,
        'Минимум 100 мм',
        'Увеличьте радиус поворота по средней линии или количество забежных ступеней.',
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
  const scale = Math.min((width - padding * 2) / horizontalRun, (height - padding * 2) / form.height);
  const baseX = padding;
  const baseY = height - padding;
  const topY = baseY - form.height * scale;
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

  drawDimension(ctx, `H = ${formatNumber(form.height)} мм`, baseX - 22, baseY, baseX - 22, topY);
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
 * Рисует сектор забежных ступеней на плане.
 * @param {CanvasRenderingContext2D} ctx - Контекст Canvas.
 * @param {number} cx - Центр поворота X.
 * @param {number} cy - Центр поворота Y.
 * @param {number} innerRadius - Внутренний радиус сектора.
 * @param {number} outerRadius - Внешний радиус сектора.
 * @param {number} startAngle - Начальный угол в радианах.
 * @param {number} turnAngle - Угол поворота в радианах.
 * @param {number} steps - Количество забежных ступеней.
 * @returns {void}
 */
const drawWinderSector = (ctx, cx, cy, innerRadius, outerRadius, startAngle, turnAngle, steps) => {
  ctx.strokeStyle = '#f97316';
  ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
  ctx.lineWidth = 2;

  for (let index = 0; index < steps; index += 1) {
    const angle1 = startAngle + (turnAngle / steps) * index;
    const angle2 = startAngle + (turnAngle / steps) * (index + 1);

    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, angle1, angle2);
    ctx.lineTo(cx + Math.cos(angle2) * innerRadius, cy + Math.sin(angle2) * innerRadius);
    ctx.arc(cx, cy, innerRadius, angle2, angle1, true);
    ctx.closePath();
    ctx.fill();
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
 * Рисует план лестницы с габаритами и специальной графикой для забежных и винтовых схем.
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
    const enteredFlightSteps = Math.max(geometry.firstFlightSteps + geometry.secondFlightSteps + geometry.thirdFlightSteps, 1);
    const firstFlightLength = marchRun * (geometry.firstFlightSteps / enteredFlightSteps);
    const secondFlightLength = marchRun * (geometry.secondFlightSteps / enteredFlightSteps);
    const thirdFlightLength = Math.max(marchRun - firstFlightLength - secondFlightLength, flightWidth);

    drawFlightPlan(ctx, originX, originY + landing, firstFlightLength, flightWidth, geometry.firstFlightSteps);
    drawFlightPlan(ctx, originX + firstFlightLength, originY, secondFlightLength, flightWidth, geometry.secondFlightSteps);
    drawFlightPlan(ctx, originX, originY, thirdFlightLength, flightWidth, geometry.thirdFlightSteps);
    ctx.strokeStyle = '#22c55e';
    ctx.strokeRect(originX + firstFlightLength, originY, landing, flightWidth * 2);
    ctx.fillText(`Площадка ${formatNumber(geometry.landingLength)} мм`, originX + firstFlightLength + 8, originY + flightWidth);
  } else {
    const cx = originX + Math.min(flightLength * 0.52, width - padding - geometry.winderOuterRadius * scale);
    const cy = originY + flightWidth * 1.35;
    const outer = geometry.winderOuterRadius * scale;
    const inner = geometry.winderInnerRadius * scale;
    const turn = geometry.turnAngle * (Math.PI / 180);

    drawFlightPlan(ctx, originX, cy - flightWidth / 2, flightLength * 0.5, flightWidth, Math.ceil((geometry.safeSteps - geometry.winderSteps) / 2));
    drawWinderSector(ctx, cx, cy, inner, outer, -Math.PI / 2, turn, geometry.winderSteps);
    ctx.fillStyle = '#334155';
    ctx.fillText(`по средней линии: ${formatNumber(geometry.winderMiddleTread, 1)} мм`, cx + 16, cy - 18);
    ctx.fillText(`узкий конец: ${formatNumber(geometry.winderNarrowEnd, 1)} мм`, cx + 16, cy + 2);
    ctx.fillText(`угол ступени: ${formatNumber(geometry.winderStepAngle, 1)}°`, cx + 16, cy + 22);
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
 * Используется в форме, чтобы ошибки по забежным или винтовым элементам были связаны с видимыми значениями.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @returns {Array<{label: string, value: string, note: string}>} Список параметров выбранной формы для вывода.
 */
const buildShapeParameters = (form, geometry) => {
  if (form.shape === 'spiral') {
    return [
      { label: 'Расчетная длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Диаметр по внешнему радиусу, только для чтения' },
      { label: 'Проступь по линии хода', value: `${formatNumber(geometry.spiralLineTread, 1)} мм`, note: 'Минимум 180 мм' },
      { label: 'Узкая часть ступени', value: `${formatNumber(geometry.spiralNarrowEnd, 1)} мм`, note: 'Минимум 100 мм' },
      { label: 'Высота между витками', value: `${formatNumber(geometry.spiralHeadroom)} мм`, note: 'Минимум 2000 мм' },
      { label: 'Внутренний радиус', value: `${formatNumber(geometry.innerRadius)} мм`, note: 'Задается в форме' },
      { label: 'Внешний радиус', value: `${formatNumber(geometry.outerRadius)} мм`, note: 'Задается в форме' },
      { label: 'Радиус линии хода', value: `${formatNumber(geometry.walkingRadius)} мм`, note: 'Расчетное значение' },
    ];
  }

  if (isWinderShape(form.shape)) {
    return [
      { label: 'Расчетная длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Считается по прямым участкам и дуге поворота' },
      { label: 'Забежные ступени', value: `${geometry.winderSteps} шт.`, note: geometry.turnAngle === 180 ? 'Минимум 6 шт.' : 'Минимум 3 шт.' },
      { label: 'Радиус средней линии', value: `${formatNumber(geometry.turnRadius)} мм`, note: 'Задается в форме' },
      { label: 'Ширина по средней линии', value: `${formatNumber(geometry.winderMiddleTread, 1)} мм`, note: 'Обязательный диапазон: 200-250 мм' },
      { label: 'Узкий конец забежной', value: `${formatNumber(geometry.winderNarrowEnd, 1)} мм`, note: 'Минимум 100 мм' },
      { label: 'Угол забежной ступени', value: `${formatNumber(geometry.winderStepAngle, 1)}°`, note: 'Расчетное значение' },
      { label: 'Поворот лестницы', value: `${geometry.turnAngle}°`, note: 'Зависит от формы' },
    ];
  }

  if (form.shape.includes('platform')) {
    return [
      { label: 'Длина проема L', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Задается полем L' },
      { label: 'Глубина проступи', value: `${formatNumber(geometry.tread, 1)} мм`, note: 'Обязательный диапазон: 260-300 мм' },
      { label: 'Размер площадки', value: `${formatNumber(geometry.landingLength)} мм`, note: 'Не меньше ширины марша' },
      { label: 'Ступени 1-го марша', value: `${geometry.firstFlightSteps} шт.`, note: 'Задается в форме' },
      { label: 'Ступени 2-го марша', value: `${geometry.secondFlightSteps} шт.`, note: form.shape === 'u-platform' ? 'Задается в форме' : 'Авторасчет остатка' },
      ...(form.shape === 'u-platform' ? [{ label: 'Ступени 3-го марша', value: `${geometry.thirdFlightSteps} шт.`, note: 'Авторасчет остатка' }] : []),
      { label: 'Поворот лестницы', value: `${geometry.turnAngle}°`, note: 'Зависит от формы' },
    ];
  }

  return [
    { label: 'Длина марша', value: `${formatNumber(geometry.flightLength)} мм`, note: 'Задается полем L' },
    { label: 'Глубина проступи', value: `${formatNumber(geometry.tread, 1)} мм`, note: 'Обязательный диапазон: 260-300 мм' },
    { label: 'Габарит плана', value: `${formatNumber(geometry.planLength)} × ${formatNumber(geometry.planWidth)} мм`, note: 'Расчетный размер сверху' },
  ];
};

/**
 * Главный React-компонент калькулятора лестниц.
 * Хранит ввод пользователя, запускает расчеты и синхронизирует Canvas-чертежи с результатами.
 * @returns {JSX.Element} Интерфейс калькулятора.
 */
const App = () => {
  const [form, setForm] = useState(INITIAL_FORM);
  const profileCanvasRef = useRef(null);
  const planCanvasRef = useRef(null);
  const geometry = useMemo(() => calculateGeometry(form), [form]);
  const report = useMemo(() => buildChecks(form, geometry), [form, geometry]);
  const selectedShape = SHAPES.find((shape) => shape.value === form.shape)?.label;
  const selectedMaterial = MATERIALS.find((material) => material.value === form.material)?.label;
  const isSpiral = form.shape === 'spiral';
  const isWinder = isWinderShape(form.shape);
  const canUseAutoSteps = isFieldVisible(form.shape, 'autoSteps');
  const shapeParameters = useMemo(() => buildShapeParameters(form, geometry), [form, geometry]);
  const exportData = useMemo(() => ({
    form,
    geometry,
    isSpiral,
    isWinder,
    report,
    selectedMaterial,
    selectedShape,
  }), [form, geometry, isSpiral, isWinder, report, selectedMaterial, selectedShape]);

  /**
   * Обновляет числовое поле формы с приведением к Number.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие изменения поля.
   * @returns {void}
   */
  const handleNumberChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: Number(value),
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
  }, [form, geometry]);

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="hero__eyebrow">СП 55.13330.2016 · ГОСТ 9818-2015 · СП 1.13130.2020</p>
          <h1 className="hero__title">Калькулятор лестниц для частного жилого дома</h1>
          <p className="hero__text">
            Мягкая проверка норм для домов до 3 этажей: маршевые, забежные и винтовые лестницы,
            материалы дерево, сталь и железобетон. Пожарный тип по умолчанию: {form.fireType}.
          </p>
        </div>
        <div className={report.errors.length ? 'hero__status hero__status--error' : 'hero__status hero__status--ok'}>
          {report.errors.length ? 'Есть ошибки' : 'Соответствует нормам'}
        </div>
      </section>

      <section className="layout">
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

            {isFieldVisible(form.shape, 'firstFlightSteps') && (
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

            {isFieldVisible(form.shape, 'secondFlightSteps') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Количество ступеней во 2-м марше', PARAMETER_HINTS.secondFlightSteps)}</span>
                <input
                  className="field__control"
                  disabled={form.shape === 'l-platform'}
                  min="0"
                  name="secondFlightSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.shape === 'l-platform' ? geometry.secondFlightSteps : form.secondFlightSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'thirdFlightSteps') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Количество ступеней в 3-м марше', PARAMETER_HINTS.thirdFlightSteps)}</span>
                <input
                  className="field__control"
                  disabled
                  min="0"
                  name="thirdFlightSteps"
                  type="number"
                  value={geometry.thirdFlightSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'winderSteps') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Количество забежных ступеней', PARAMETER_HINTS.winderSteps)}</span>
                <input
                  className="field__control"
                  max={form.shape === 'winder-180' ? 10 : 5}
                  min={form.shape === 'winder-180' ? 6 : 3}
                  name="winderSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.winderSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'firstTurnWinderSteps') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Забежные ступени в 1-м повороте', PARAMETER_HINTS.firstTurnWinderSteps)}</span>
                <input
                  className="field__control"
                  min="3"
                  name="firstTurnWinderSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.firstTurnWinderSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'secondTurnWinderSteps') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Забежные ступени во 2-м повороте', PARAMETER_HINTS.secondTurnWinderSteps)}</span>
                <input
                  className="field__control"
                  min="3"
                  name="secondTurnWinderSteps"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.secondTurnWinderSteps}
                />
              </label>
            )}

            {isFieldVisible(form.shape, 'turnRadius') && (
              <label className="field">
                <span className="field__label">{renderParameterHeader('Радиус поворота по средней линии, мм', PARAMETER_HINTS.turnRadius)}</span>
                <input
                  className="field__control"
                  min="1"
                  name="turnRadius"
                  onChange={handleNumberChange}
                  type="number"
                  value={form.turnRadius}
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

      <section className="drawings">
        <article className="card drawing">
          <h2>Вид сбоку</h2>
          <canvas ref={profileCanvasRef} aria-label="Canvas с профилем лестницы" />
        </article>
        <article className="card drawing">
          <h2>Вид сверху</h2>
          <canvas ref={planCanvasRef} aria-label="Canvas с планом лестницы" />
        </article>
        <Staircase3D form={form} geometry={geometry} />
      </section>

      <section className="card table-card">
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
                  {form.shape === 'u-platform' && <tr><th>{renderParameterHeader('Ступени 3-го марша', PARAMETER_HINTS.thirdFlightSteps)}</th><td>{geometry.thirdFlightSteps} шт.</td></tr>}
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
              {isWinder && (
                <>
                  <tr><th>Поворот</th><td>{geometry.turnAngle}°</td></tr>
                  <tr><th>{renderParameterHeader('Радиус поворота по средней линии', PARAMETER_HINTS.turnRadius)}</th><td>{formatNumber(geometry.turnRadius)} мм</td></tr>
                  {form.shape === 'u-winder' && (
                    <>
                      <tr><th>{renderParameterHeader('Забежные ступени в 1-м повороте', PARAMETER_HINTS.firstTurnWinderSteps)}</th><td>{form.firstTurnWinderSteps} шт.</td></tr>
                      <tr><th>{renderParameterHeader('Забежные ступени во 2-м повороте', PARAMETER_HINTS.secondTurnWinderSteps)}</th><td>{form.secondTurnWinderSteps} шт.</td></tr>
                    </>
                  )}
                  {form.shape !== 'u-winder' && <tr><th>{renderParameterHeader('Количество забежных ступеней', PARAMETER_HINTS.winderSteps)}</th><td>{geometry.winderSteps} шт.</td></tr>}
                  <tr><th>Угол забежной ступени</th><td>{formatNumber(geometry.winderStepAngle, 1)}°</td></tr>
                  <tr><th>Узкий конец забежной</th><td>{formatNumber(geometry.winderNarrowEnd, 1)} мм</td></tr>
                </>
              )}
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

      <section className="card table-card">
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

      <ExportPanel exportData={exportData} planCanvasRef={planCanvasRef} profileCanvasRef={profileCanvasRef} />
    </main>
  );
};

export default App;
