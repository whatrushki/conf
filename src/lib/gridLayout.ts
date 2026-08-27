/** Раскладка видео-сетки: все тайлы ровно в видимую область, без скролла. */

export type GridLayout = {
  cols: number;
  rows: number;
  /** последнее окно тянем на всю ширину, если в последнем ряду одно */
  stretchLast: boolean;
};

/**
 * Mobile: максимум 2 колонки, 2 человека — столбик.
 * Desktop: 2 колонки, при >4 участниках — 4 колонки.
 */
export function computeConferenceGrid(
  count: number,
  isMobile: boolean,
  containerW = 0,
  containerH = 0
): GridLayout {
  const n = Math.max(1, count);

  if (n === 1) {
    return { cols: 1, rows: 1, stretchLast: false };
  }

  if (isMobile) {
    if (n === 2) {
      return { cols: 1, rows: 2, stretchLast: false };
    }
    const cols = 2;
    const rows = Math.ceil(n / cols);
    return { cols, rows, stretchLast: n % cols === 1 };
  }

  // Desktop: 2, затем 4
  if (n === 2) {
    return { cols: 2, rows: 1, stretchLast: false };
  }
  if (n <= 4) {
    const cols = 2;
    const rows = Math.ceil(n / cols);
    return { cols, rows, stretchLast: n % cols === 1 };
  }

  // >4: пробуем 4 колонки; если контейнер узкий — оставляем 2
  let cols = 4;
  if (containerW > 0 && containerH > 0) {
    const rows4 = Math.ceil(n / 4);
    const rows2 = Math.ceil(n / 2);
    const cell4 = (containerW / 4) * (containerH / rows4);
    const cell2 = (containerW / 2) * (containerH / rows2);
    // выбираем вариант с большей площадью ячейки (крупнее окна)
    cols = cell4 >= cell2 ? 4 : 2;
  }

  const rows = Math.ceil(n / cols);
  return { cols, rows, stretchLast: n % cols === 1 };
}
