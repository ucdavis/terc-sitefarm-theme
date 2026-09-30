/**
 * Editor-owned plain text -> paragraphs (TERC-9, TERC-98).
 *
 * Block settings are plain textareas, not rich text: a blank line starts a
 * new paragraph, and everything else collapses to a single space so a
 * hand-wrapped field does not render with ragged internal breaks. Shared by
 * both shells so the two blocks treat an editor's text identically.
 *
 * Deliberately returns TEXT, never HTML: the result is rendered through
 * Vue's interpolation, so nothing an editor types can inject markup. The
 * one place HTML from the site is rendered is the destination description,
 * which is Drupal's own filtered `processed` output (see locations.ts).
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * An editor-owned value, or the shipped default when the field is blank.
 *
 * Emptying a setting in the block form means "put it back to how it was",
 * which is what the field descriptions promise; it cannot mean "render an
 * empty heading". A field that is meant to be switchable off (safetyText)
 * does not use this.
 */
export function textOrDefault(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback
}
