/** Build a real v1.0 .npy buffer the same way NumPy does — shared test fixture. */
export function buildNpy(shape: number[], values: number[], fortranOrder = false): ArrayBuffer {
  let header = `{'descr': '<f8', 'fortran_order': ${fortranOrder ? 'True' : 'False'}, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`
  // Pad so total header size (10 + len) is a multiple of 64, newline-terminated.
  const total = Math.ceil((10 + header.length + 1) / 64) * 64
  header = header.padEnd(total - 10 - 1, ' ') + '\n'
  const buf = new ArrayBuffer(total + values.length * 8)
  const bytes = new Uint8Array(buf)
  bytes.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0])
  new DataView(buf).setUint16(8, header.length, true)
  for (let i = 0; i < header.length; i++) bytes[10 + i] = header.charCodeAt(i)
  new Float64Array(buf, total).set(values)
  return buf
}
