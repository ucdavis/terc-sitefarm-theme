import { describe, expect, it } from 'vitest'
import { adaptRegistry } from '../locations'

/** Minimal JSON:API document: one destination, no stations. */
function doc(body: unknown) {
  return {
    data: [
      {
        type: 'node--lake_locations',
        id: 'uuid-1',
        attributes: {
          title: 'Incline Village',
          field_location_id: 'incline-village',
          field_location_geo_data: { lat: 39.25, lng: -119.95 },
          body,
        },
      },
    ],
  }
}

describe('registry: location description (TERC-9)', () => {
  it('surfaces the body as Drupal rendered it — processed, never value', () => {
    const [d] = adaptRegistry(
      doc({
        value: '<p>raw <script>x()</script></p>',
        format: 'basic_html',
        processed: '<p>North shore, warms earliest.</p>',
        summary: '',
      }),
    ).destinations
    expect(d.description).toBe('<p>North shore, warms earliest.</p>')
  })

  it('treats an empty or whitespace-only body as no description', () => {
    for (const body of [null, undefined, { processed: '' }, { processed: '  \n' }]) {
      const [d] = adaptRegistry(doc(body)).destinations
      expect(d.description).toBeUndefined()
      expect('description' in d).toBe(false)
    }
  })
})
