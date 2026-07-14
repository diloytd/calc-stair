/** Базовая ширина макета, от которой считается масштаб UI. */
export const DESIGN_WIDTH = 1440;

/** Базовая высота макета, от которой считается масштаб UI. */
export const DESIGN_HEIGHT = 900;

/** Минимальный коэффициент масштабирования для очень маленьких экранов. */
export const MIN_UI_SCALE = 0.4;

/** Максимальная ширина viewport, для которой рассчитан масштаб. */
export const MAX_VIEWPORT_WIDTH = 4000;

/** Базовый размер шрифта макета в пикселях при scale = 1. */
export const BASE_FONT_SIZE = 22;

/** Размер шрифта на canvas-чертежах при scale = 1. */
export const CANVAS_FONT_SIZE = 18;

export const MAX_UI_SCALE = MAX_VIEWPORT_WIDTH / DESIGN_WIDTH;

/**
 * Возвращает коэффициент пропорционального масштабирования UI под текущий viewport.
 * Использует меньшее из отношений ширины и высоты к базовому макету 1440×900.
 * @returns {number} Коэффициент в диапазоне от `MIN_UI_SCALE` до `MAX_UI_SCALE`.
 * @example
 * getUiScale();
 * // 1 при viewport 1440×900, ~2.78 при 4000×2250
 */
export const getUiScale = () => {
  if (typeof window === 'undefined') {
    return 1;
  }

  const rawScale = Math.min(
    window.innerWidth / DESIGN_WIDTH,
    window.innerHeight / DESIGN_HEIGHT,
  );

  return Math.min(Math.max(rawScale, MIN_UI_SCALE), MAX_UI_SCALE);
};

/**
 * Масштабирует значение в пикселях базового макета под текущий viewport.
 * @param {number} value - Размер в пикселях при scale = 1.
 * @returns {number} Масштабированное значение в пикселях.
 */
export const scalePx = (value) => value * getUiScale();

/**
 * Записывает `--ui-scale` в `:root` и обновляет его при изменении размеров окна.
 * @returns {() => void} Функция отписки от события `resize`.
 */
export const initUiScale = () => {
  /**
   * Применяет актуальный коэффициент масштабирования к CSS-переменной.
   * @returns {void}
   */
  const applyUiScale = () => {
    document.documentElement.style.setProperty('--ui-scale', String(getUiScale()));
  };

  applyUiScale();
  window.addEventListener('resize', applyUiScale);

  return () => window.removeEventListener('resize', applyUiScale);
};
