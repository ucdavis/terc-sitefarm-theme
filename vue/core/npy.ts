/**
 * Minimal NumPy .npy parser — no dependency (TERC-38).
 *
 * Format: \x93NUMPY | major | minor | header-len | python-dict header | data.
 * v1.0 header length is a uint16 LE at byte 8; v2.0+ is uint32 LE.
 * The header is a Python dict literal like:
 *   {'descr': '<f8', 'fortran_order': False, 'shape': (174, 102), }
 *
 * Pure and environment-free on purpose: TERC-47 moves decoding into a Web
 * Worker, and this module must be importable there unchanged.
 */

export interface NpyArray {
  descr: string
  fortranOrder: boolean
  shape: number[]
  data: Float64Array
}

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59] // \x93NUMPY

export function parseNpy(buf: ArrayBuffer): NpyArray {
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Not a .npy file (bad magic bytes)')
  }
  const major = bytes[6]
  const view = new DataView(buf)

  let headerLen: number
  let dataStart: number
  if (major === 1) {
    headerLen = view.getUint16(8, true)
    dataStart = 10 + headerLen
  } else if (major === 2 || major === 3) {
    headerLen = view.getUint32(8, true)
    dataStart = 12 + headerLen
  } else {
    throw new Error(`Unsupported .npy version ${major}`)
  }

  const headerStr = new TextDecoder('latin1').decode(
    bytes.subarray(major === 1 ? 10 : 12, dataStart),
  )

  const descrMatch = headerStr.match(/'descr'\s*:\s*'([^']+)'/)
  const fortranMatch = headerStr.match(/'fortran_order'\s*:\s*(True|False)/)
  const shapeMatch = headerStr.match(/'shape'\s*:\s*\(([^)]*)\)/)
  if (!descrMatch || !fortranMatch || !shapeMatch) {
    throw new Error(`Unparseable .npy header: ${headerStr}`)
  }
  const descr = descrMatch[1]
  const fortranOrder = fortranMatch[1] === 'True'
  const shape = shapeMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number.parseInt(s, 10))

  const count = shape.reduce((a, b) => a * b, 1)

  let data: Float64Array
  if (descr === '<f8') {
    // npy pads headers so data is 64-byte aligned, but copy defensively if not.
    if (dataStart % 8 === 0) {
      data = new Float64Array(buf, dataStart, count)
    } else {
      data = new Float64Array(buf.slice(dataStart, dataStart + count * 8))
    }
  } else if (descr === '<f4') {
    const f32 = new Float32Array(buf.slice(dataStart, dataStart + count * 4))
    data = Float64Array.from(f32)
  } else {
    throw new Error(`Unsupported dtype '${descr}' (only <f8 / <f4 handled)`)
  }
  if (data.length !== count) {
    throw new Error(`.npy size mismatch: header says ${count}, buffer has ${data.length}`)
  }

  if (fortranOrder && shape.length === 2) {
    // Transpose column-major -> row-major so callers can always index C-style.
    const [rows, cols] = shape
    const out = new Float64Array(count)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) out[r * cols + c] = data[c * rows + r]
    }
    return { descr, fortranOrder, shape, data: out }
  }
  if (fortranOrder && shape.length > 2) {
    throw new Error('fortran_order not supported for >2D arrays')
  }

  return { descr, fortranOrder, shape, data }
}
