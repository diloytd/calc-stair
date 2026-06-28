import { generateComponents } from '../src/stairComponents.js';
import { layoutStairComponents, getDirection } from '../src/stairLayout.js';

const getNormal = (direction) => ({ x: -direction.z, z: direction.x });

const transformPoint = (along, across, position, angleY) => {
  const direction = getDirection(angleY);
  const normal = getNormal(direction);

  return {
    x: position.x + direction.x * along + normal.x * across,
    z: position.z + direction.z * along + normal.z * across,
  };
};

const expandBounds = (bounds, point) => {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.minZ = Math.min(bounds.minZ, point.z);
  bounds.maxZ = Math.max(bounds.maxZ, point.z);
};

/**
 * Возвращает границы блока flight так же, как их рисует FlightBlock в 3D.
 * @param {object} component - Компонент flight после layout.
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} Границы на плане.
 */
const getFlightBlockPlanBounds = (component) => {
  const { position, angleY } = component;
  const platform = component.platform;
  const endsOnFloorLanding = component.endsOnFloorLanding ?? false;
  let visibleStepCount = component.steps > 0 ? component.steps : 0;

  if (platform) {
    visibleStepCount = Math.max(visibleStepCount - 1, 0);
  }

  if (endsOnFloorLanding) {
    visibleStepCount = Math.max(visibleStepCount - 1, 0);
  }

  const layoutSteps = platform && component.steps > 0
    ? Math.max(component.steps - 1, 0)
    : component.steps;
  const marchLength = component.steps > 0
    ? (Number.isFinite(component.anchorMarchLength)
      ? component.anchorMarchLength
      : layoutSteps * component.treadDepth)
    : 0;
  const platformLengthTotal = platform ? platform.length : 0;
  const platformOffset = component.platformOffset ?? { x: 0, z: 0 };
  const halfWidth = component.width / 2;
  const halfPlatformWidth = (platform?.width ?? component.width) / 2;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };

  for (let stepIndex = 0; stepIndex < visibleStepCount; stepIndex += 1) {
    const along = component.treadDepth * (stepIndex + 0.5);
    [-halfWidth, halfWidth].forEach((across) => {
      expandBounds(bounds, transformPoint(along, across, position, angleY));
    });
  }

  if (platform) {
    const platformStartAlong = visibleStepCount * component.treadDepth;
    const centerAlong = platformStartAlong + platformLengthTotal / 2 + platformOffset.x;
    const centerAcross = platformOffset.z;
    const halfLength = platformLengthTotal / 2;

    [
      [centerAlong - halfLength, centerAcross - halfPlatformWidth],
      [centerAlong - halfLength, centerAcross + halfPlatformWidth],
      [centerAlong + halfLength, centerAcross - halfPlatformWidth],
      [centerAlong + halfLength, centerAcross + halfPlatformWidth],
    ].forEach(([along, across]) => {
      expandBounds(bounds, transformPoint(along, across, position, angleY));
    });
  }

  return bounds;
};

const gapBetween = (a, b) => {
  const gapX = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const gapZ = Math.max(0, Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ));
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);

  return { gapX, gapZ, overlapX, overlapZ };
};

const form = {
  shape: 'l-platform',
  floors: 3,
  height: 3000,
  openingLength: 4200,
  flightWidth: 900,
  landingLength: 900,
  treadThickness: 40,
  firstFlightSteps: 0,
  secondFlightSteps: 0,
  useAutoSteps: true,
  steps: 30,
};

const geometry = {
  safeSteps: 30,
  riser: 6000 / 30,
  flightLength: 4200,
  landingLength: 900,
};

const laid = layoutStairComponents(generateComponents(form, geometry));

console.log('=== layout positions ===');
laid.forEach((component) => {
  console.log(component.layoutRole, component.position, 'ang', component.angleY);
});

console.log('\n=== 3D block bounds & gaps ===');
const boundsList = laid.map((component) => ({
  role: component.layoutRole,
  bounds: getFlightBlockPlanBounds(component),
}));

boundsList.forEach((entry) => {
  const { bounds } = entry;
  console.log(
    entry.role,
    `[${bounds.minX.toFixed(0)}..${bounds.maxX.toFixed(0)}] x [${bounds.minZ.toFixed(0)}..${bounds.maxZ.toFixed(0)}]`,
  );
});

for (let index = 0; index < boundsList.length - 1; index += 1) {
  const current = boundsList[index];
  const next = boundsList[index + 1];
  const gap = gapBetween(current.bounds, next.bounds);
  console.log(
    `${current.role} -> ${next.role}:`,
    `gapX=${gap.gapX.toFixed(1)} gapZ=${gap.gapZ.toFixed(1)} overlap=${gap.overlapX.toFixed(0)}x${gap.overlapZ.toFixed(0)}`,
  );
}
