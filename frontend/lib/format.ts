/** 1840 → "1,840" */
export const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** 3 → "03": step and chapter numbers */
export const nn = (n: number) => String(n).padStart(2, '0');
