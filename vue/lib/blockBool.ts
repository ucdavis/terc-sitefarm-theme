/**
 * Read a block checkbox as a boolean, whatever form the value arrived in:
 * PDB saves a checkbox as 1/0 (or "1"/"0" once it has been through the
 * form), while props written into a template's `data-terc-props` JSON can
 * be real booleans or the strings "true"/"false". Anything else is off.
 */
export function blockBool(v: boolean | number | string | undefined | null): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}
