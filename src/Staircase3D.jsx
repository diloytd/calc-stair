import { OrbitControls, Text } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getFlightPlatformStartAlong, getFlightVisibleStepCount, layoutStairComponents } from './stairLayout.js';

const MODEL_SCALE = 0.01;
const MATERIAL_COLORS = {
  wood: '#b77938',
  steel: '#94a3b8',
  concrete: '#b8b8b8',
};

/**
 * Возвращает цвет и физические свойства материала для 3D-ступеней.
 * Цвет зависит от выбранного материала лестницы в форме калькулятора.
 * @param {string} material - Идентификатор материала: `wood`, `steel` или `concrete`.
 * @returns {{color: string, roughness: number, metalness: number}} Параметры `meshStandardMaterial`.
 */
const getMaterialProps = (material) => ({
  color: MATERIAL_COLORS[material] ?? MATERIAL_COLORS.wood,
  roughness: material === 'steel' ? 0.38 : 0.72,
  metalness: material === 'steel' ? 0.55 : 0.04,
});

/**
 * Создает BufferGeometry секторной ступени с верхней и нижней плоскостью.
 * Нужна для винтовых и забежных блоков, где ступени имеют трапециевидный контур.
 * @param {object} params - Параметры секторной призмы.
 * @param {number} params.innerRadius - Внутренний радиус сектора.
 * @param {number} params.outerRadius - Внешний радиус сектора.
 * @param {number} params.startAngle - Начальный угол сектора в радианах.
 * @param {number} params.endAngle - Конечный угол сектора в радианах.
 * @param {number} params.topY - Высота верхней плоскости.
 * @param {number} params.thickness - Толщина ступени вниз от верхней плоскости.
 * @returns {THREE.BufferGeometry} Геометрия трапециевидной ступени.
 */
const createSectorStepGeometry = ({ innerRadius, outerRadius, startAngle, endAngle, topY, thickness }) => {
  const bottomY = topY - thickness;
  const points = [
    { x: Math.cos(startAngle) * innerRadius, z: Math.sin(startAngle) * innerRadius },
    { x: Math.cos(startAngle) * outerRadius, z: Math.sin(startAngle) * outerRadius },
    { x: Math.cos(endAngle) * outerRadius, z: Math.sin(endAngle) * outerRadius },
    { x: Math.cos(endAngle) * innerRadius, z: Math.sin(endAngle) * innerRadius },
  ];
  const vertices = [];
  const indices = [];

  points.forEach((point) => vertices.push(point.x, bottomY, point.z));
  points.forEach((point) => vertices.push(point.x, topY, point.z));

  indices.push(0, 1, 2, 0, 2, 3);
  indices.push(4, 6, 5, 4, 7, 6);

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    indices.push(index, nextIndex, nextIndex + points.length);
    indices.push(index, nextIndex + points.length, index + points.length);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

/**
 * Возвращает единичный вектор направления марша на плане.
 * Совпадает с расчётом в `stairLayout.js`.
 * @param {number} angleDeg - Угол поворота марша в градусах.
 * @returns {{x: number, z: number}} Направление движения по лестнице.
 */
const getMarchDirection = (angleDeg) => {
  const radians = THREE.MathUtils.degToRad(angleDeg);

  return {
    x: Math.cos(radians),
    z: Math.sin(radians),
  };
};

/**
 * Возвращает длину марша внутри блока `flight` до поворотной площадки.
 * Совпадает с `getLayoutMarchLength` в `stairLayout.js`, чтобы 3D-рендер и layout использовали одну геометрию.
 * @param {object} component - Компонент `flight`.
 * @returns {number} Длина марша в миллиметрах.
 */
const getFlightMarchLength = (component) => {
  if (component.steps <= 0) {
    return 0;
  }

  if (Number.isFinite(component.anchorMarchLength)) {
    return component.anchorMarchLength;
  }

  const layoutSteps = component.platform && component.steps > 0
    ? Math.max(component.steps - 1, 0)
    : component.steps;

  return layoutSteps * component.treadDepth;
};

/**
 * Рисует метки сторон 1–4 на верхней поверхности прямоугольной площадки.
 * В локальной СК блока: 1 — ближний край (min X), 2 — правый (+Z), 3 — дальний (+X), 4 — левый (−Z).
 * @param {object} props - Свойства меток.
 * @param {number} props.centerX - Центр площадки по локальной оси X в миллиметрах.
 * @param {number} props.centerZ - Центр площадки по локальной оси Z в миллиметрах.
 * @param {number} props.length - Длина площадки вдоль локальной оси X в миллиметрах.
 * @param {number} props.width - Ширина площадки вдоль локальной оси Z в миллиметрах.
 * @param {number} props.topY - Y верхней поверхности площадки в миллиметрах.
 * @returns {JSX.Element} Четыре текстовые метки на краях площадки.
 */
const PlatformSideLabels = ({ centerX, centerZ, length, width, topY }) => {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  const minX = centerX - halfLength;
  const maxX = centerX + halfLength;
  const minZ = centerZ - halfWidth;
  const maxZ = centerZ + halfWidth;
  const inset = Math.min(Math.max(length, width) * 0.12, 120);
  const labelY = topY + 4;
  const fontSize = Math.min(Math.max(length, width) * 0.22, 180);
  const sides = [
    { label: '1', position: [minX + inset, labelY, centerZ], rotation: [-Math.PI / 2, 0, Math.PI] },
    { label: '2', position: [centerX, labelY, maxZ - inset], rotation: [-Math.PI / 2, 0, Math.PI / 2] },
    { label: '3', position: [maxX - inset, labelY, centerZ], rotation: [-Math.PI / 2, 0, 0] },
    { label: '4', position: [centerX, labelY, minZ + inset], rotation: [-Math.PI / 2, 0, -Math.PI / 2] },
  ];

  return sides.map(({ label, position, rotation }) => (
    <Text
      anchorX="center"
      anchorY="middle"
      color="#b91c1c"
      fontSize={fontSize}
      key={label}
      outlineColor="#ffffff"
      outlineWidth={fontSize * 0.04}
      position={position}
      rotation={rotation}
    >
      {label}
    </Text>
  ));
};

/**
 * Рендерит один прямой марш прямоугольными ступенями под углом сборки.
 * @param {object} props - Свойства марша.
 * @param {object} props.component - Конфигурация компонента `march`.
 * @param {{x: number, y: number, z: number}} props.position - Позиция начала марша.
 * @param {number} props.angleY - Угол поворота марша в градусах.
 * @param {number} props.startStepIndex - Индекс первой ступени в общей лестнице.
 * @param {object} props.materialProps - Параметры материала ступеней.
 * @returns {JSX.Element} Группа ступеней марша.
 */
const March = ({ component, position, angleY, startStepIndex, materialProps }) => {
  const steps = Array.from({ length: component.steps }, (_, index) => index);
  const direction = getMarchDirection(angleY);
  const stepRotation = THREE.MathUtils.degToRad(-angleY);

  return (
    <group position={[position.x, position.y, position.z]}>
      {steps.map((stepIndex) => {
        const topY = (startStepIndex + stepIndex + 1) * component.riser;
        const runOffset = component.treadDepth * (stepIndex + 0.5);

        return (
          <mesh
            castShadow
            key={stepIndex}
            position={[
              direction.x * runOffset,
              topY - component.thickness / 2,
              direction.z * runOffset,
            ]}
            rotation={[0, stepRotation, 0]}
            receiveShadow
          >
            <boxGeometry args={[component.treadDepth, component.thickness, component.width]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      })}
    </group>
  );
};

/**
 * Рендерит блок «марш + площадка» в одной локальной группе.
 * Площадка заменяет последнюю ступень марша и начинается сразу за предпоследней.
 * @param {object} props - Свойства блока.
 * @param {object} props.component - Конфигурация компонента `flight`.
 * @param {{x: number, y: number, z: number}} props.position - Позиция начала блока.
 * @param {number} props.angleY - Угол поворота блока в градусах.
 * @param {number} props.startStepIndex - Индекс первой ступени блока в общей лестнице.
 * @param {object} props.materialProps - Параметры материала ступеней.
 * @returns {JSX.Element} Группа ступеней и площадки.
 */
const FlightBlock = ({ component, position, angleY, startStepIndex, materialProps }) => {
  const platform = component.platform;
  const visibleStepCount = getFlightVisibleStepCount(component);
  const steps = Array.from({ length: visibleStepCount }, (_, index) => index);
  const blockRotation = THREE.MathUtils.degToRad(-angleY);
  const platformTopY = component.steps > 0
    ? (startStepIndex + component.steps) * component.riser
    : startStepIndex * component.riser;
  const platformOffset = component.platformOffset ?? { x: 0, z: 0 };
  const platformLengthTotal = platform ? platform.length : 0;
  const platformStartAlong = platform ? getFlightPlatformStartAlong(component, visibleStepCount) : 0;
  const platformCenterX = platformStartAlong + platformLengthTotal / 2 + platformOffset.x;
  const platformCenterZ = platformOffset.z;

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, blockRotation, 0]}>
      {steps.map((stepIndex) => {
        const topY = (startStepIndex + stepIndex + 1) * component.riser;

        return (
          <mesh
            castShadow
            key={stepIndex}
            position={[
              component.treadDepth * (stepIndex + 0.5),
              topY - component.thickness / 2,
              0,
            ]}
            receiveShadow
          >
            <boxGeometry args={[component.treadDepth, component.thickness, component.width]} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        );
      })}
      {platform && (
        <>
          <mesh
            castShadow
            position={[
              platformCenterX,
              platformTopY - platform.thickness / 2,
              platformCenterZ,
            ]}
            receiveShadow
          >
            <boxGeometry args={[platformLengthTotal, platform.thickness, platform.width]} />
            <meshStandardMaterial color="#dbeafe" roughness={0.72} metalness={0.05} />
          </mesh>
          <PlatformSideLabels
            centerX={platformCenterX}
            centerZ={platformCenterZ}
            length={platformLengthTotal}
            topY={platformTopY}
            width={platform.width}
          />
        </>
      )}
    </group>
  );
};

/**
 * Рендерит горизонтальную площадку на высоте текущего марша.
 * @param {object} props - Свойства площадки.
 * @param {object} props.component - Конфигурация компонента `platform`.
 * @param {{x: number, y: number, z: number}} props.position - Позиция начала площадки.
 * @param {number} props.angleY - Угол поворота площадки в градусах.
 * @param {number} props.startStepIndex - Индекс текущего уровня лестницы.
 * @returns {JSX.Element} Mesh площадки.
 */
const Platform = ({ component, position, angleY, topStepIndex }) => {
  const topY = (topStepIndex + 1) * component.riser;
  const direction = getMarchDirection(angleY);
  const platformRotation = THREE.MathUtils.degToRad(-angleY);
  const meshCenterX = direction.x * (component.length / 2);
  const meshCenterZ = direction.z * (component.length / 2);
  const meshCenterY = topY - component.thickness / 2;

  return (
    <group position={[position.x, position.y, position.z]}>
      <group position={[meshCenterX, meshCenterY, meshCenterZ]} rotation={[0, platformRotation, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[component.length, component.thickness, component.width]} />
          <meshStandardMaterial color="#dbeafe" roughness={0.72} metalness={0.05} />
        </mesh>
        <PlatformSideLabels
          centerX={0}
          centerZ={0}
          length={component.length}
          topY={component.thickness / 2}
          width={component.width}
        />
      </group>
    </group>
  );
};

/**
 * Рендерит одну трапециевидную ступень дугового блока.
 * @param {object} props - Свойства секторной ступени.
 * @param {object} props.component - Конфигурация компонента `spiral`.
 * @param {number} props.stepIndex - Индекс ступени внутри блока.
 * @param {number} props.startStepIndex - Индекс первой ступени блока в общей лестнице.
 * @param {object} props.materialProps - Параметры материала ступеней.
 * @returns {JSX.Element} Mesh секторной ступени.
 */
const SpiralStep = ({ component, stepIndex, startStepIndex, materialProps }) => {
  const geometry = useMemo(() => {
    const stepAngle = THREE.MathUtils.degToRad(component.turnAngle / Math.max(component.steps, 1));
    const baseAngle = THREE.MathUtils.degToRad(component.startAngleDeg ?? 0);
    const startAngle = baseAngle + stepIndex * stepAngle;
    const endAngle = startAngle + stepAngle * 0.9;
    const topY = (startStepIndex + stepIndex + 1) * component.riser;

    return createSectorStepGeometry({
      endAngle,
      innerRadius: component.innerRadius,
      outerRadius: component.outerRadius,
      startAngle,
      thickness: component.thickness,
      topY,
    });
  }, [component, startStepIndex, stepIndex]);

  return (
    <mesh castShadow geometry={geometry} receiveShadow>
      <meshStandardMaterial {...materialProps} />
    </mesh>
  );
};

/**
 * Рендерит винтовой или забежный блок как набор трапециевидных ступеней по дуге.
 * @param {object} props - Свойства дугового блока.
 * @param {object} props.component - Конфигурация компонента `spiral`.
 * @param {{x: number, y: number, z: number}} props.position - Позиция центра дугового блока.
 * @param {number} props.angleY - Угол поворота блока в градусах.
 * @param {number} props.startStepIndex - Индекс первой ступени блока в общей лестнице.
 * @param {object} props.materialProps - Параметры материала ступеней.
 * @returns {JSX.Element} Группа трапециевидных ступеней.
 */
const SpiralBlock = ({ component, position, angleY, startStepIndex, materialProps }) => {
  const steps = Array.from({ length: component.steps }, (_, index) => index);

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, -THREE.MathUtils.degToRad(angleY), 0]}>
      {steps.map((stepIndex) => (
        <SpiralStep
          component={component}
          key={stepIndex}
          materialProps={materialProps}
          startStepIndex={startStepIndex}
          stepIndex={stepIndex}
        />
      ))}
    </group>
  );
};

/**
 * Преобразует точку плана из локальных координат компонента в мировые X/Z.
 * Использует те же векторы направления и нормали, что и `stairLayout.js`.
 * @param {{along: number, across: number}} point - Локальная точка: вдоль марша и поперёк.
 * @param {{x: number, y: number, z: number}} position - Позиция группы компонента.
 * @param {number} angleY - Угол поворота компонента в градусах.
 * @returns {{x: number, z: number}} Мировые координаты точки на плане.
 */
const transformPlanPoint = (point, position, angleY) => {
  const direction = getMarchDirection(angleY);
  const normal = {
    x: -direction.z,
    z: direction.x,
  };

  return {
    x: position.x + direction.x * point.along + normal.x * point.across,
    z: position.z + direction.z * point.along + normal.z * point.across,
  };
};

/**
 * Расширяет прямоугольные границы лестницы на плане одной точкой.
 * @param {{minX: number, maxX: number, minZ: number, maxZ: number}} bounds - Текущие границы.
 * @param {{x: number, z: number}} point - Точка на плане.
 * @returns {void}
 */
const expandPlanBounds = (bounds, point) => {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.minZ = Math.min(bounds.minZ, point.z);
  bounds.maxZ = Math.max(bounds.maxZ, point.z);
};

/**
 * Возвращает границы прямого марша на плане с учётом поворота группы.
 * @param {object} component - Компонент `march`.
 * @param {{x: number, y: number, z: number}} position - Позиция группы марша.
 * @param {number} angleY - Угол поворота марша в градусах.
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Границы марша.
 */
const getMarchPlanBounds = (component, position, angleY) => {
  const length = component.treadDepth * component.steps;
  const halfWidth = component.width / 2;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  const corners = [
    { along: 0, across: -halfWidth },
    { along: length, across: -halfWidth },
    { along: 0, across: halfWidth },
    { along: length, across: halfWidth },
  ];

  corners.forEach((corner) => {
    expandPlanBounds(bounds, transformPlanPoint(corner, position, angleY));
  });

  return bounds;
};

/**
 * Возвращает границы площадки на плане с учётом поворота группы.
 * @param {object} component - Компонент `platform`.
 * @param {{x: number, y: number, z: number}} position - Позиция начала площадки.
 * @param {number} angleY - Угол поворота площадки в градусах.
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Границы площадки.
 */
const getPlatformPlanBounds = (component, position, angleY) => {
  const halfWidth = component.width / 2;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  const corners = [
    { along: 0, across: -halfWidth },
    { along: component.length, across: -halfWidth },
    { along: 0, across: halfWidth },
    { along: component.length, across: halfWidth },
  ];

  corners.forEach((corner) => {
    expandPlanBounds(bounds, transformPlanPoint(corner, position, angleY));
  });

  return bounds;
};

/**
 * Возвращает границы блока `flight` на плане с учётом поворота группы.
 * @param {object} component - Компонент `flight`.
 * @param {{x: number, y: number, z: number}} position - Позиция группы.
 * @param {number} angleY - Угол поворота блока в градусах.
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Границы блока.
 */
const getFlightPlanBounds = (component, position, angleY) => {
  const marchLength = getFlightMarchLength(component);
  const platformLength = component.platform?.length ?? 0;
  const totalLength = marchLength + platformLength;
  const halfMarchWidth = component.width / 2;
  const halfPlatformWidth = (component.platform?.width ?? component.width) / 2;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
  const platformOffset = component.platformOffset ?? { x: 0, z: 0 };
  const corners = [
    { along: 0, across: -halfMarchWidth },
    { along: marchLength, across: -halfMarchWidth },
    { along: marchLength, across: halfMarchWidth },
    { along: totalLength, across: -halfPlatformWidth + platformOffset.z },
    { along: totalLength, across: halfPlatformWidth + platformOffset.z },
  ];

  corners.forEach((corner) => {
    expandPlanBounds(bounds, transformPlanPoint(corner, position, angleY));
  });

  return bounds;
};

/**
 * Смещает всю лестницу так, чтобы её центр оказался в начале координат сцены.
 * @param {Array<object>} components - Компоненты с рассчитанными позициями.
 * @returns {{components: Array<object>, offset: {x: number, y: number, z: number}}} Смещённые компоненты и offset.
 */
const centerComponents = (components) => {
  if (!components.length) {
    return { components, offset: { x: 0, y: 0, z: 0 } };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxY = 0;

  components.forEach((component) => {
    const { position, angleY = 0 } = component;
    let planBounds = null;

    if (component.type === 'flight') {
      planBounds = getFlightPlanBounds(component, position, angleY);
      maxY = Math.max(maxY, (component.startStepIndex + component.steps) * component.riser);
    }

    if (component.type === 'march') {
      planBounds = getMarchPlanBounds(component, position, angleY);
      maxY = Math.max(maxY, (component.startStepIndex + component.steps) * component.riser);
    }

    if (component.type === 'platform') {
      planBounds = getPlatformPlanBounds(component, position, angleY);
      maxY = Math.max(maxY, (component.topStepIndex + 1) * component.riser);
    }

    if (component.type === 'spiral') {
      const radius = component.outerRadius;
      planBounds = {
        minX: position.x - radius,
        maxX: position.x + radius,
        minZ: position.z - radius,
        maxZ: position.z + radius,
      };
      maxY = Math.max(maxY, (component.startStepIndex + component.steps) * component.riser);
    }

    if (!planBounds) {
      return;
    }

    minX = Math.min(minX, planBounds.minX);
    maxX = Math.max(maxX, planBounds.maxX);
    minZ = Math.min(minZ, planBounds.minZ);
    maxZ = Math.max(maxZ, planBounds.maxZ);
  });

  const offset = {
    x: -(minX + maxX) / 2,
    y: 0,
    z: -(minZ + maxZ) / 2,
  };

  return {
    components: components.map((component) => ({
      ...component,
      position: {
        x: component.position.x + offset.x,
        y: component.position.y,
        z: component.position.z + offset.z,
      },
    })),
    maxY,
    offset,
  };
};

/**
 * Собирает итоговую группу лестницы из компонентной JSON-конфигурации.
 * Каждый дочерний компонент получает рассчитанные `position`, `angleY` и индекс высоты.
 * @param {object} props - Свойства сборщика.
 * @param {Array<object>} props.components - Массив компонентов лестницы.
 * @param {string} props.material - Выбранный материал лестницы.
 * @returns {JSX.Element} Масштабированная группа 3D-лестницы.
 */
const StairAssembly = ({ components, material, onBoundsChange }) => {
  const materialProps = useMemo(() => getMaterialProps(material), [material]);
  const centeredAssembly = useMemo(() => centerComponents(layoutStairComponents(components)), [components]);
  const resolvedComponents = centeredAssembly.components;

  useEffect(() => {
    onBoundsChange?.(centeredAssembly.maxY);
  }, [centeredAssembly.maxY, onBoundsChange]);

  return (
    <group scale={MODEL_SCALE}>
      {resolvedComponents.map((component, index) => {
        if (component.type === 'flight') {
          return (
            <FlightBlock
              angleY={component.angleY}
              component={component}
              key={`${component.type}-${index}`}
              materialProps={materialProps}
              position={component.position}
              startStepIndex={component.startStepIndex}
            />
          );
        }

        if (component.type === 'march') {
          return (
            <March
              angleY={component.angleY}
              component={component}
              key={`${component.type}-${index}`}
              materialProps={materialProps}
              position={component.position}
              startStepIndex={component.startStepIndex}
            />
          );
        }

        if (component.type === 'platform') {
          return (
            <Platform
              angleY={component.angleY}
              component={component}
              key={`${component.type}-${index}`}
              position={component.position}
              topStepIndex={component.topStepIndex ?? Math.max(component.startStepIndex - 1, 0)}
            />
          );
        }

        return (
          <SpiralBlock
            angleY={component.angleY}
            component={component}
            key={`${component.type}-${index}`}
            materialProps={materialProps}
            position={component.position}
            startStepIndex={component.startStepIndex}
          />
        );
      })}
    </group>
  );
};

/**
 * Синхронизирует renderer и функцию сброса камеры с внешними кнопками панели.
 * @param {object} props - Свойства контролов сцены.
 * @param {React.MutableRefObject<THREE.WebGLRenderer|null>} props.rendererRef - Ref текущего renderer.
 * @param {React.MutableRefObject<Function|null>} props.resetViewRef - Ref обработчика сброса камеры.
 * @returns {JSX.Element} OrbitControls для вращения модели.
 */
const SceneControls = ({ maxModelHeight, rendererRef, resetViewRef }) => {
  const controlsRef = useRef(null);
  const { camera, gl } = useThree();

  useEffect(() => {
    rendererRef.current = gl;

    /**
     * Возвращает камеру к базовому изометрическому виду.
     * Используется кнопкой "Сбросить вид" без пересоздания Canvas.
     * @returns {void}
     */
    const handleResetView = () => {
      const lookAtY = Math.max(maxModelHeight * MODEL_SCALE * 0.45, 1);
      const distance = Math.max(lookAtY * 2.8, 8);

      camera.position.set(distance, distance * 0.75, distance);
      camera.lookAt(0, lookAtY, 0);
      controlsRef.current?.target.set(0, lookAtY, 0);
      controlsRef.current?.update();
    };

    handleResetView();
    resetViewRef.current = handleResetView;

    return () => {
      rendererRef.current = null;
      resetViewRef.current = null;
    };
  }, [camera, gl, maxModelHeight, rendererRef, resetViewRef]);

  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} />;
};

/**
 * React-компонент 3D-визуализации лестницы на `@react-three/fiber`.
 * Рендерит компонентную конфигурацию и дает JSON-редактор для ручной сборки без перил.
 * @param {object} props - Свойства 3D-визуализации.
 * @param {object} props.form - Текущие параметры формы.
 * @param {Array<object>} props.components - Активная компонентная конфигурация лестницы.
 * @param {string} props.componentJson - Текст JSON-редактора.
 * @param {string} props.componentJsonError - Ошибка парсинга JSON, если есть.
 * @param {boolean} props.isCustomConfig - Используется ли ручная JSON-конфигурация.
 * @param {(value: string) => void} props.onComponentJsonChange - Обработчик изменения JSON.
 * @param {() => void} props.onResetComponents - Обработчик возврата к автогенерации.
 * @returns {JSX.Element} Карточка с интерактивной 3D-сценой и JSON-редактором.
 */
const Staircase3D = ({
  componentJson,
  componentJsonError,
  components,
  form,
  isCustomConfig,
  onComponentJsonChange,
  onResetComponents,
}) => {
  const rendererRef = useRef(null);
  const resetViewRef = useRef(null);
  const [maxModelHeight, setMaxModelHeight] = useState(0);

  /**
   * Сохраняет высоту модели для подстройки камеры после пересчёта компонентов.
   * @param {number} maxY - Максимальная высота лестницы в миллиметрах.
   * @returns {void}
   */
  const handleBoundsChange = (maxY) => {
    setMaxModelHeight(maxY);
  };

  /**
   * Обрабатывает нажатие кнопки сброса камеры.
   * Вызов безопасен до инициализации Canvas, потому что ref может быть пустым.
   * @returns {void}
   */
  const handleResetClick = () => {
    resetViewRef.current?.();
  };

  /**
   * Скачивает текущий кадр WebGL-canvas как PNG.
   * `preserveDrawingBuffer` включен в Canvas, поэтому кадр доступен после рендера.
   * @returns {void}
   */
  const handleDownloadClick = () => {
    const renderer = rendererRef.current;

    if (!renderer) {
      return;
    }

    const link = document.createElement('a');
    link.href = renderer.domElement.toDataURL('image/png');
    link.download = 'staircase-3d.png';
    link.click();
  };

  /**
   * Передает текст JSON в Zustand-store для парсинга и ручной сборки.
   * @param {React.ChangeEvent<HTMLTextAreaElement>} event - Событие изменения textarea.
   * @returns {void}
   */
  const handleJsonChange = (event) => {
    onComponentJsonChange(event.target.value);
  };

  return (
    <article className="card drawing drawing--3d">
      <div className="drawing__header">
        <div>
          <h2>3D-визуализация</h2>
          <p className="drawing__note">React + R3F · Multi-floor · Flight / March / Platform / Spiral · v23</p>
        </div>
        <div className="drawing__actions">
          <button className="button" onClick={handleResetClick} type="button">Сбросить вид</button>
          <button className="button button--primary" onClick={handleDownloadClick} type="button">Скачать скриншот</button>
        </div>
      </div>

      <div className="stair-3d" aria-label="Интерактивная 3D-модель лестницы без перил">
        <Canvas camera={{ fov: 45, position: [8, 6, 8] }} gl={{ antialias: true, preserveDrawingBuffer: true }} shadows>
          <color attach="background" args={['#f5f5f5']} />
          <ambientLight intensity={0.62} />
          <directionalLight castShadow intensity={0.86} position={[3, 5, 4]} />
          <StairAssembly components={components} material={form.material} onBoundsChange={handleBoundsChange} />
          <SceneControls maxModelHeight={maxModelHeight} rendererRef={rendererRef} resetViewRef={resetViewRef} />
        </Canvas>
      </div>

      <section className="config-editor" aria-label="JSON-редактор компонентной конфигурации">
        <div className="config-editor__header">
          <div>
            <h3 className="config-editor__title">Компоненты лестницы JSON</h3>
            <p className="config-editor__status">
              {isCustomConfig ? 'Используется ручная конфигурация' : 'Автогенерация из параметров формы'}
            </p>
          </div>
          <button className="button" onClick={onResetComponents} type="button">Сбросить к автогенерации</button>
        </div>
        <textarea
          aria-invalid={componentJsonError ? 'true' : 'false'}
          aria-label="JSON-массив компонентов лестницы"
          className="config-editor__textarea"
          onChange={handleJsonChange}
          spellCheck="false"
          value={componentJson}
        />
        {componentJsonError && <p className="config-editor__error">{componentJsonError}</p>}
      </section>
    </article>
  );
};

export default Staircase3D;
