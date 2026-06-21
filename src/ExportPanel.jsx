import { useMemo, useState } from 'react';

const EXPORT_TITLE = 'Расчёт лестницы для частного дома';
const SCREEN_DPI = 96;
const SCRIPT_LOADS = new Map();
const STATUS_LABELS = {
  error: 'Error',
  ok: 'OK',
  warn: 'Warning',
};

/**
 * Форматирует числовые значения для экспортируемых файлов.
 * @param {number} value - Число для вывода.
 * @param {number} digits - Количество знаков после запятой.
 * @returns {string} Локализованная строка или пустая строка для некорректного числа.
 */
const formatExportNumber = (value, digits = 0) => {
  if (!Number.isFinite(value)) {
    return '';
  }

  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
};

/**
 * Возвращает дату и время для отчёта в русской локали.
 * @param {Date} date - Дата экспорта.
 * @returns {string} Строка даты для печатных и офисных форматов.
 */
const formatReportDate = (date) => date.toLocaleString('ru-RU', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Возвращает безопасный хвост имени файла по текущей дате.
 * @param {Date} date - Дата экспорта.
 * @returns {string} Строка вида YYYY-MM-DD_HH-mm.
 */
const getFileTimestamp = (date) => date.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

/**
 * Экранирует значение CSV и сохраняет совместимость с Excel в русской локали.
 * @param {string|number} value - Значение ячейки.
 * @returns {string} CSV-ячейка с кавычками при необходимости.
 */
const escapeCsvCell = (value) => {
  const text = String(value ?? '');

  if (!/[;"\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
};

/**
 * Скачивает Blob через временную ссылку.
 * @param {Blob} blob - Данные файла.
 * @param {string} filename - Имя скачиваемого файла.
 * @returns {void}
 */
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();

  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
};

/**
 * Скачивает текстовый файл с заданным MIME-типом.
 * @param {string} content - Содержимое файла.
 * @param {string} filename - Имя файла.
 * @param {string} type - MIME-тип файла.
 * @returns {void}
 */
const downloadTextFile = (content, filename, type) => {
  downloadBlob(new Blob([content], { type }), filename);
};

/**
 * Загружает CDN-скрипт один раз и переиспользует текущий промис для повторных кликов.
 * @param {string} src - URL CDN-скрипта.
 * @returns {Promise<void>} Промис завершения загрузки скрипта.
 */
const loadScript = (src) => {
  if (SCRIPT_LOADS.has(src)) {
    return SCRIPT_LOADS.get(src);
  }

  const existingScript = document.querySelector(`script[src="${src}"]`);

  if (existingScript?.dataset.loaded === 'true') {
    const loadedPromise = Promise.resolve();
    SCRIPT_LOADS.set(src, loadedPromise);

    return loadedPromise;
  }

  if (existingScript && document.readyState !== 'loading') {
    const resolvedPromise = Promise.resolve();
    SCRIPT_LOADS.set(src, resolvedPromise);

    return resolvedPromise;
  }

  const loadPromise = new Promise((resolve, reject) => {
    const script = existingScript || document.createElement('script');
    const timeoutId = window.setTimeout(() => reject(new Error(`Истекло время загрузки ${src}`)), 8000);
    script.src = src;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timeoutId);
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Не удалось загрузить ${src}`));
    };

    if (!existingScript) {
      document.head.append(script);
    }
  });

  SCRIPT_LOADS.set(src, loadPromise);

  return loadPromise;
};

/**
 * Возвращает jsPDF, загружая CDN-скрипт при необходимости.
 * Используется только PDF-экспортом, чтобы Word-библиотека не блокировала PDF.
 * @returns {Promise<Function>} Конструктор jsPDF.
 * @throws {Error} Если jsPDF недоступен после загрузки CDN.
 */
const ensureJsPdf = async () => {
  if (!window.jspdf?.jsPDF) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  }

  if (!window.jspdf?.jsPDF) {
    throw new Error('Не удалось загрузить jsPDF для PDF-экспорта.');
  }

  return window.jspdf.jsPDF;
};

/**
 * Возвращает html2canvas, загружая CDN-скрипт при необходимости.
 * Используется для превращения HTML-отчёта в изображение перед вставкой в PDF.
 * @returns {Promise<Function>} Функция html2canvas.
 * @throws {Error} Если html2canvas недоступен после загрузки CDN.
 */
const ensureHtml2Canvas = async () => {
  if (!window.html2canvas) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }

  if (!window.html2canvas) {
    throw new Error('Не удалось загрузить html2canvas для PDF-экспорта.');
  }

  return window.html2canvas;
};

/**
 * Возвращает docx.js для Word-экспорта с fallback на ESM CDN.
 * Нужен потому, что некоторые CDN-сборки docx не создают `window.docx`.
 * @returns {Promise<object>} API библиотеки docx.js.
 * @throws {Error} Если docx.js не удалось получить ни из глобального объекта, ни через CDN import.
 */
const ensureDocx = async () => {
  if (window.docx?.Document) {
    return window.docx;
  }

  await loadScript('https://cdn.jsdelivr.net/npm/docx@8.2.0/build/index.min.js').catch(() => {});

  if (window.docx?.Document) {
    return window.docx;
  }

  try {
    const module = await import(/* @vite-ignore */ 'https://esm.sh/docx@8.2.0');
    const docx = module.Document ? module : module.default;

    if (docx?.Document) {
      window.docx = docx;

      return docx;
    }
  } catch {
    // Ошибка ниже будет понятнее для пользователя, чем технический текст import().
  }

  throw new Error('Не удалось загрузить docx.js для Word-экспорта. Проверьте доступ к CDN.');
};

/**
 * Возвращает Canvas по ref и проверяет, что он уже отрисован.
 * @param {React.RefObject<HTMLCanvasElement>} canvasRef - Ref на Canvas.
 * @param {string} title - Название чертежа для текста ошибки.
 * @returns {HTMLCanvasElement} Canvas с чертежом.
 * @throws {Error} Если Canvas недоступен.
 */
const getCanvas = (canvasRef, title) => {
  if (!canvasRef.current) {
    throw new Error(`Чертёж "${title}" ещё не готов.`);
  }

  return canvasRef.current;
};

/**
 * Рисует один Canvas на новом полотне с белым фоном, рамкой и подписью.
 * @param {HTMLCanvasElement} sourceCanvas - Исходный Canvas.
 * @param {string} title - Подпись чертежа.
 * @param {number} dpi - Целевое разрешение: 96 или 300 DPI.
 * @returns {HTMLCanvasElement} Canvas для экспорта в PNG/PDF/Word.
 */
const createFramedCanvas = (sourceCanvas, title, dpi) => {
  const scale = dpi / SCREEN_DPI;
  const sourceWidth = sourceCanvas.clientWidth || sourceCanvas.width;
  const sourceHeight = sourceCanvas.clientHeight || sourceCanvas.height;
  const padding = 28;
  const titleHeight = 38;
  const outputCanvas = document.createElement('canvas');
  const outputWidth = sourceWidth + padding * 2;
  const outputHeight = sourceHeight + padding * 2 + titleHeight;
  outputCanvas.width = Math.round(outputWidth * scale);
  outputCanvas.height = Math.round(outputHeight * scale);

  const context = outputCanvas.getContext('2d');
  context.scale(scale, scale);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.strokeStyle = '#0f172a';
  context.lineWidth = 1.5;
  context.strokeRect(12, 12, outputWidth - 24, outputHeight - 24);
  context.fillStyle = '#0f172a';
  context.font = '700 18px Arial';
  context.fillText(title, padding, padding + 4);
  context.drawImage(sourceCanvas, padding, padding + titleHeight, sourceWidth, sourceHeight);

  return outputCanvas;
};

/**
 * Создаёт общий PNG с видом сбоку и видом сверху.
 * @param {HTMLCanvasElement} profileCanvas - Canvas вида сбоку.
 * @param {HTMLCanvasElement} planCanvas - Canvas вида сверху.
 * @param {number} dpi - Целевое разрешение.
 * @returns {string} PNG в формате data URL.
 */
const createCombinedDrawingDataUrl = (profileCanvas, planCanvas, dpi) => {
  const profile = createFramedCanvas(profileCanvas, 'Вид сбоку', dpi);
  const plan = createFramedCanvas(planCanvas, 'Вид сверху', dpi);
  const gap = Math.round(24 * (dpi / SCREEN_DPI));
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(profile.width, plan.width);
  outputCanvas.height = profile.height + plan.height + gap;

  const context = outputCanvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  context.drawImage(profile, Math.round((outputCanvas.width - profile.width) / 2), 0);
  context.drawImage(plan, Math.round((outputCanvas.width - plan.width) / 2), profile.height + gap);

  return outputCanvas.toDataURL('image/png');
};

/**
 * Преобразует data URL в Uint8Array для docx.js.
 * @param {string} dataUrl - Изображение в формате data URL.
 * @returns {Uint8Array} Бинарные данные изображения.
 */
const dataUrlToUint8Array = (dataUrl) => {
  const base64 = dataUrl.split(',')[1];
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

/**
 * Экранирует текст для XML-документов Office Open XML.
 * @param {string|number} value - Значение для вставки в XML.
 * @returns {string} Безопасная XML-строка.
 */
const escapeXml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

/**
 * Кодирует строку в UTF-8.
 * @param {string} value - Строка для кодирования.
 * @returns {Uint8Array} Байты UTF-8.
 */
const encodeUtf8 = (value) => new TextEncoder().encode(value);

/**
 * Склеивает несколько Uint8Array в один буфер.
 * @param {Array<Uint8Array>} chunks - Части бинарного файла.
 * @returns {Uint8Array} Общий бинарный буфер.
 */
const concatUint8Arrays = (chunks) => {
  const totalLength = chunks.reduce((length, chunk) => length + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });

  return result;
};

/**
 * Создаёт таблицу CRC32 для ZIP-записей.
 * @returns {Uint32Array} Таблица CRC32.
 */
const createCrcTable = () => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
};

const CRC_TABLE = createCrcTable();

/**
 * Считает CRC32 для файла внутри ZIP.
 * @param {Uint8Array} bytes - Содержимое файла.
 * @returns {number} CRC32 без знака.
 */
const getCrc32 = (bytes) => {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
};

/**
 * Записывает 16-битное число в little-endian буфер.
 * @param {DataView} view - Буфер ZIP-заголовка.
 * @param {number} offset - Смещение записи.
 * @param {number} value - Значение.
 * @returns {void}
 */
const writeUint16 = (view, offset, value) => {
  view.setUint16(offset, value, true);
};

/**
 * Записывает 32-битное число в little-endian буфер.
 * @param {DataView} view - Буфер ZIP-заголовка.
 * @param {number} offset - Смещение записи.
 * @param {number} value - Значение.
 * @returns {void}
 */
const writeUint32 = (view, offset, value) => {
  view.setUint32(offset, value >>> 0, true);
};

/**
 * Возвращает дату в DOS-формате для ZIP.
 * @param {Date} date - Дата файла.
 * @returns {{date: number, time: number}} DOS-дата и DOS-время.
 */
const getDosDateTime = (date) => ({
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
});

/**
 * Создаёт ZIP Blob без сжатия, достаточный для валидного DOCX-пакета.
 * @param {Array<{name: string, data: Uint8Array}>} files - Файлы ZIP-пакета.
 * @returns {Blob} ZIP-файл.
 */
const createStoredZipBlob = (files) => {
  const now = new Date();
  const dos = getDosDateTime(now);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encodeUtf8(file.name);
    const crc32 = getCrc32(file.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dos.time);
    writeUint16(localView, 12, dos.date);
    writeUint32(localView, 14, crc32);
    writeUint32(localView, 18, file.data.length);
    writeUint32(localView, 22, file.data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dos.time);
    writeUint16(centralView, 14, dos.date);
    writeUint32(centralView, 16, crc32);
    writeUint32(centralView, 20, file.data.length);
    writeUint32(centralView, 24, file.data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + file.data.length;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, centralDirectory, endHeader], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
};

/**
 * Создаёт параграф WordprocessingML.
 * @param {string} text - Текст параграфа.
 * @param {object} options - Настройки параграфа.
 * @param {boolean} [options.bold=false] - Делать текст жирным.
 * @param {string} [options.style=''] - Идентификатор стиля Word.
 * @returns {string} XML параграфа.
 */
const createWordParagraph = (text, { bold = false, style = '' } = {}) => `
  <w:p>
    <w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}</w:pPr>
    <w:r>
      <w:rPr>${bold ? '<w:b/>' : ''}</w:rPr>
      <w:t>${escapeXml(text)}</w:t>
    </w:r>
  </w:p>
`;

/**
 * Создаёт XML-таблицу для DOCX.
 * @param {Array<object>} rows - Строки таблицы.
 * @param {Array<string>} columns - Ключи колонок.
 * @param {object} headers - Подписи колонок.
 * @returns {string} XML таблицы.
 */
const createWordTableXml = (rows, columns, headers) => {
  const createCell = (text, bold = false) => `
    <w:tc>
      <w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>
      ${createWordParagraph(text, { bold })}
    </w:tc>
  `;
  const createRow = (cells, bold = false) => `<w:tr>${cells.map((cell) => createCell(cell, bold)).join('')}</w:tr>`;

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="10000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="6" w:color="CBD5E1"/>
          <w:left w:val="single" w:sz="6" w:color="CBD5E1"/>
          <w:bottom w:val="single" w:sz="6" w:color="CBD5E1"/>
          <w:right w:val="single" w:sz="6" w:color="CBD5E1"/>
          <w:insideH w:val="single" w:sz="6" w:color="CBD5E1"/>
          <w:insideV w:val="single" w:sz="6" w:color="CBD5E1"/>
        </w:tblBorders>
      </w:tblPr>
      ${createRow(columns.map((column) => headers[column]), true)}
      ${rows.map((row) => createRow(columns.map((column) => row[column] ?? ''))).join('')}
    </w:tbl>
  `;
};

/**
 * Создаёт XML-блок изображения для DOCX.
 * @param {string} relationshipId - Id связи с файлом картинки.
 * @param {string} name - Имя изображения.
 * @returns {string} XML DrawingML.
 */
const createWordImageXml = (relationshipId, name) => {
  const widthEmu = 5486400;
  const heightEmu = 3017520;

  return `
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
            <wp:docPr id="${relationshipId === 'rId1' ? 1 : 2}" name="${escapeXml(name)}"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="0" name="${escapeXml(name)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${relationshipId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  `;
};

/**
 * Создаёт валидный DOCX-пакет с таблицами и PNG-чертежами без ожидания внешнего CDN.
 * @param {object} options - Данные Word-отчёта.
 * @param {Array<object>} options.parameterRows - Строки параметров.
 * @param {Array<object>} options.checkRows - Строки проверок.
 * @param {string} options.profileImage - Data URL вида сбоку.
 * @param {string} options.planImage - Data URL вида сверху.
 * @param {string} options.reportDate - Дата расчёта.
 * @param {string} options.summary - Итоговое заключение.
 * @returns {Blob} Готовый DOCX-файл.
 */
const createDocxBlob = ({ parameterRows, checkRows, profileImage, planImage, reportDate, summary }) => {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${createWordParagraph(EXPORT_TITLE, { bold: true, style: 'Title' })}
    ${createWordParagraph(`Дата расчёта: ${reportDate}`)}
    ${createWordParagraph('Введённые и рассчитанные параметры', { bold: true, style: 'Heading1' })}
    ${createWordTableXml(parameterRows, ['name', 'value', 'unit', 'status'], {
    name: 'Название параметра',
    status: 'Статус',
    unit: 'Ед. изм.',
    value: 'Значение',
  })}
    ${createWordParagraph('Результаты проверок', { bold: true, style: 'Heading1' })}
    ${createWordTableXml(checkRows, ['icon', 'title', 'value', 'note'], {
    icon: 'Статус',
    note: 'Пояснение',
    title: 'Проверка',
    value: 'Значение',
  })}
    ${createWordParagraph('2D-чертежи', { bold: true, style: 'Heading1' })}
    ${createWordImageXml('rId1', 'Вид сбоку')}
    ${createWordImageXml('rId2', 'Вид сверху')}
    ${createWordParagraph('Итоговое заключение', { bold: true, style: 'Heading1' })}
    ${createWordParagraph(summary, { bold: true })}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/profile.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/plan.png"/>
</Relationships>`;

  return createStoredZipBlob([
    { data: encodeUtf8(contentTypesXml), name: '[Content_Types].xml' },
    { data: encodeUtf8(rootRelsXml), name: '_rels/.rels' },
    { data: encodeUtf8(documentXml), name: 'word/document.xml' },
    { data: encodeUtf8(documentRelsXml), name: 'word/_rels/document.xml.rels' },
    { data: dataUrlToUint8Array(profileImage), name: 'word/media/profile.png' },
    { data: dataUrlToUint8Array(planImage), name: 'word/media/plan.png' },
  ]);
};

/**
 * Строит HTML-таблицу для временного контейнера PDF.
 * @param {Array<object>} rows - Строки таблицы.
 * @param {Array<string>} columns - Ключи колонок.
 * @param {object} headers - Подписи колонок.
 * @returns {string} HTML таблицы.
 */
const buildHtmlTable = (rows, columns, headers) => `
  <table>
    <thead>
      <tr>${columns.map((column) => `<th>${headers[column]}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${columns.map((column) => `<td>${row[column] ?? ''}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
`;

/**
 * Создаёт временный контейнер отчёта для html2canvas.
 * @param {object} options - Данные отчёта и изображений.
 * @param {Array<object>} options.parameterRows - Параметры лестницы.
 * @param {Array<object>} options.checkRows - Результаты проверок.
 * @param {string} options.profileImage - Data URL вида сбоку.
 * @param {string} options.planImage - Data URL вида сверху.
 * @param {string} options.reportDate - Дата расчёта.
 * @param {string} options.summary - Итоговое заключение.
 * @returns {HTMLDivElement} Скрытый контейнер отчёта.
 */
const createReportContainer = ({ parameterRows, checkRows, profileImage, planImage, reportDate, summary }) => {
  const container = document.createElement('div');
  container.className = 'export-report';
  container.innerHTML = `
    <h1>${EXPORT_TITLE}</h1>
    <p class="export-report__date">Дата расчёта: ${reportDate}</p>
    <h2>Введённые и рассчитанные параметры</h2>
    ${buildHtmlTable(parameterRows, ['name', 'value', 'unit', 'status'], {
    name: 'Название параметра',
    status: 'Статус',
    unit: 'Ед. изм.',
    value: 'Значение',
  })}
    <h2>Результаты проверок</h2>
    ${buildHtmlTable(checkRows, ['icon', 'title', 'value', 'note'], {
    icon: 'Статус',
    note: 'Пояснение',
    title: 'Проверка',
    value: 'Значение',
  })}
    <h2>2D-чертежи</h2>
    <div class="export-report__drawings">
      <figure><img alt="Вид сбоку" src="${profileImage}" /><figcaption>Вид сбоку</figcaption></figure>
      <figure><img alt="Вид сверху" src="${planImage}" /><figcaption>Вид сверху</figcaption></figure>
    </div>
    <h2>Итоговое заключение</h2>
    <p class="export-report__summary">${summary}</p>
  `;
  document.body.append(container);

  return container;
};

/**
 * Добавляет таблицу в документ Word.
 * @param {object} docx - Глобальный объект docx.js.
 * @param {Array<object>} rows - Строки таблицы.
 * @param {Array<string>} columns - Ключи колонок.
 * @param {object} headers - Подписи колонок.
 * @returns {object} Таблица docx.js.
 */
const createDocxTable = (docx, rows, columns, headers) => {
  const { BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  const border = { color: 'CBD5E1', size: 1, style: BorderStyle.SINGLE };
  const cellBorders = {
    bottom: border,
    left: border,
    right: border,
    top: border,
  };
  const createCell = (text, bold = false) => new TableCell({
    borders: cellBorders,
    children: [
      new Paragraph({
        children: [new TextRun({ bold, text: String(text ?? '') })],
      }),
    ],
  });

  return new Table({
    rows: [
      new TableRow({
        children: columns.map((column) => createCell(headers[column], true)),
      }),
      ...rows.map((row) => new TableRow({
        children: columns.map((column) => createCell(row[column])),
      })),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
};

/**
 * Возвращает статус CSV-строки по близкой проверке.
 * @param {string} parameterName - Название параметра.
 * @param {Array<object>} checks - Проверки расчёта.
 * @returns {'OK'|'Error'|'Warning'} Статус параметра для Excel.
 */
const getParameterStatus = (parameterName, checks) => {
  const lowerName = parameterName.toLowerCase();
  const matchedCheck = checks.find((check) => {
    const title = check.title.toLowerCase();

    return lowerName.includes('ступен') && title.includes('ступен')
      || lowerName.includes('проступ') && title.includes('проступ')
      || lowerName.includes('угол') && title.includes('угол')
      || lowerName.includes('ширина') && title.includes('ширина')
      || lowerName.includes('свес') && title.includes('свес')
      || lowerName.includes('блондел') && title.includes('блондел');
  });

  return STATUS_LABELS[matchedCheck?.status] ?? STATUS_LABELS.ok;
};

/**
 * Строит строки параметров для таблиц экспорта.
 * @param {object} data - Текущие данные расчёта.
 * @returns {Array<{name: string, value: string, unit: string, status: string}>} Строки таблицы параметров.
 */
const buildParameterRows = (data) => {
  const { form, geometry, isSpiral, isWinder, selectedMaterial, selectedShape } = data;
  const rows = [
    { name: 'Форма', unit: '', value: selectedShape },
    { name: 'Материал', unit: '', value: selectedMaterial },
    { name: 'Пожарный тип', unit: '', value: form.fireType },
    { name: 'Высота подъёма H', unit: 'мм', value: formatExportNumber(form.height) },
    { name: 'Количество подъёмов n', unit: 'шт.', value: formatExportNumber(geometry.safeSteps) },
    { name: 'Высота ступени h', unit: 'мм', value: formatExportNumber(geometry.riser, 1) },
    { name: 'Глубина / линия хода b', unit: 'мм', value: formatExportNumber(geometry.activeTread, 1) },
    { name: 'Длина проёма L', unit: 'мм', value: formatExportNumber(geometry.flightLength) },
    { name: 'Угол наклона', unit: '°', value: formatExportNumber(isSpiral ? geometry.spiralSlopeAngle : geometry.slopeAngle, 1) },
    { name: 'Формула Блонделя', unit: 'мм', value: formatExportNumber(geometry.blondel, 1) },
    { name: 'Габарит плана', unit: 'мм', value: `${formatExportNumber(geometry.planLength)} × ${formatExportNumber(geometry.planWidth)}` },
    { name: 'Толщина ступеней W', unit: 'мм', value: formatExportNumber(form.treadThickness) },
    { name: 'Свес проступи F', unit: 'мм', value: formatExportNumber(form.treadOverhang) },
    { name: isSpiral ? 'Толщина центральной стойки T' : 'Толщина тетивы / косоура T', unit: 'мм', value: formatExportNumber(form.stringerThickness) },
    { name: 'Длина тетивы / косоура', unit: 'м', value: formatExportNumber(geometry.stringerLength, 2) },
    { name: 'Расход материала', unit: 'м³', value: formatExportNumber(geometry.totalVolume, 3) },
  ];

  if (!isSpiral) {
    rows.splice(4, 0, { name: 'Ширина марша', unit: 'мм', value: formatExportNumber(form.flightWidth) });
  }

  if (form.shape.includes('platform')) {
    rows.push(
      { name: 'Длина площадки', unit: 'мм', value: formatExportNumber(geometry.landingLength) },
      { name: 'Ступени 1-го марша', unit: 'шт.', value: formatExportNumber(geometry.firstFlightSteps) },
      { name: 'Ступени 2-го марша', unit: 'шт.', value: formatExportNumber(geometry.secondFlightSteps) },
    );
  }

  if (form.shape === 'u-platform') {
    rows.push({ name: 'Ступени 3-го марша', unit: 'шт.', value: formatExportNumber(geometry.thirdFlightSteps) });
  }

  if (isWinder) {
    rows.push(
      { name: 'Поворот', unit: '°', value: formatExportNumber(geometry.turnAngle) },
      { name: 'Радиус поворота по средней линии', unit: 'мм', value: formatExportNumber(geometry.turnRadius) },
      { name: 'Забежные ступени', unit: 'шт.', value: formatExportNumber(geometry.winderSteps) },
      { name: 'Узкий конец забежной', unit: 'мм', value: formatExportNumber(geometry.winderNarrowEnd, 1) },
    );
  }

  if (isSpiral) {
    rows.push(
      { name: 'Внутренний радиус', unit: 'мм', value: formatExportNumber(geometry.innerRadius) },
      { name: 'Внешний радиус', unit: 'мм', value: formatExportNumber(geometry.outerRadius) },
      { name: 'Радиус линии хода', unit: 'мм', value: formatExportNumber(geometry.walkingRadius) },
      { name: 'Ступеней на полный оборот', unit: 'шт.', value: formatExportNumber(geometry.spiralStepsPerTurn, 1) },
      { name: 'Высота между витками', unit: 'мм', value: formatExportNumber(geometry.spiralHeadroom) },
    );
  }

  return rows.map((row) => ({
    ...row,
    status: getParameterStatus(row.name, data.report.checks),
  }));
};

/**
 * Формирует строки проверок для PDF и DOCX.
 * @param {Array<object>} checks - Проверки расчёта.
 * @returns {Array<object>} Строки проверок с текстовым статусом и иконкой.
 */
const buildCheckRows = (checks) => checks.map((check) => ({
  ...check,
  icon: check.status === 'error' ? '❌' : check.status === 'warn' ? '⚠️' : '✅',
  statusText: STATUS_LABELS[check.status] ?? STATUS_LABELS.ok,
}));

/**
 * Возвращает итоговое заключение для отчёта.
 * @param {Array<object>} errors - Ошибки расчёта.
 * @returns {string} Текст соответствия нормам или список ошибок.
 */
const buildSummary = (errors) => {
  if (!errors.length) {
    return 'Соответствует нормам';
  }

  return `Не соответствует нормам: ${errors.map((error) => `${error.title} (${error.value}; требуется: ${error.note})`).join('; ')}`;
};

/**
 * Панель экспорта результатов расчёта лестницы.
 * Создаёт PDF, DOCX, PNG, CSV, JSON и запускает печать без изменения расчётной логики.
 * @param {object} props - Входные данные компонента.
 * @param {object} props.exportData - Текущие параметры, результаты и проверки.
 * @param {React.RefObject<HTMLCanvasElement>} props.planCanvasRef - Ref Canvas вида сверху.
 * @param {React.RefObject<HTMLCanvasElement>} props.profileCanvasRef - Ref Canvas вида сбоку.
 * @returns {JSX.Element} Панель кнопок экспорта.
 */
const ExportPanel = ({ exportData, planCanvasRef, profileCanvasRef }) => {
  const [exportError, setExportError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [pdfOrientation, setPdfOrientation] = useState('landscape');
  const [pngDpi, setPngDpi] = useState(300);
  const [printMode, setPrintMode] = useState('color');
  const parameterRows = useMemo(() => buildParameterRows(exportData), [exportData]);
  const checkRows = useMemo(() => buildCheckRows(exportData.report.checks), [exportData.report.checks]);
  const summary = useMemo(() => buildSummary(exportData.report.errors), [exportData.report.errors]);

  /**
   * Выполняет экспорт с общим прогрессом и обработкой ошибок.
   * @param {string} label - Название операции для UI.
   * @param {Function} task - Асинхронная операция экспорта.
   * @returns {Promise<void>} Промис завершения операции.
   */
  const runExport = async (label, task) => {
    setExportError('');
    setExportStatus(`${label}: подготовка файла...`);

    try {
      await task();
      setExportStatus(`${label}: файл скачан`);
    } catch (error) {
      setExportError(error.message || 'Не удалось выполнить экспорт.');
      setExportStatus('');
    }
  };

  /**
   * Возвращает актуальные изображения Canvas для отчётов.
   * @returns {{profileImage: string, planImage: string}} Data URL изображений.
   */
  const getDrawingImages = () => {
    const profileCanvas = getCanvas(profileCanvasRef, 'Вид сбоку');
    const planCanvas = getCanvas(planCanvasRef, 'Вид сверху');

    return {
      planImage: createFramedCanvas(planCanvas, 'Вид сверху', SCREEN_DPI).toDataURL('image/png'),
      profileImage: createFramedCanvas(profileCanvas, 'Вид сбоку', SCREEN_DPI).toDataURL('image/png'),
    };
  };

  /**
   * Экспортирует отчёт в PDF через html2canvas и jsPDF.
   * @returns {Promise<void>} Промис завершения PDF-экспорта.
   */
  const handleExportPdf = () => runExport('PDF', async () => {
    const [html2canvas, jsPDF] = await Promise.all([ensureHtml2Canvas(), ensureJsPdf()]);
    const reportDate = formatReportDate(new Date());
    const drawings = getDrawingImages();
    const container = createReportContainer({
      ...drawings,
      checkRows,
      parameterRows,
      reportDate,
      summary,
    });

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      const largeDrawing = exportData.geometry.planLength > 5200 || exportData.geometry.planWidth > 2600;
      const pdf = new jsPDF({
        format: largeDrawing ? 'a3' : 'a4',
        orientation: pdfOrientation,
        unit: 'mm',
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const imageData = canvas.toDataURL('image/png');
      let position = 0;
      let remainingHeight = imageHeight;

      pdf.setFont('helvetica', 'normal');
      pdf.addImage(imageData, 'PNG', 0, position, imageWidth, imageHeight);
      remainingHeight -= pageHeight;

      while (remainingHeight > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', 0, position, imageWidth, imageHeight);
        remainingHeight -= pageHeight;
      }

      pdf.save(`stair-report-${getFileTimestamp(new Date())}.pdf`);
    } finally {
      container.remove();
    }
  });

  /**
   * Экспортирует отчёт в DOCX как Office Open XML пакет с таблицами и изображениями.
   * @returns {Promise<void>} Промис завершения DOCX-экспорта.
   */
  const handleExportDocx = () => runExport('Word', async () => {
    const reportDate = formatReportDate(new Date());
    const drawings = getDrawingImages();
    const blob = createDocxBlob({
      ...drawings,
      checkRows,
      parameterRows,
      reportDate,
      summary,
    });
    downloadBlob(blob, `stair-report-${getFileTimestamp(new Date())}.docx`);
  });

  /**
   * Экспортирует общий 2D-чертёж в PNG.
   * @returns {Promise<void>} Промис завершения PNG-экспорта.
   */
  const handleExportPng = () => runExport('PNG', async () => {
    const profileCanvas = getCanvas(profileCanvasRef, 'Вид сбоку');
    const planCanvas = getCanvas(planCanvasRef, 'Вид сверху');
    const dataUrl = createCombinedDrawingDataUrl(profileCanvas, planCanvas, Number(pngDpi));
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, `stair-drawing-${pngDpi}dpi-${getFileTimestamp(new Date())}.png`);
  });

  /**
   * Экспортирует таблицу параметров в CSV с BOM и разделителем `;`.
   * @returns {Promise<void>} Промис завершения CSV-экспорта.
   */
  const handleExportCsv = () => runExport('CSV', async () => {
    const header = ['Название параметра', 'Значение', 'Единица измерения', 'Статус'];
    const lines = [
      header.map(escapeCsvCell).join(';'),
      ...parameterRows.map((row) => [row.name, row.value, row.unit, row.status].map(escapeCsvCell).join(';')),
    ];
    downloadTextFile(`\uFEFF${lines.join('\r\n')}`, `stair-parameters-${getFileTimestamp(new Date())}.csv`, 'text/csv;charset=utf-8');
  });

  /**
   * Экспортирует полный дамп данных в JSON для обмена с другими программами.
   * @returns {Promise<void>} Промис завершения JSON-экспорта.
   */
  const handleExportJson = () => runExport('JSON', async () => {
    const drawings = getDrawingImages();
    const payload = {
      checks: exportData.report.checks,
      drawings,
      form: exportData.form,
      params: parameterRows,
      results: exportData.geometry,
      timestamp: new Date().toISOString(),
    };
    downloadTextFile(JSON.stringify(payload, null, 2), `stair-data-${getFileTimestamp(new Date())}.json`, 'application/json;charset=utf-8');
  });

  /**
   * Запускает печать и временно включает режим цветной или чёрно-белой версии.
   * @returns {void}
   */
  const handlePrint = () => {
    document.body.classList.toggle('print-monochrome', printMode === 'mono');

    const handleAfterPrint = () => {
      document.body.classList.remove('print-monochrome');
      window.removeEventListener('afterprint', handleAfterPrint);
    };

    window.addEventListener('afterprint', handleAfterPrint);
    window.print();
  };

  return (
    <section className="card export-panel no-print" aria-label="Экспорт результатов">
      <div className="export-panel__header">
        <div>
          <h2>Экспорт результатов</h2>
          <p>PDF, Word, PNG, CSV, JSON и версия для печати.</p>
        </div>
        {exportStatus && (
          <div className="export-panel__progress" role="status">
            <span className="export-panel__spinner" aria-hidden="true" />
            {exportStatus}
          </div>
        )}
      </div>

      <div className="export-panel__settings" aria-label="Настройки экспорта">
        <label className="field">
          <span className="field__label">Ориентация PDF</span>
          <select className="field__control" onChange={(event) => setPdfOrientation(event.target.value)} value={pdfOrientation}>
            <option value="portrait">Книжная</option>
            <option value="landscape">Альбомная</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">DPI для PNG</span>
          <select className="field__control" onChange={(event) => setPngDpi(Number(event.target.value))} value={pngDpi}>
            <option value={96}>96 DPI, экран</option>
            <option value={300}>300 DPI, печать</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Печать</span>
          <select className="field__control" onChange={(event) => setPrintMode(event.target.value)} value={printMode}>
            <option value="color">Цветная</option>
            <option value="mono">Чёрно-белая</option>
          </select>
        </label>
      </div>

      <div className="export-panel__actions">
        <button className="button button--primary" onClick={handleExportPdf} type="button">📄 PDF</button>
        <button className="button" onClick={handleExportDocx} type="button">📝 Word</button>
        <button className="button" onClick={handleExportPng} type="button">🖼️ Скачать чертёж (PNG)</button>
        <button className="button" onClick={handleExportCsv} type="button">📊 CSV</button>
        <button className="button" onClick={handleExportJson} type="button">💾 JSON</button>
        <button className="button" onClick={handlePrint} type="button">🖨️ Печать</button>
      </div>

      {exportError && <p className="export-panel__error" role="alert">{exportError}</p>}
    </section>
  );
};

export default ExportPanel;
