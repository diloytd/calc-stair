import { useEffect, useRef } from 'react';

const MODEL_SCALE = 0.01;
const CAMERA_DISTANCE_MULTIPLIER = 1.8;
const MATERIAL_COLORS = {
  wood: 0xb77938,
  steel: 0x94a3b8,
  concrete: 0xb8b8b8,
};

/**
 * Возвращает библиотеку Three.js, загруженную через CDN.
 * Компонент использует глобальный `window.THREE`, чтобы не добавлять npm-зависимость.
 * @returns {object|null} Глобальный объект Three.js или `null`, если CDN еще не загрузился.
 */
const getThree = () => {
  if (!window.THREE?.OrbitControls) {
    return null;
  }

  return window.THREE;
};

/**
 * Освобождает GPU-ресурсы объекта Three.js и его потомков.
 * Вызывается перед пересборкой сцены, чтобы не копить geometry/material в памяти.
 * @param {THREE.Object3D} object - Объект сцены для рекурсивной очистки.
 * @returns {void}
 */
const disposeObject = (object) => {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
};

/**
 * Создает базовые материалы 3D-модели с простым освещением.
 * Цвет ступеней зависит от выбранного пользователем материала лестницы.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {string} material - Идентификатор материала формы.
 * @returns {object} Набор материалов для ступеней, ограждений, косоуров и площадок.
 */
const createMaterials = (THREE, material) => ({
  landing: new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.72, metalness: 0.05 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.48, metalness: 0.15 }),
  stringer: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.35 }),
  tread: new THREE.MeshStandardMaterial({
    color: MATERIAL_COLORS[material] ?? MATERIAL_COLORS.wood,
    roughness: material === 'steel' ? 0.38 : 0.7,
    metalness: material === 'steel' ? 0.55 : 0.04,
  }),
});

/**
 * Создает призму по горизонтальному контуру в миллиметрах.
 * Используется для прямоугольных, трапециевидных и секторных ступеней без изменения расчетной геометрии.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {Array<{x: number, z: number}>} footprint - Контур элемента на плане по часовой или против часовой стрелки.
 * @param {number} topY - Отметка верхней плоскости элемента в миллиметрах.
 * @param {number} thickness - Толщина элемента вниз от `topY` в миллиметрах.
 * @param {THREE.Material} material - Материал mesh.
 * @returns {THREE.Mesh} Mesh призмы.
 */
const createFootprintPrism = (THREE, footprint, topY, thickness, material) => {
  const bottomY = topY - thickness;
  const vertices = [];
  const indices = [];
  const shapePoints = footprint.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);

  footprint.forEach((point) => vertices.push(point.x, bottomY, point.z));
  footprint.forEach((point) => vertices.push(point.x, topY, point.z));

  triangles.forEach(([a, b, c]) => {
    indices.push(c, b, a);
    indices.push(a + footprint.length, b + footprint.length, c + footprint.length);
  });

  for (let index = 0; index < footprint.length; index += 1) {
    const nextIndex = (index + 1) % footprint.length;
    indices.push(index, nextIndex, nextIndex + footprint.length);
    indices.push(index, nextIndex + footprint.length, index + footprint.length);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
};

/**
 * Создает прямоугольник на плане из центра, направления и нормали.
 * Нужен, чтобы одинаково строить марши в разных направлениях.
 * @param {{x: number, z: number}} center - Центр прямоугольника.
 * @param {{x: number, z: number}} direction - Единичный вектор движения марша.
 * @param {number} length - Длина прямоугольника в миллиметрах.
 * @param {number} width - Ширина прямоугольника в миллиметрах.
 * @returns {Array<{x: number, z: number}>} Контур прямоугольника.
 */
const createRectangleFootprint = (center, direction, length, width) => {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const normal = { x: -direction.z, z: direction.x };

  return [
    {
      x: center.x - direction.x * halfLength - normal.x * halfWidth,
      z: center.z - direction.z * halfLength - normal.z * halfWidth,
    },
    {
      x: center.x + direction.x * halfLength - normal.x * halfWidth,
      z: center.z + direction.z * halfLength - normal.z * halfWidth,
    },
    {
      x: center.x + direction.x * halfLength + normal.x * halfWidth,
      z: center.z + direction.z * halfLength + normal.z * halfWidth,
    },
    {
      x: center.x - direction.x * halfLength + normal.x * halfWidth,
      z: center.z - direction.z * halfLength + normal.z * halfWidth,
    },
  ];
};

/**
 * Добавляет цилиндр между двумя точками.
 * Применяется для поручней, балясин, центральной стойки и упрощенных косоуров.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа, куда добавляется цилиндр.
 * @param {THREE.Vector3} start - Начальная точка.
 * @param {THREE.Vector3} end - Конечная точка.
 * @param {number} radius - Радиус цилиндра в миллиметрах.
 * @param {THREE.Material} material - Материал цилиндра.
 * @returns {void}
 */
const addCylinderBetween = (THREE, group, start, end, radius, material) => {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();

  if (length <= 0) {
    return;
  }

  const geometry = new THREE.CylinderGeometry(radius, radius, length, 14);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
};

/**
 * Добавляет поручень с вертикальными балясинами по заданной линии.
 * Высота каждой балясины считается от соответствующей точки пути до уровня поручня.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {Array<{x: number, y: number, z: number}>} points - Точки линии ограждения на поверхности ступеней.
 * @param {number} railingHeight - Высота ограждения в миллиметрах.
 * @param {THREE.Material} material - Материал перил.
 * @returns {void}
 */
const addRailPath = (THREE, group, points, railingHeight, material) => {
  const topPoints = points.map((point) => new THREE.Vector3(point.x, point.y + railingHeight, point.z));

  points.forEach((point) => {
    addCylinderBetween(
      THREE,
      group,
      new THREE.Vector3(point.x, point.y, point.z),
      new THREE.Vector3(point.x, point.y + railingHeight, point.z),
      18,
      material,
    );
  });

  for (let index = 0; index < topPoints.length - 1; index += 1) {
    addCylinderBetween(THREE, group, topPoints[index], topPoints[index + 1], 28, material);
  }
};

/**
 * Возвращает высоту верхней плоскости ступени по ее порядковому номеру.
 * Индекс `0` соответствует первой физической ступени после нижнего пола.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {number} stepIndex - Индекс ступени.
 * @returns {number} Высота верхней плоскости ступени в миллиметрах.
 */
const getStepTopY = (geometry, stepIndex) => (stepIndex + 1) * geometry.riser;

/**
 * Добавляет прямой марш с прямоугольными ступенями.
 * Возвращает точку выхода и контрольные точки боковых ограждений для текущего марша.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} materials - Материалы модели.
 * @param {object} options - Параметры марша: старт, направление, количество ступеней, ширина и глубина.
 * @returns {object} Конечная точка марша и линии перил.
 */
const addFlight = (THREE, group, materials, options) => {
  const { direction, geometry, start, startIndex, steps, treadDepth, width } = options;
  const railLeft = [];
  const railRight = [];
  const normal = { x: -direction.z, z: direction.x };

  for (let index = 0; index < steps; index += 1) {
    const stepIndex = startIndex + index;
    const center = {
      x: start.x + direction.x * treadDepth * (index + 0.5),
      z: start.z + direction.z * treadDepth * (index + 0.5),
    };
    const footprint = createRectangleFootprint(center, direction, treadDepth, width);
    const tread = createFootprintPrism(THREE, footprint, getStepTopY(geometry, stepIndex), options.thickness, materials.tread);
    group.add(tread);

    if (index % 2 === 0 || index === steps - 1) {
      const y = getStepTopY(geometry, stepIndex);
      railLeft.push({ x: center.x + normal.x * width / 2, y, z: center.z + normal.z * width / 2 });
      railRight.push({ x: center.x - normal.x * width / 2, y, z: center.z - normal.z * width / 2 });
    }
  }

  const end = {
    x: start.x + direction.x * treadDepth * steps,
    z: start.z + direction.z * treadDepth * steps,
    stepIndex: startIndex + steps,
  };

  addCylinderBetween(
    THREE,
    group,
    new THREE.Vector3(start.x + normal.x * width / 2, 0, start.z + normal.z * width / 2),
    new THREE.Vector3(end.x + normal.x * width / 2, getStepTopY(geometry, Math.max(end.stepIndex - 1, 0)), end.z + normal.z * width / 2),
    Math.max(options.stringerThickness / 2, 16),
    materials.stringer,
  );
  addCylinderBetween(
    THREE,
    group,
    new THREE.Vector3(start.x - normal.x * width / 2, 0, start.z - normal.z * width / 2),
    new THREE.Vector3(end.x - normal.x * width / 2, getStepTopY(geometry, Math.max(end.stepIndex - 1, 0)), end.z - normal.z * width / 2),
    Math.max(options.stringerThickness / 2, 16),
    materials.stringer,
  );

  return { end, railLeft, railRight };
};

/**
 * Добавляет площадку между маршами.
 * Площадка строится как плита на высоте последней ступени предыдущего марша.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} materials - Материалы модели.
 * @param {object} options - Параметры площадки: центр, направление, размеры, высота и толщина.
 * @returns {void}
 */
const addLanding = (THREE, group, materials, options) => {
  const footprint = createRectangleFootprint(options.center, options.direction, options.length, options.width);
  group.add(createFootprintPrism(THREE, footprint, options.topY, options.thickness, materials.landing));
};

/**
 * Создает контур секторной ступени между двумя радиусами и углами.
 * Используется для винтовых и забежных лестниц.
 * @param {{x: number, z: number}} center - Центр дуги.
 * @param {number} innerRadius - Внутренний радиус ступени.
 * @param {number} outerRadius - Внешний радиус ступени.
 * @param {number} startAngle - Начальный угол в радианах.
 * @param {number} endAngle - Конечный угол в радианах.
 * @returns {Array<{x: number, z: number}>} Контур секторной ступени.
 */
const createSectorFootprint = (center, innerRadius, outerRadius, startAngle, endAngle) => [
  { x: center.x + Math.cos(startAngle) * innerRadius, z: center.z + Math.sin(startAngle) * innerRadius },
  { x: center.x + Math.cos(startAngle) * outerRadius, z: center.z + Math.sin(startAngle) * outerRadius },
  { x: center.x + Math.cos(endAngle) * outerRadius, z: center.z + Math.sin(endAngle) * outerRadius },
  { x: center.x + Math.cos(endAngle) * innerRadius, z: center.z + Math.sin(endAngle) * innerRadius },
];

/**
 * Добавляет винтовую лестницу с центральной стойкой и наружными перилами.
 * Каждая ступень создается как отдельный сектор на своей высоте.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {object} materials - Материалы модели.
 * @returns {void}
 */
const buildSpiralStair = (THREE, group, form, geometry, materials) => {
  const center = { x: 0, z: 0 };
  const stepAngle = geometry.spiralStepAngleDeg * Math.PI / 180;
  const railPoints = [];

  for (let index = 0; index < geometry.safeSteps; index += 1) {
    const startAngle = index * stepAngle;
    const endAngle = startAngle + stepAngle * 0.88;
    const footprint = createSectorFootprint(center, geometry.innerRadius, geometry.outerRadius, startAngle, endAngle);
    group.add(createFootprintPrism(THREE, footprint, getStepTopY(geometry, index), form.treadThickness, materials.tread));

    if (index % 2 === 0 || index === geometry.safeSteps - 1) {
      const angle = startAngle + stepAngle / 2;
      railPoints.push({
        x: Math.cos(angle) * geometry.outerRadius,
        y: getStepTopY(geometry, index),
        z: Math.sin(angle) * geometry.outerRadius,
      });
    }
  }

  addCylinderBetween(
    THREE,
    group,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, form.height + form.railingHeight, 0),
    Math.max(form.innerRadius * 0.32, form.stringerThickness),
    materials.stringer,
  );
  addRailPath(THREE, group, railPoints, form.railingHeight, materials.rail);
};

/**
 * Добавляет забежный поворот как набор секторных ступеней.
 * Возвращает точки наружного ограждения для последующего объединения с перилами маршей.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} materials - Материалы модели.
 * @param {object} options - Геометрия поворота: центр, радиусы, углы, количество ступеней и начальный индекс.
 * @returns {Array<{x: number, y: number, z: number}>} Точки наружных перил на повороте.
 */
const addWinderTurn = (THREE, group, materials, options) => {
  const railPoints = [];

  for (let index = 0; index < options.steps; index += 1) {
    const startAngle = options.startAngle + options.stepAngle * index;
    const endAngle = options.startAngle + options.stepAngle * (index + 1);
    const stepIndex = options.startIndex + index;
    const footprint = createSectorFootprint(options.center, options.innerRadius, options.outerRadius, startAngle, endAngle);
    group.add(createFootprintPrism(THREE, footprint, getStepTopY(options.geometry, stepIndex), options.thickness, materials.tread));

    const middleAngle = (startAngle + endAngle) / 2;
    railPoints.push({
      x: options.center.x + Math.cos(middleAngle) * options.outerRadius,
      y: getStepTopY(options.geometry, stepIndex),
      z: options.center.z + Math.sin(middleAngle) * options.outerRadius,
    });
  }

  return railPoints;
};

/**
 * Строит прямую одномаршевую 3D-лестницу.
 * Добавляет ступени, две тетивы и ограждение по обеим сторонам.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {object} materials - Материалы модели.
 * @returns {void}
 */
const buildStraightStair = (THREE, group, form, geometry, materials) => {
  const flight = addFlight(THREE, group, materials, {
    direction: { x: 1, z: 0 },
    geometry,
    start: { x: 0, z: 0 },
    startIndex: 0,
    steps: geometry.safeSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth: geometry.flightLength / geometry.safeSteps,
    width: form.flightWidth,
  });

  addRailPath(THREE, group, flight.railLeft, form.railingHeight, materials.rail);
  addRailPath(THREE, group, flight.railRight, form.railingHeight, materials.rail);
};

/**
 * Строит Г- или П-образную лестницу с площадками.
 * Марши соединяются плитами площадок, а ограждение идет по внешним краям.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {object} materials - Материалы модели.
 * @returns {void}
 */
const buildPlatformStair = (THREE, group, form, geometry, materials) => {
  const width = form.flightWidth;
  const treadDepth = Math.max(geometry.tread, 180);
  const first = addFlight(THREE, group, materials, {
    direction: { x: 1, z: 0 },
    geometry,
    start: { x: 0, z: 0 },
    startIndex: 0,
    steps: geometry.firstFlightSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });
  const firstLandingCenter = { x: first.end.x + geometry.landingLength / 2, z: 0 };
  addLanding(THREE, group, materials, {
    center: firstLandingCenter,
    direction: { x: 1, z: 0 },
    length: geometry.landingLength,
    thickness: form.treadThickness,
    topY: getStepTopY(geometry, Math.max(first.end.stepIndex - 1, 0)),
    width,
  });

  const secondDirection = form.shape === 'u-platform' ? { x: 0, z: 1 } : { x: 0, z: 1 };
  const second = addFlight(THREE, group, materials, {
    direction: secondDirection,
    geometry,
    start: { x: first.end.x + geometry.landingLength, z: 0 },
    startIndex: first.end.stepIndex,
    steps: geometry.secondFlightSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });

  addRailPath(THREE, group, [...first.railLeft, ...second.railLeft], form.railingHeight, materials.rail);

  if (form.shape !== 'u-platform') {
    addRailPath(THREE, group, [...first.railRight, ...second.railRight], form.railingHeight, materials.rail);
    return;
  }

  const secondLandingCenter = { x: second.end.x - geometry.landingLength / 2, z: second.end.z + width / 2 };
  addLanding(THREE, group, materials, {
    center: secondLandingCenter,
    direction: { x: 1, z: 0 },
    length: geometry.landingLength,
    thickness: form.treadThickness,
    topY: getStepTopY(geometry, Math.max(second.end.stepIndex - 1, 0)),
    width,
  });

  const third = addFlight(THREE, group, materials, {
    direction: { x: -1, z: 0 },
    geometry,
    start: { x: second.end.x, z: second.end.z + width },
    startIndex: second.end.stepIndex,
    steps: geometry.thirdFlightSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });
  addRailPath(THREE, group, [...second.railRight, ...third.railRight], form.railingHeight, materials.rail);
};

/**
 * Строит лестницу с забежными ступенями для 90°, 180°, Г- и П-образных схем.
 * Прямые марши отображаются прямоугольными ступенями, повороты - секторными ступенями.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {object} materials - Материалы модели.
 * @returns {void}
 */
const buildWinderStair = (THREE, group, form, geometry, materials) => {
  const width = form.flightWidth;
  const straightSteps = Math.max(geometry.safeSteps - geometry.winderSteps, 0);
  const firstStraightSteps = form.shape === 'u-winder' ? Math.floor(straightSteps / 3) : Math.floor(straightSteps / 2);
  const treadDepth = Math.max(geometry.activeTread, 180);
  const first = addFlight(THREE, group, materials, {
    direction: { x: 1, z: 0 },
    geometry,
    start: { x: 0, z: 0 },
    startIndex: 0,
    steps: firstStraightSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });
  const firstTurnSteps = form.shape === 'u-winder'
    ? Math.max(Number(form.firstTurnWinderSteps), 3)
    : form.shape === 'winder-180'
      ? Math.ceil(geometry.winderSteps / 2)
      : geometry.winderSteps;
  const firstTurnRail = addWinderTurn(THREE, group, materials, {
    center: { x: first.end.x, z: geometry.winderInnerRadius },
    geometry,
    innerRadius: geometry.winderInnerRadius,
    outerRadius: geometry.winderOuterRadius,
    startAngle: -Math.PI / 2,
    startIndex: first.end.stepIndex,
    stepAngle: Math.PI / 2 / firstTurnSteps,
    steps: firstTurnSteps,
    thickness: form.treadThickness,
  });
  const afterFirstTurnIndex = first.end.stepIndex + firstTurnSteps;
  const afterTurnStart = { x: first.end.x + geometry.winderInnerRadius, z: geometry.winderInnerRadius };

  if (form.shape === 'winder-90') {
    addRailPath(THREE, group, first.railRight, form.railingHeight, materials.rail);
    addRailPath(THREE, group, firstTurnRail, form.railingHeight, materials.rail);
    return;
  }

  const middleSteps = form.shape === 'u-winder'
    ? Math.floor((straightSteps - firstStraightSteps) / 2)
    : Math.max(straightSteps - firstStraightSteps, 0);
  const second = addFlight(THREE, group, materials, {
    direction: { x: 0, z: 1 },
    geometry,
    start: afterTurnStart,
    startIndex: afterFirstTurnIndex,
    steps: middleSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });

  if (form.shape !== 'u-winder' && form.shape !== 'winder-180') {
    addRailPath(THREE, group, first.railRight, form.railingHeight, materials.rail);
    addRailPath(THREE, group, firstTurnRail, form.railingHeight, materials.rail);
    addRailPath(THREE, group, second.railLeft, form.railingHeight, materials.rail);
    return;
  }

  const secondTurnSteps = form.shape === 'u-winder'
    ? Math.max(Number(form.secondTurnWinderSteps), 3)
    : Math.max(geometry.winderSteps - firstTurnSteps, 3);
  const secondTurnRail = addWinderTurn(THREE, group, materials, {
    center: { x: second.end.x - geometry.winderInnerRadius, z: second.end.z },
    geometry,
    innerRadius: geometry.winderInnerRadius,
    outerRadius: geometry.winderOuterRadius,
    startAngle: 0,
    startIndex: second.end.stepIndex,
    stepAngle: Math.PI / 2 / secondTurnSteps,
    steps: secondTurnSteps,
    thickness: form.treadThickness,
  });
  const thirdSteps = Math.max(geometry.safeSteps - second.end.stepIndex - secondTurnSteps, 0);
  const third = addFlight(THREE, group, materials, {
    direction: { x: -1, z: 0 },
    geometry,
    start: { x: second.end.x - geometry.winderInnerRadius, z: second.end.z + geometry.winderInnerRadius },
    startIndex: second.end.stepIndex + secondTurnSteps,
    steps: thirdSteps,
    stringerThickness: form.stringerThickness,
    thickness: form.treadThickness,
    treadDepth,
    width,
  });
  addRailPath(THREE, group, first.railRight, form.railingHeight, materials.rail);
  addRailPath(THREE, group, firstTurnRail, form.railingHeight, materials.rail);
  addRailPath(THREE, group, second.railLeft, form.railingHeight, materials.rail);
  addRailPath(THREE, group, secondTurnRail, form.railingHeight, materials.rail);
  addRailPath(THREE, group, third.railRight, form.railingHeight, materials.rail);
};

/**
 * Строит 3D-модель лестницы выбранной формы.
 * Функция не меняет входные параметры, а только добавляет объекты в переданную группу.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Group} group - Группа модели лестницы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия лестницы.
 * @param {object} materials - Материалы модели.
 * @returns {void}
 */
const buildStairModel = (THREE, group, form, geometry, materials) => {
  if (form.shape === 'spiral') {
    buildSpiralStair(THREE, group, form, geometry, materials);
    return;
  }

  if (form.shape === 'straight') {
    buildStraightStair(THREE, group, form, geometry, materials);
    return;
  }

  if (form.shape.includes('platform')) {
    buildPlatformStair(THREE, group, form, geometry, materials);
    return;
  }

  buildWinderStair(THREE, group, form, geometry, materials);
};

/**
 * Центрирует объект в сцене и возвращает его габариты.
 * После центрирования камера может смотреть в начало координат независимо от формы лестницы.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.Object3D} object - Объект, который нужно центрировать.
 * @returns {{box: THREE.Box3, size: THREE.Vector3, center: THREE.Vector3}} Габариты объекта до смещения.
 */
const centerObject = (THREE, object) => {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);

  return { box, center, size };
};

/**
 * Выставляет камеру в изометрический вид с учетом размера модели.
 * OrbitControls получает цель в центре сцены, поэтому вращение идет вокруг лестницы.
 * @param {object} THREE - Глобальный объект Three.js.
 * @param {THREE.PerspectiveCamera} camera - Камера сцены.
 * @param {THREE.OrbitControls} controls - Контролы вращения.
 * @param {THREE.Vector3} size - Размер модели в единицах Three.js.
 * @returns {void}
 */
const resetCamera = (THREE, camera, controls, size) => {
  const radius = Math.max(size.x, size.y, size.z, 8);
  const distance = radius * CAMERA_DISTANCE_MULTIPLIER;
  camera.position.set(distance, distance * 0.75, distance);
  camera.near = 0.1;
  camera.far = Math.max(distance * 8, 1000);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.update();
};

/**
 * React-компонент 3D-визуализации лестницы.
 * Создает Three.js-сцену через CDN, пересобирает модель при изменении параметров и дает управление камерой.
 * @param {{form: object, geometry: object}} props - Текущие значения формы и рассчитанная геометрия лестницы.
 * @returns {JSX.Element} Контейнер 3D-сцены с кнопками управления.
 */
const Staircase3D = ({ form, geometry }) => {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const resetViewRef = useRef(null);

  useEffect(() => {
    const THREE = getThree();
    const container = containerRef.current;

    if (!THREE || !container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    const model = new THREE.Group();
    const materials = createMaterials(THREE, form.material);
    scene.background = new THREE.Color(0xf5f5f5);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.86);
    directionalLight.position.set(3, 5, 4);
    scene.add(directionalLight);
    scene.add(model);
    container.appendChild(renderer.domElement);

    buildStairModel(THREE, model, form, geometry, materials);
    model.scale.setScalar(MODEL_SCALE);
    const { size } = centerObject(THREE, model);

    /**
     * Подгоняет renderer под текущий размер контейнера.
     * Вызывается на старте и при resize, чтобы canvas не растягивался CSS-ом.
     * @returns {void}
     */
    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    /**
     * Возвращает камеру в исходную изометрическую позицию.
     * Кнопка сброса использует эту же функцию без пересоздания сцены.
     * @returns {void}
     */
    const handleResetView = () => resetCamera(THREE, camera, controls, size);

    /**
     * Запускает render-loop с демпфированием OrbitControls.
     * Цикл останавливается флагом cleanup при размонтировании компонента.
     * @returns {void}
     */
    let isMounted = true;
    const handleAnimate = () => {
      if (!isMounted) {
        return;
      }

      controls.update();
      renderer.render(scene, camera);
      window.requestAnimationFrame(handleAnimate);
    };

    handleResize();
    handleResetView();
    handleAnimate();
    resetViewRef.current = handleResetView;
    viewRef.current = renderer;
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      viewRef.current = null;
      resetViewRef.current = null;
    };
  }, [form, geometry]);

  /**
   * Обрабатывает нажатие кнопки сброса камеры.
   * Вызов безопасен до инициализации сцены, потому что ref может быть пустым.
   * @returns {void}
   */
  const handleResetClick = () => {
    resetViewRef.current?.();
  };

  /**
   * Скачивает текущий кадр WebGL-canvas как PNG.
   * Использует `preserveDrawingBuffer`, чтобы изображение было доступно после рендера.
   * @returns {void}
   */
  const handleDownloadClick = () => {
    const renderer = viewRef.current;

    if (!renderer) {
      return;
    }

    const link = document.createElement('a');
    link.href = renderer.domElement.toDataURL('image/png');
    link.download = 'staircase-3d.png';
    link.click();
  };

  return (
    <article className="card drawing drawing--3d">
      <div className="drawing__header">
        <h2>3D-визуализация</h2>
        <div className="drawing__actions">
          <button className="button" onClick={handleResetClick} type="button">Сбросить вид</button>
          <button className="button button--primary" onClick={handleDownloadClick} type="button">Скачать скриншот</button>
        </div>
      </div>
      <div ref={containerRef} className="stair-3d" aria-label="Интерактивная 3D-модель лестницы" />
    </article>
  );
};

export default Staircase3D;
