import { useEffect, useMemo, useRef } from 'react';
import HeightIllustration from './HeightIllustration.jsx';
import { suggestStairType } from '../engine/typeSuggest.js';

const TYPICAL_FLOOR_HEIGHT = 2800;

const MATERIALS = [
  { value: 'wood', label: 'Дерево', description: 'Тёплый классический вид' },
  { value: 'steel', label: 'Металл', description: 'Прочная современная конструкция' },
  { value: 'concrete', label: 'Бетон', description: 'Массивная монолитная лестница' },
  { value: 'combined', label: 'Комбинированная', description: 'Металл + дерево' },
];

/**
 * Рисует упрощённый план зоны под лестницу.
 * @param {HTMLCanvasElement|null} canvas - Canvas-элемент.
 * @param {number} lengthMm - Длина зоны, мм.
 * @param {number} widthMm - Ширина зоны, мм.
 * @returns {void}
 */
const drawSpacePreview = (canvas, lengthMm, widthMm) => {
  if (!canvas) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = 16;
  const maxLength = 6000;
  const maxWidth = 2000;
  const scale = Math.min((width - padding * 2) / maxLength, (height - padding * 2) / maxWidth);
  const rectW = lengthMm * scale;
  const rectH = widthMm * scale;
  const x = padding;
  const y = height - padding - rectH;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#cbd5e1';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(padding, padding, maxLength * scale, maxWidth * scale);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, rectW, rectH);
  ctx.strokeRect(x, y, rectW, rectH);
};

/**
 * Компактный блок простого ввода для sidebar pro-калькулятора.
 * @param {object} props - Свойства компонента.
 * @param {object} props.form - Текущая форма калькулятора.
 * @param {Function} props.onChange - Колбэк изменения с авто-подбором типа.
 * @returns {JSX.Element} Блок ввода высоты, материала и зоны.
 */
const SimpleInputPanel = ({ form, onChange }) => {
  const canvasRef = useRef(null);

  const suggestion = useMemo(() => suggestStairType({
    height: form.height,
    floors: form.floors,
    openingLength: form.hasSpaceLimit ? form.openingLength : null,
    flightWidth: form.flightWidth,
    hasSpaceLimit: form.hasSpaceLimit,
  }), [form.height, form.floors, form.hasSpaceLimit, form.openingLength, form.flightWidth]);

  useEffect(() => {
    if (form.hasSpaceLimit) {
      drawSpacePreview(canvasRef.current, form.openingLength, form.flightWidth);
    }
  }, [form.hasSpaceLimit, form.openingLength, form.flightWidth]);

  /**
   * Подставляет типовую высоту этажа.
   * @returns {void}
   */
  const handleUseTypicalHeight = () => {
    onChange({ height: TYPICAL_FLOOR_HEIGHT });
  };

  /**
   * Выбирает материал лестницы.
   * @param {string} material - Идентификатор материала.
   * @returns {void}
   */
  const handleMaterialSelect = (material) => {
    onChange({ material });
  };

  /**
   * Обрабатывает изменение длины зоны.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие range.
   * @returns {void}
   */
  const handleLengthChange = (event) => {
    onChange({ openingLength: Number(event.target.value), hasSpaceLimit: true });
  };

  /**
   * Обрабатывает изменение ширины зоны.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие range.
   * @returns {void}
   */
  const handleWidthChange = (event) => {
    onChange({ flightWidth: Number(event.target.value), hasSpaceLimit: true });
  };

  /**
   * Отключает ограничение по месту.
   * @returns {void}
   */
  const handleNoSpaceLimit = () => {
    onChange({ hasSpaceLimit: false });
  };

  /**
   * Включает ограничение по месту.
   * @returns {void}
   */
  const handleEnableSpaceLimit = () => {
    onChange({ hasSpaceLimit: true });
  };

  return (
    <div className="simple-input-panel">
      <div className="simple-input-panel__height">
        <HeightIllustration
          heightMm={form.height}
          onHeightChange={(heightMm) => onChange({ height: heightMm })}
        />
        <button className="simple-input-panel__link" onClick={handleUseTypicalHeight} type="button">
          Не знаю точно — типовой этаж ({TYPICAL_FLOOR_HEIGHT} мм)
        </button>
        <p className="simple-input-panel__hint">
          Тип лестницы, количество ступеней и расход материалов калькулятор подберёт сам —
          вам нужно указать только то, что вы реально знаете.
        </p>
      </div>

      <fieldset className="material-picker material-picker--compact">
        <legend className="material-picker__legend">Из какого материала хотите лестницу?</legend>
        <div className="material-picker__grid">
          {MATERIALS.map((material) => (
            <button
              aria-label={material.label}
              aria-pressed={form.material === material.value}
              className={form.material === material.value ? 'material-picker__card material-picker__card--active' : 'material-picker__card'}
              key={material.value}
              onClick={() => handleMaterialSelect(material.value)}
              type="button"
            >
              <span className={`material-picker__icon material-picker__icon--${material.value}`} aria-hidden="true" />
              <span className="material-picker__label">{material.label}</span>
              <span className="material-picker__desc">{material.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <details className="simple-input-panel__space" open={form.hasSpaceLimit}>
        <summary className="simple-input-panel__space-summary">Место под лестницу</summary>
        <div className="simple-input-panel__space-body">
          {form.hasSpaceLimit ? (
            <>
              <canvas
                aria-label="Схема зоны под лестницу"
                className="simple-input-panel__space-canvas"
                ref={canvasRef}
              />
              <label className="field">
                <span className="field__label">Длина зоны, мм — {form.openingLength}</span>
                <input
                  className="field__control field__control--range"
                  max="6000"
                  min="1500"
                  onChange={handleLengthChange}
                  type="range"
                  value={form.openingLength}
                />
              </label>
              <label className="field">
                <span className="field__label">Ширина зоны, мм — {form.flightWidth}</span>
                <input
                  className="field__control field__control--range"
                  max="2000"
                  min="700"
                  onChange={handleWidthChange}
                  type="range"
                  value={form.flightWidth}
                />
              </label>
              <button className="simple-input-panel__link" onClick={handleNoSpaceLimit} type="button">
                Нет ограничений по месту
              </button>
            </>
          ) : (
            <button className="simple-input-panel__secondary" onClick={handleEnableSpaceLimit} type="button">
              Указать размеры зоны
            </button>
          )}
        </div>
      </details>

      <p className="simple-input-panel__suggestion" role="status">
        Подобран тип: <strong>{suggestion.label}</strong>. {suggestion.reason}
      </p>
    </div>
  );
};

export default SimpleInputPanel;
