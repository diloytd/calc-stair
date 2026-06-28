/**
 * Возвращает единичный вектор направления марша по углу поворота на плане.
 * @param {number} angleDeg - Угол в градусах относительно оси X.
 * @returns {{x: number, z: number}} Направление движения по лестнице.
 */
const getDirection = (angleDeg) => {
  const radians = (angleDeg * Math.PI) / 180;

  return {
    x: Math.cos(radians),
    z: Math.sin(radians),
  };
};

/**
 * Возвращает нормаль к направлению марша на плане.
 * @param {{x: number, z: number}} direction - Единичный вектор направления.
 * @returns {{x: number, z: number}} Нормаль слева от направления движения.
 */
const getNormal = (direction) => ({
  x: -direction.z,
  z: direction.x,
});

/**
 * Смещает точку курсора на плане по направлению и расстоянию.
 * @param {{x: number, y: number, z: number}} cursor - Текущая точка сборки.
 * @param {{x: number, z: number}} direction - Единичный вектор направления.
 * @param {number} distance - Расстояние смещения в миллиметрах.
 * @returns {{x: number, y: number, z: number}} Новая точка курсора.
 */
const moveCursor = (cursor, direction, distance) => ({
  x: cursor.x + direction.x * distance,
  y: cursor.y,
  z: cursor.z + direction.z * distance,
});

/**
 * Возвращает длину марша и площадки блока `flight` в миллиметрах.
 * @param {object} component - Компонент `flight`.
 * @returns {{marchLength: number, platformLength: number, totalLength: number}} Длины сегментов.
 */
const getFlightRunLengths = (component) => {
  const marchLength = component.anchorMarchLength ?? component.steps * component.treadDepth;
  const platformLength = component.platform?.length ?? 0;

  return {
    marchLength,
    platformLength,
    totalLength: marchLength + platformLength,
  };
};

/**
 * Возвращает длину марша без «ступени-площадки» для layout Г-лестницы.
 * Последняя ступень прямого марша заменяется площадкой в 3D-блоке.
 * @param {object} component - Компонент `flight`.
 * @returns {number} Длина марша в миллиметрах.
 */
const getLayoutMarchLength = (component) => {
  if (Number.isFinite(component.anchorMarchLength)) {
    return component.anchorMarchLength;
  }

  const layoutSteps = component.platform && component.steps > 0
    ? Math.max(component.steps - 1, 0)
    : component.steps;

  return layoutSteps * component.treadDepth;
};

/**
 * Возвращает число видимых ступеней в блоке `flight` до площадки или межэтажного завершения.
 * @param {object} component - Компонент `flight`.
 * @returns {number} Количество отрисовываемых ступеней.
 */
export const getFlightVisibleStepCount = (component) => {
  const platform = component.platform;
  const endsOnFloorLanding = component.endsOnFloorLanding ?? false;
  let visibleStepCount = component.steps > 0 ? component.steps : 0;

  if (platform) {
    visibleStepCount = Math.max(visibleStepCount - 1, 0);
  }

  if (endsOnFloorLanding) {
    visibleStepCount = Math.max(visibleStepCount - 1, 0);
  }

  return visibleStepCount;
};

/**
 * Возвращает локальную координату начала площадки вдоль оси марша.
 * Учитывает только видимые ступени до площадки; смещение origin марша задаётся в layout.
 * @param {object} component - Компонент `flight`.
 * @param {number} [visibleStepCount] - Число видимых ступеней до площадки.
 * @returns {number} Координата начала площадки в миллиметрах.
 */
export const getFlightPlatformStartAlong = (component, visibleStepCount = getFlightVisibleStepCount(component)) => (
  visibleStepCount * component.treadDepth
);

/**
 * Создаёт начальное состояние сборки Г-образной лестницы.
 * @param {number} landingLength - Длина площадки.
 * @param {number} width - Ширина марша.
 * @returns {object} Состояние layout.
 */
const createLPlatformLayoutState = (landingLength, width) => ({
  landingLength,
  width,
  heading: 0,
  floorSegmentIndex: 0,
  startStepIndex: 0,
  landingRowZ: landingLength,
  forwardMarchEnd: { x: 0, z: landingLength + width / 2 },
  marchOrigin: { x: 0, z: landingLength + width / 2 },
  marchOriginSide4: null,
});

/**
 * Возвращает индекс этажного пролёта (пара маршей) для Г-лестницы.
 * @param {number} flightIndex - Индекс марша.
 * @returns {number} Индекс пролёта.
 */
const getLSegmentIndex = (flightIndex) => Math.floor(flightIndex / 2);

/**
 * Возвращает true, если пролёт идёт в обратном направлении по X.
 * @param {number} segmentIndex - Индекс этажного пролёта.
 * @returns {boolean} `true` для нечётных пролётов.
 */
const isReverseLSegment = (segmentIndex) => segmentIndex % 2 === 1;

/**
 * Создаёт начальное состояние сборки многоэтажной лестницы.
 * @param {string} shape - Форма лестницы.
 * @param {number} landingLength - Длина площадки.
 * @param {number} width - Ширина марша.
 * @returns {object} Состояние layout.
 */
const createFlightLayoutState = (shape, landingLength, width) => {
  if (shape === 'l-platform') {
    return createLPlatformLayoutState(landingLength, width);
  }

  return {
    shape,
    landingLength,
    width,
    heading: 0,
    startStepIndex: 0,
    cursor: { x: 0, y: 0, z: 0 },
    uMarchEndX: 0,
  };
};

/**
 * Возвращает границы поворотной площадки блока `flight` на плане.
 * Использует ту же локальную геометрию, что и `FlightBlock` в 3D-сцене.
 * @param {{x: number, z: number}} position - Позиция начала блока.
 * @param {number} angleY - Угол поворота блока в градусах.
 * @param {number} platformStartAlong - Локальная координата начала площадки вдоль марша.
 * @param {number} platformLength - Длина площадки в миллиметрах.
 * @param {number} width - Ширина марша в миллиметрах.
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Границы площадки.
 */
const getTurnPlatformPlanBounds = (position, angleY, platformStartAlong, platformLength, width) => {
  const totalPlatform = platformLength;
  const centerAlong = platformStartAlong + totalPlatform / 2;
  const halfPlatform = totalPlatform / 2;
  const halfWidth = width / 2;
  const direction = getDirection(angleY);
  const normal = getNormal(direction);
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  const corners = [
    { along: centerAlong - halfPlatform, across: -halfWidth },
    { along: centerAlong - halfPlatform, across: halfWidth },
    { along: centerAlong + halfPlatform, across: -halfWidth },
    { along: centerAlong + halfPlatform, across: halfWidth },
  ];

  corners.forEach(({ along, across }) => {
    const point = {
      x: position.x + direction.x * along + normal.x * across,
      z: position.z + direction.z * along + normal.z * across,
    };

    bounds.minX = Math.min(bounds.minX, point.x);
    bounds.maxX = Math.max(bounds.maxX, point.x);
    bounds.minZ = Math.min(bounds.minZ, point.z);
    bounds.maxZ = Math.max(bounds.maxZ, point.z);
  });

  return bounds;
};

/**
 * Возвращает центр указанной стороны площадки на плане.
 * Стороны в локальной СК блока: 1 — min X, 2 — max Z, 3 — max X, 4 — min Z.
 * @param {{x: number, z: number}} position - Позиция начала блока с площадкой.
 * @param {number} angleY - Угол поворота блока в градусах.
 * @param {1|2|3|4} side - Номер стороны площадки.
 * @param {number} platformStartAlong - Локальная координата начала площадки вдоль марша.
 * @param {number} platformLength - Длина площадки в миллиметрах.
 * @param {number} width - Ширина марша в миллиметрах.
 * @returns {{x: number, z: number}} Центр стороны на плане.
 */
const getPlatformSideCenter = (position, angleY, side, platformStartAlong, platformLength, width) => {
  const totalPlatform = platformLength;
  const centerAlong = platformStartAlong + totalPlatform / 2;
  const halfPlatform = totalPlatform / 2;
  const halfWidth = width / 2;
  const direction = getDirection(angleY);
  const normal = getNormal(direction);
  let along = centerAlong;
  let across = 0;

  if (side === 1) {
    along = centerAlong - halfPlatform;
  } else if (side === 2) {
    across = halfWidth;
  } else if (side === 3) {
    along = centerAlong + halfPlatform;
  } else {
    across = -halfWidth;
  }

  return {
    x: position.x + direction.x * along + normal.x * across,
    z: position.z + direction.z * along + normal.z * across,
  };
};

/**
 * Возвращает origin марша, начинающегося с указанной точки на стороне площадки.
 * Origin смещается на одну проступь наружу, чтобы первая ступень не ложилась на площадку.
 * @param {{x: number, z: number}} sideCenter - Центр стороны площадки на плане.
 * @param {number} marchAngleY - Угол марша в градусах.
 * @param {number} treadDepth - Глубина проступи в миллиметрах.
 * @returns {{x: number, z: number}} Позиция начала марша на плане.
 */
const getMarchStartFromPlatformSide = (sideCenter, marchAngleY, treadDepth) => {
  const direction = getDirection(marchAngleY);

  return {
    x: sideCenter.x + direction.x * treadDepth,
    z: sideCenter.z + direction.z * treadDepth,
  };
};

/**
 * Рассчитывает позицию и угол Г-образного марша.
 * Чётные пролёты: +X и −Z; нечётные: −X и +Z — непрерывная «змейка» по этажам.
 * @param {object} component - Компонент `flight`.
 * @param {object} state - Текущее состояние layout.
 * @returns {{position: object, flightAngleY: number, platformOffset: object}} Параметры размещения.
 */
const resolveLPlatformFlightLayout = (component, state) => {
  const marchLength = getLayoutMarchLength(component);
  const isForward = component.flightIndex % 2 === 0;
  const segmentIndex = getLSegmentIndex(component.flightIndex);
  const isReverse = isReverseLSegment(segmentIndex);
  const platformOffset = { x: 0, z: 0 };
  let flightAngleY;
  let position;

  if (isForward) {
    flightAngleY = isReverse ? 180 : 0;

    if (state.marchOriginSide4) {
      const marchStart = getMarchStartFromPlatformSide(
        state.marchOriginSide4,
        flightAngleY,
        component.treadDepth,
      );
      position = { x: marchStart.x, y: 0, z: marchStart.z };
      state.marchOriginSide4 = null;
    } else {
      position = {
        x: state.marchOrigin.x,
        y: 0,
        z: state.marchOrigin.z,
      };
    }

    const direction = getDirection(flightAngleY);
    state.forwardMarchEnd = {
      x: position.x + direction.x * marchLength,
      z: position.z + direction.z * marchLength,
    };

    if (component.platform) {
      const platformStartAlong = (
        component.steps > 0 ? Math.max(component.steps - 1, 0) : 0
      ) * component.treadDepth;
      const platformBounds = getTurnPlatformPlanBounds(
        position,
        flightAngleY,
        platformStartAlong,
        component.platform.length,
        state.width,
      );
      state.turnPlatformBounds = platformBounds;
      state.turnPlatformMaxX = platformBounds.maxX;
      state.turnPlatformMinX = platformBounds.minX;
      state.turnPlatformSide4 = getPlatformSideCenter(
        position,
        flightAngleY,
        4,
        platformStartAlong,
        component.platform.length,
        state.width,
      );
      state.landingRowZ = state.forwardMarchEnd.z - state.width / 2;
    }
  } else if (isReverse) {
    flightAngleY = 90;
    const sideCenter = state.turnPlatformSide4 ?? {
      x: state.forwardMarchEnd.x,
      z: state.landingRowZ,
    };
    const marchStart = getMarchStartFromPlatformSide(sideCenter, flightAngleY, component.treadDepth);
    position = {
      x: marchStart.x,
      y: 0,
      z: marchStart.z,
    };

    const direction = getDirection(flightAngleY);
    const returnEnd = {
      x: position.x + direction.x * marchLength,
      z: position.z + direction.z * marchLength,
    };

    state.segmentReturnEnd = returnEnd;
    state.landingRowZ = returnEnd.z;
    state.lastOddFlightLayout = {
      position: { ...position },
      angleY: flightAngleY,
      marchLength,
      treadDepth: component.treadDepth,
    };
  } else {
    flightAngleY = 270;
    const sideCenter = state.turnPlatformSide4 ?? {
      x: state.turnPlatformMaxX ?? state.forwardMarchEnd.x,
      z: state.landingRowZ,
    };
    const marchStart = getMarchStartFromPlatformSide(sideCenter, flightAngleY, component.treadDepth);
    position = {
      x: marchStart.x,
      y: 0,
      z: marchStart.z,
    };

    const direction = getDirection(flightAngleY);
    const returnEnd = {
      x: position.x + direction.x * marchLength,
      z: position.z + direction.z * marchLength,
    };

    state.segmentReturnEnd = returnEnd;
    state.landingRowZ = returnEnd.z;
    state.lastOddFlightLayout = {
      position: { ...position },
      angleY: flightAngleY,
      marchLength,
      treadDepth: component.treadDepth,
    };
  }

  return { position, flightAngleY, platformOffset };
};

/**
 * Размещает межэтажную площадку после обратного марша Г-лестницы.
 * Следующий пролёт продолжается от конца обратного марша, а не сбрасывается в (0, 0).
 * @param {object} component - Компонент межэтажной площадки.
 * @param {object} state - Текущее состояние layout.
 * @returns {object} Компонент с рассчитанной позицией.
 */
const layoutLFloorLanding = (component, state) => {
  const anchor = state.lastOddFlightLayout;
  const flightAngleY = anchor?.angleY ?? state.heading;
  const returnDirection = getDirection(flightAngleY);
  const treadDepth = anchor?.treadDepth ?? component.treadDepth ?? 0;
  const floorLandingPosition = {
    x: state.segmentReturnEnd.x - returnDirection.x * treadDepth,
    y: 0,
    z: state.segmentReturnEnd.z - returnDirection.z * treadDepth,
  };
  const nextSegmentIndex = (state.floorSegmentIndex ?? 0) + 1;
  const nextForwardHeading = isReverseLSegment(nextSegmentIndex) ? 180 : 0;
  const floorLandingLength = component.platform?.length ?? state.landingLength;
  const side4Center = getPlatformSideCenter(
    floorLandingPosition,
    flightAngleY,
    4,
    0,
    floorLandingLength,
    state.width,
  );

  state.floorSegmentIndex = nextSegmentIndex;
  state.landingRowZ = floorLandingPosition.z;
  state.heading = nextForwardHeading;
  state.marchOriginSide4 = side4Center;
  state.marchOrigin = { ...side4Center };
  state.forwardMarchEnd = { ...state.marchOrigin };

  return {
    ...component,
    angleY: flightAngleY,
    platformOffset: { x: 0, z: 0 },
    position: floorLandingPosition,
    startStepIndex: state.startStepIndex,
    topStepIndex: Math.max(state.startStepIndex - 1, 0),
    anchorMarchLength: anchor?.treadDepth ?? component.treadDepth ?? 0,
  };
};

/**
 * Рассчитывает позицию и угол П-образного марша.
 * Многоэтажная П-лестница повторяет один и тот же U-контур на каждом этаже,
 * поэтому смещение по Z между пролётами не применяется.
 * @param {object} component - Компонент `flight`.
 * @param {object} state - Текущее состояние layout.
 * @returns {{position: object, flightAngleY: number, platformOffset: object}} Параметры размещения.
 */
const resolveUPlatformFlightLayout = (component, state) => {
  const { marchLength } = getFlightRunLengths(component);
  const isForward = component.flightIndex % 2 === 0;
  let position;
  let flightAngleY;
  let platformOffset = { x: 0, z: 0 };

  if (isForward) {
    position = { x: 0, y: 0, z: state.width * 1.5 };
    flightAngleY = 0;
    platformOffset = { x: 0, z: -state.width / 2 };
    state.uMarchEndX = marchLength;
  } else {
    position = {
      x: state.uMarchEndX,
      y: 0,
      z: state.width / 2,
    };
    flightAngleY = 180;
    platformOffset = { x: 0, z: -state.width / 2 };
  }

  return { position, flightAngleY, platformOffset };
};

/**
 * Рассчитывает позицию прямого марша с промежуточной площадкой.
 * @param {object} state - Текущее состояние layout.
 * @returns {{position: object, flightAngleY: number, platformOffset: object}} Параметры размещения.
 */
const resolveStraightFlightLayout = (state) => ({
  position: { ...state.cursor },
  flightAngleY: state.heading,
  platformOffset: { x: 0, z: 0 },
});

/**
 * Размещает цепочку блоков `flight` для многоэтажных лестниц.
 * @param {object} component - Компонент `flight`.
 * @param {object} state - Текущее состояние layout.
 * @returns {object} Компонент с рассчитанной позицией и индексами ступеней.
 */
const layoutFlightComponent = (component, state) => {
  if (component.layoutRole === 'l-floor-landing') {
    return layoutLFloorLanding(component, state);
  }

  const { totalLength } = getFlightRunLengths(component);
  let layout;

  if (component.shape === 'l-platform') {
    layout = resolveLPlatformFlightLayout(component, state);
  } else if (component.shape === 'u-platform') {
    layout = resolveUPlatformFlightLayout(component, state);
  } else {
    layout = resolveStraightFlightLayout(state);
  }

  const resolvedComponent = {
    ...component,
    angleY: layout.flightAngleY,
    platformOffset: layout.platformOffset,
    position: layout.position,
    startStepIndex: state.startStepIndex,
    topStepIndex: Math.max(state.startStepIndex + component.steps - 1, 0),
  };

  state.startStepIndex += component.steps;

  if (component.shape === 'straight') {
    const direction = getDirection(layout.flightAngleY);
    state.cursor = moveCursor(layout.position, direction, totalLength);
  }

  if (component.platform?.turnAngle) {
    state.heading += component.platform.turnAngle;
  }

  return resolvedComponent;
};

/**
 * Рассчитывает абсолютные позиции компонентов лестницы на плане.
 * Блоки `flight` содержат марш и площадку в одной локальной системе координат.
 * @param {Array<object>} components - Массив компонентов из `generateComponents`.
 * @returns {Array<object>} Компоненты с полями `position`, `angleY`, `startStepIndex` и уточнёнными размерами.
 */
export const layoutStairComponents = (components) => {
  const cursor = { x: 0, y: 0, z: 0 };
  let angleY = 0;
  let startStepIndex = 0;
  let previousMarchTreadDepth = 0;
  const firstFlight = components.find((component) => component.type === 'flight');
  const flightLayoutState = firstFlight
    ? createFlightLayoutState(
      firstFlight.shape,
      firstFlight.platform?.length ?? firstFlight.width,
      firstFlight.width,
    )
    : null;

  return components.map((component) => {
    const direction = getDirection(angleY);
    const normal = getNormal(direction);

    if (component.type === 'flight' && component.shape) {
      return layoutFlightComponent(component, flightLayoutState);
    }

    if (component.type === 'flight') {
      const { marchLength } = getFlightRunLengths(component);
      let position = { ...cursor };
      let flightAngleY = angleY;
      let platformOffset = { x: 0, z: 0 };

      if (component.layoutRole === 'l-first') {
        position = { x: 0, y: 0, z: (component.platform?.length ?? 0) + component.width / 2 };
      }

      if (component.layoutRole === 'l-last') {
        position = {
          x: (flightLayoutState?.forwardMarchEnd?.x ?? marchLength) + component.width / 2,
          y: 0,
          z: flightLayoutState?.landingRowZ ?? (component.platform?.length ?? 0),
        };
      }

      if (component.layoutRole === 'u-first') {
        position = { x: 0, y: 0, z: component.width * 1.5 };
        platformOffset = component.platform
          ? { x: 0, z: -component.width / 2 }
          : { x: 0, z: 0 };
      }

      if (component.layoutRole === 'u-last') {
        position = {
          x: flightLayoutState?.uMarchEndX ?? marchLength,
          y: 0,
          z: component.width / 2,
        };
        flightAngleY = 180;
      }

      const resolvedComponent = {
        ...component,
        angleY: flightAngleY,
        platformOffset,
        position,
        startStepIndex,
        topStepIndex: Math.max(startStepIndex + component.steps - 1, 0),
      };

      startStepIndex += component.steps;
      angleY += component.platform?.turnAngle ?? 0;

      return resolvedComponent;
    }

    if (component.type === 'march') {
      const resolvedComponent = {
        ...component,
        angleY,
        position: { ...cursor },
        startStepIndex,
      };

      cursor.x += direction.x * component.treadDepth * component.steps;
      cursor.z += direction.z * component.treadDepth * component.steps;
      startStepIndex += component.steps;
      previousMarchTreadDepth = component.treadDepth;

      return resolvedComponent;
    }

    if (component.type === 'platform') {
      const platformStart = previousMarchTreadDepth > 0
        ? moveCursor(cursor, direction, -previousMarchTreadDepth)
        : { ...cursor };
      const platformLength = component.length + previousMarchTreadDepth;
      const resolvedComponent = {
        ...component,
        angleY,
        length: platformLength,
        position: platformStart,
        startStepIndex,
        topStepIndex: Math.max(startStepIndex - 1, 0),
      };

      cursor.x = platformStart.x + direction.x * platformLength;
      cursor.z = platformStart.z + direction.z * platformLength;
      angleY += component.turnAngle;
      previousMarchTreadDepth = 0;

      return resolvedComponent;
    }

    if (component.type === 'spiral' && component.variant === 'spiral') {
      const resolvedComponent = {
        ...component,
        angleY,
        position: { ...cursor },
        startStepIndex,
      };

      startStepIndex += component.steps;
      angleY += component.turnAngle;
      previousMarchTreadDepth = 0;

      return resolvedComponent;
    }

    if (component.type === 'spiral') {
      const flightWidth = component.outerRadius - component.innerRadius;
      const startAngleDeg = component.startAngleDeg ?? 0;
      const pivot = {
        x: cursor.x - direction.x * component.innerRadius - normal.x * flightWidth / 2,
        y: cursor.y,
        z: cursor.z - direction.z * component.innerRadius - normal.z * flightWidth / 2,
      };
      const newAngleY = angleY + component.turnAngle;
      const exitAngleDeg = angleY + startAngleDeg + component.turnAngle;
      const exitDirection = getDirection(exitAngleDeg);
      const newNormal = getNormal(getDirection(newAngleY));
      const resolvedComponent = {
        ...component,
        angleY,
        position: pivot,
        startStepIndex,
      };

      cursor.x = pivot.x + exitDirection.x * component.innerRadius - newNormal.x * flightWidth / 2;
      cursor.z = pivot.z + exitDirection.z * component.innerRadius - newNormal.z * flightWidth / 2;
      startStepIndex += component.steps;
      angleY = newAngleY;
      previousMarchTreadDepth = 0;

      return resolvedComponent;
    }

    return {
      ...component,
      angleY,
      position: { ...cursor },
      startStepIndex,
    };
  });
};

export { getDirection, getFlightRunLengths };
