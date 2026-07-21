/**
 * Форматирует миллиметры для текстов подсказок.
 * @param {number} valueMm - Значение в миллиметрах.
 * @param {number} [digits=0] - Число знаков после запятой.
 * @returns {string} Отформатированная строка.
 */
const formatMm = (valueMm, digits = 0) => {
  if (!Number.isFinite(valueMm)) {
    return '—';
  }

  return valueMm.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

/**
 * Формирует подсказку по ошибке высоты ступени простым языком.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия.
 * @returns {{ problem: string, action: string, possible: string }} Тексты подсказки.
 */
export const buildRiserHint = (form, geometry) => {
  const maxStepsInSystem = geometry.flightCount * 18;
  const riserIfMaxSteps = geometry.totalRise / maxStepsInSystem;

  if (geometry.riser > 200) {
    if (riserIfMaxSteps > 200) {
      return {
        problem: `Этаж слишком высокий (${formatMm(geometry.totalRise)} мм подъёма): даже при максимальном числе ступеней (${maxStepsInSystem}) каждая всё равно выше 200 мм. Сейчас — ${formatMm(geometry.riser, 1)} мм.`,
        action: form.shape === 'straight' && geometry.flightCount <= 1
          ? 'Нужна лестница с поворотом или другая схема — прямой одной линией здесь не уложиться. Также проверьте высоту: обычно 2600–3200 мм, не перепутайте с сантиметрами.'
          : 'Проверьте высоту этажа и тип лестницы. Если высота указана верно — нужен другой тип конструкции.',
        possible: 'Прямой одной секцией — скорее всего нет. С поворотом или индивидуальным проектом — возможно.',
      };
    }

    const minLengthMm = Math.max(geometry.safeSteps - 1, 1) * 260;

    return {
      problem: `Ступени слишком высокие — ${formatMm(geometry.riser, 1)} мм вместо нормальных 150–200 мм. Для этажа ${formatMm(form.height)} мм в вашей зоне не хватает длины, чтобы разложить подъём на больше ступеней.`,
      action: form.hasSpaceLimit
        ? `Увеличьте длину зоны. Для комфортных ступеней нужно примерно от ${formatMm(minLengthMm)} мм по длине (сейчас ${formatMm(form.openingLength)} мм).`
        : 'Укажите реальную длину зоны в блоке «Место под лестницу» — без неё калькулятор не может правильно подобрать число ступеней.',
      possible: 'Да, если можно увеличить длину зоны или уточнить высоту этажа.',
    };
  }

  return {
    problem: `Ступени слишком низкие — ${formatMm(geometry.riser, 1)} мм вместо нормальных 150–200 мм. Ступеней получилось слишком много для этой высоты.`,
    action: 'Проверьте высоту этажа — она указывается в миллиметрах (например, 2800). Если высота верна, уменьшите длину зоны.',
    possible: 'Да — обычно достаточно скорректировать высоту или длину зоны.',
  };
};

/**
 * Формирует подсказку по ошибке глубины проступи простым языком.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия.
 * @returns {{ problem: string, action: string, possible: string }} Тексты подсказки.
 */
export const buildTreadHint = (form, geometry) => {
  const minLengthMm = Math.max(geometry.safeSteps - 1, 1) * 260;
  const maxLengthMm = Math.max(geometry.safeSteps - 1, 1) * 300;

  if (geometry.tread < 260) {
    return {
      problem: `Ступени слишком мелкие по глубине — ${formatMm(geometry.tread, 1)} мм вместо нормальных 260–300 мм. Места по длине не хватает для такого подъёма.`,
      action: form.hasSpaceLimit
        ? `Увеличьте длину зоны: для ${geometry.safeSteps} ступеней нужно примерно от ${formatMm(minLengthMm)} мм (сейчас ${formatMm(form.openingLength)} мм).`
        : 'Укажите реальную длину зоны — без неё калькулятор не видит, что места мало.',
      possible: form.openingLength >= minLengthMm - 300
        ? 'Возможно, если немного увеличить длину или выбрать лестницу с поворотом.'
        : 'Да, если можно увеличить длину зоны. Если место принципиально мало — нужен поворот или винтовая лестница.',
    };
  }

  return {
    problem: `Ступени слишком глубокие — ${formatMm(geometry.tread, 1)} мм вместо нормальных 260–300 мм. Зона по длине слишком большая для этого подъёма.`,
    action: form.hasSpaceLimit
      ? `Уменьшите длину зоны до примерно ${formatMm(minLengthMm)}–${formatMm(maxLengthMm)} мм или проверьте высоту этажа.`
      : 'Укажите реальную длину зоны или проверьте высоту этажа в миллиметрах.',
    possible: 'Да — скорректируйте длину зоны или высоту.',
  };
};

/**
 * Формирует подсказку по ошибке числа ступеней в марше простым языком.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия.
 * @returns {{ problem: string, action: string, possible: string }} Тексты подсказки.
 */
export const buildStepsHint = (form, geometry) => {
  const stepsValue = geometry.flightCount > 1
    ? `${geometry.maxStepsPerFlight} в одном марше`
    : `${geometry.safeSteps} ступеней`;

  if (geometry.flightCount > 1) {
    if (geometry.maxStepsPerFlight > 18) {
      return {
        problem: `В одном марше слишком много ступеней — ${geometry.maxStepsPerFlight} шт. Норма: не больше 18 в каждом марше.`,
        action: 'Нужна лестница с дополнительным поворотом или площадкой, либо пересмотрите высоту и длину зоны.',
        possible: 'Да, если сменить тип лестницы или изменить размеры зоны.',
      };
    }

    return {
      problem: `В одном марше слишком мало ступеней — ${geometry.minStepsPerFlight} шт. Норма: не меньше 3 в каждом марше.`,
      action: 'Увеличьте длину зоны или проверьте высоту этажа — возможно, указаны неверные размеры.',
      possible: 'Да — обычно помогает корректировка длины или высоты.',
    };
  }

  if (geometry.safeSteps > 18) {
    return {
      problem: `Слишком много ступеней подряд — ${geometry.safeSteps} шт. В одном марше допускается не больше 18.`,
      action: 'Нужна лестница с поворотом (Г-образная) — прямой марш такой длины не подходит.',
      possible: 'Да, если выбрать лестницу с поворотом или площадкой.',
    };
  }

  return {
    problem: `Слишком мало ступеней — ${stepsValue}. В одном марше нужно минимум 3.`,
    action: 'Проверьте высоту этажа (в мм) и длину зоны — возможно, одно из значений указано неверно.',
    possible: 'Да — скорректируйте высоту или длину зоны.',
  };
};

/**
 * Формирует подсказку по ошибке винтовой лестницы простым языком.
 * @param {'lineTread'|'narrowEnd'|'headroom'} issue - Тип проблемы.
 * @param {object} form - Текущие значения формы.
 * @param {object} geometry - Рассчитанная геометрия.
 * @returns {{ problem: string, action: string, possible: string }} Тексты подсказки.
 */
export const buildSpiralHint = (issue, form, geometry) => {
  if (issue === 'lineTread') {
    return {
      problem: `На винтовой лестнице ступени по линии хода слишком узкие — ${formatMm(geometry.spiralLineTread, 1)} мм, нужно минимум 180 мм.`,
      action: form.hasSpaceLimit
        ? 'Увеличьте ширину зоны или длину — винтовая лестница требует больше места по диаметру.'
        : 'Укажите реальные размеры зоны или откройте дополнительные параметры и увеличьте радиус лестницы.',
      possible: 'Да, если можно увеличить зону под лестницу.',
    };
  }

  if (issue === 'narrowEnd') {
    return {
      problem: `У винтовой лестницы слишком узкое место у центральной стойки — ${formatMm(geometry.spiralNarrowEnd, 1)} мм, нужно минимум 100 мм.`,
      action: 'Увеличьте ширину зоны или радиус лестницы в дополнительных параметрах.',
      possible: 'Да, если зона может быть шире.',
    };
  }

  return {
    problem: `Между витками винтовой лестницы мало места для головы — ${formatMm(geometry.spiralHeadroom)} мм, нужно минимум 2000 мм.`,
    action: 'Увеличьте высоту этажа или уменьшите число ступеней на один оборот в дополнительных параметрах.',
    possible: 'Частично — зависит от реальной высоты этажа и конструкции.',
  };
};
