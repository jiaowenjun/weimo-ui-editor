import { useEffect, useRef, useState, type RefObject } from 'react'
import { WdfView, type WdfViewHandle } from 'weimo-ui-editor/components/wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * WdfView 演示页(仅 site):比较真实卡片高度的两种退出动画。
 * 强制 inline,确保窄视口也能观察同一路径;采样卡片和 footer 的实际
 * DOM 高度,区分「只淡出图标」与「卡片底边连续收拢」。
 */

function ComparisonCard({
  editorRef,
  animation,
}: {
  editorRef: RefObject<WdfViewHandle | null>
  animation: 'visual' | 'overlay'
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [measurement, setMeasurement] = useState('退出高度采样：等待退出编辑。')

  useEffect(() => {
    const card = hostRef.current?.querySelector<HTMLElement>('.wdf-view__card')
    const toolbar = card?.querySelector<HTMLElement>('.wdf-view__toolbar')
    if (!card || !toolbar) return

    let frame = 0
    let recording = false
    let samples: { card: number; toolbar: number }[] = []
    const read = () => samples.push({
      card: card.getBoundingClientRect().height,
      toolbar: toolbar.getBoundingClientRect().height,
    })
    const sample = () => {
      if (!recording) return
      read()
      frame = window.requestAnimationFrame(sample)
    }
    const observer = new MutationObserver(() => {
      if (card.dataset.phase === 'closing' && !recording) {
        recording = true
        samples = []
        setMeasurement('正在采样卡片和工具栏的退出高度…')
        sample()
      } else if (card.dataset.phase === 'view' && recording) {
        recording = false
        window.cancelAnimationFrame(frame)
        read()
        const first = samples[0]
        const last = samples[samples.length - 1]
        const describe = (key: 'card' | 'toolbar', label: string) => {
          const low = Math.min(first[key], last[key])
          const high = Math.max(first[key], last[key])
          const intermediate = samples.filter((value) =>
            value[key] > low + 0.1 && value[key] < high - 0.1,
          ).length
          return `${label} ${first[key].toFixed(1)} → ${last[key].toFixed(1)}px，中间高度采样 ${intermediate} 次`
        }
        setMeasurement(`${describe('card', '卡片')}；${describe('toolbar', '工具栏')}。`)
      }
    })
    observer.observe(card, { attributes: true, attributeFilter: ['data-phase'] })
    return () => {
      recording = false
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={hostRef}>
      <WdfView
        defaultValue={wdfRenderSample as WdfDocument}
        editStyle="inline"
        inlineToolbarExitAnimation={animation}
        ref={editorRef}
        title={animation === 'visual' ? '原占位内收拢' : '浮层卡片收拢'}
      />
      <div className="wdf-view-exit-comparison__reference">下方内容参照条</div>
      <output className="wdf-view-exit-comparison__measurement">{measurement}</output>
    </div>
  )
}

function WdfViewDemo() {
  const visualRef = useRef<WdfViewHandle>(null)
  const overlayRef = useRef<WdfViewHandle>(null)
  return (
    <div className="wdf-view-exit-comparison">
      <div className="wdf-view-exit-comparison__controls">
        <button onClick={() => {
          visualRef.current?.open()
          overlayRef.current?.open()
        }} type="button">同时进入编辑</button>
        <button onClick={() => {
          visualRef.current?.close()
          overlayRef.current?.close()
        }} type="button">同时保存退出</button>
        <span>观察卡片底边、参照条，以及退出后的中间高度采样次数。</span>
      </div>
      <section className="wdf-view-exit-comparison__item">
        <div className="wdf-view-exit-comparison__intro">
          <strong>方案一 · 原占位内收拢</strong>
          <span>卡片和工具栏同步收高，结束后下方内容再上移。</span>
        </div>
        <ComparisonCard animation="visual" editorRef={visualRef} />
      </section>
      <section className="wdf-view-exit-comparison__item">
        <div className="wdf-view-exit-comparison__intro">
          <strong>方案二 · 先释放占位再收拢</strong>
          <span>下方内容先上移，整张浮层卡片收高，期间会短暂覆盖参照条。</span>
        </div>
        <ComparisonCard animation="overlay" editorRef={overlayRef} />
      </section>
    </div>
  )
}

export const wdfViewDefinition = {
  id: 'wdf-view',
  summary:
    'WdfView 内联退出高度动画对比：原占位内收拢与先释放占位再收拢',
  status: 'Preview',
  frame: 'plain',
  preview: () => <WdfViewDemo />,
} satisfies ComponentDefinition
