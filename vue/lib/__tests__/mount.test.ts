// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountAll, registerBlocks } from '../mount'

const Probe = defineComponent({
  props: { title: { type: String, default: 'default-title' } },
  setup(props) {
    return () => h('span', { class: 'probe' }, props.title)
  },
})

registerBlocks({ 'test-probe': Probe })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('mountAll', () => {
  it('mounts every placeholder under the context', () => {
    document.body.innerHTML = `
      <div data-terc-block="test-probe"></div>
      <div data-terc-block="test-probe" data-terc-props='{"title":"second"}'></div>`
    mountAll(document)
    const probes = document.querySelectorAll('.probe')
    expect(probes).toHaveLength(2)
    expect(probes[0].textContent).toBe('default-title')
    expect(probes[1].textContent).toBe('second')
  })

  it('mounts the context element itself when it is the placeholder (AJAX-inserted block)', () => {
    // PR review finding: Drupal.attachBehaviors passes the inserted element
    // as context; querySelectorAll alone would skip a root placeholder.
    const el = document.createElement('div')
    el.setAttribute('data-terc-block', 'test-probe')
    document.body.appendChild(el)
    mountAll(el)
    expect(el.querySelector('.probe')).not.toBeNull()
  })

  it('never mounts the same placeholder twice', () => {
    document.body.innerHTML = '<div data-terc-block="test-probe"></div>'
    mountAll(document)
    mountAll(document)
    mountAll(document.body.firstElementChild as Element)
    expect(document.querySelectorAll('.probe')).toHaveLength(1)
  })

  it('survives invalid props JSON and mounts with defaults', () => {
    document.body.innerHTML = `<div data-terc-block="test-probe" data-terc-props='{broken'></div>`
    mountAll(document)
    expect(document.querySelector('.probe')?.textContent).toBe('default-title')
  })
})
