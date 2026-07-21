const MIN_HEIGHT = 2200;
const MAX_HEIGHT = 6000;

/**
 * Форматирует значение в миллиметрах для подписи на схеме.
 * @param {number} valueMm - Значение в миллиметрах.
 * @returns {string} Строка для отображения.
 */
const formatHeightLabel = (valueMm) => {
  if (!Number.isFinite(valueMm)) {
    return '—';
  }

  return Math.round(valueMm).toLocaleString('ru-RU');
};

/**
 * Иллюстрация высоты подъёма с полем ввода под схемой.
 * @param {object} props - Свойства компонента.
 * @param {number} props.heightMm - Высота подъёма в миллиметрах.
 * @param {Function} props.onHeightChange - Обработчик изменения высоты.
 * @returns {JSX.Element} Иллюстрация с полем ввода.
 */
const HeightIllustration = ({ heightMm, onHeightChange }) => {
  /**
   * Обрабатывает ввод высоты в миллиметрах.
   * @param {React.ChangeEvent<HTMLInputElement>} event - Событие input.
   * @returns {void}
   */
  const handleHeightChange = (event) => {
    onHeightChange(Number(event.target.value));
  };

  return (
    <div className="height-scene">
      <svg
        aria-hidden="true"
        className="height-scene__svg"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 280 240"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect fill="#cbd5e1" height="12" rx="2" width="232" x="24" y="28" />
        <text fill="#64748b" fontSize="12" x="28" y="24">Куда нужно подняться</text>

        <rect fill="#e2e8f0" height="14" rx="2" width="232" x="24" y="208" />
        <text fill="#64748b" fontSize="12" x="28" y="232">Нижний уровень</text>

        <circle cx="56" cy="198" fill="#0ea5e9" r="9" />
        <rect fill="#0369a1" height="28" rx="3" width="12" x="50" y="168" />
        <rect fill="#0369a1" height="20" rx="2" width="8" x="44" y="176" />
        <rect fill="#0369a1" height="20" rx="2" width="8" x="64" y="176" />

        <line stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1.5" x1="132" x2="132" y1="44" y2="206" />
        <polygon fill="#94a3b8" points="132,44 128,52 136,52" />
        <polygon fill="#94a3b8" points="132,206 128,198 136,198" />

        <rect fill="#f8fafc" height="36" rx="8" stroke="#cbd5e1" strokeWidth="1" width="88" x="88" y="108" />
        <text fill="#0369a1" fontSize="13" fontWeight="700" textAnchor="middle" x="132" y="128">
          {formatHeightLabel(heightMm)}
        </text>
        <text fill="#64748b" fontSize="10" textAnchor="middle" x="132" y="142">мм</text>
      </svg>

      <div className="height-scene__controls">
        <p className="height-scene__question">Вам нужна лестница для подъёма на какую высоту?</p>
        <label className="height-scene__field">
          <span className="height-scene__label">Высота, мм</span>
          <input
            aria-label="Высота подъёма в миллиметрах"
            className="height-scene__input field__control"
            max={MAX_HEIGHT}
            min={MIN_HEIGHT}
            onChange={handleHeightChange}
            step="10"
            type="number"
            value={heightMm}
          />
        </label>
      </div>
    </div>
  );
};

export default HeightIllustration;
