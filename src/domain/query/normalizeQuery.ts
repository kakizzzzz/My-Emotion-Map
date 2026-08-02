const CHARACTER_ALIASES: Record<string, string> = {
  臺: '台',
  圖: '图',
  館: '馆',
  學: '学',
  樓: '楼',
  門: '门',
  餐: '餐',
  靜: '静',
};

export const normalizeQueryText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[臺圖館學樓門靜]/g, (character) => CHARACTER_ALIASES[character] ?? character)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenizeQuery = (value: string) => {
  const normalized = normalizeQueryText(value);
  const tokens = new Set(normalized.match(/[a-z0-9]+|[\uac00-\ud7a3]+/g) ?? []);
  const cjkRuns = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length <= 2) tokens.add(run);
    else {
      for (let index = 0; index < run.length - 1; index += 1) {
        tokens.add(run.slice(index, index + 2));
      }
    }
  }
  return [...tokens].slice(0, 40);
};
