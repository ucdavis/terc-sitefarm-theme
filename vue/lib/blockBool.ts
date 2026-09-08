/**
 * PDB checkbox settings arrive as 1/0, "1"/"0", or booleans depending on
 * how the value travelled (form save vs. template props). One reading.
 */
export function blockBool(v: boolean | number | string | undefined | null): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}
