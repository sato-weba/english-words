import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { parts, type StudyCard } from './data/chapters'

const cover = `${import.meta.env.BASE_URL}covers/zato.jpg`
const LAST_PART_KEY = 'english-words-last-part'

function readLastPart(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PART_KEY)
    if (raw == null) return null
    const value = Number(raw)
    if (!Number.isInteger(value) || value < 0 || value >= parts.length) return null
    return value
  } catch {
    return null
  }
}

function writeLastPart(part: number) {
  try {
    localStorage.setItem(LAST_PART_KEY, String(part))
  } catch {
    // 保存できない環境では、表示だけ今回の画面内に残す
  }
}

type Slot = {
  id: string
  title?: string
  image?: string
}

const slots: Slot[] = [
  {
    id: 'zato',
    title: 'Z.A.T.O. // I Love the World and Everything In It',
    image: cover,
  },
  { id: 'empty-2' },
  { id: 'empty-3' },
  { id: 'empty-4' },
  { id: 'empty-5' },
  { id: 'empty-6' },
]

type Screen =
  | { name: 'home' }
  | { name: 'parts' }
  | { name: 'study'; part: number; index: number }

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [lastPart, setLastPart] = useState<number | null>(readLastPart)
  const partListScroll = useRef(0)

  function openPart(part: number) {
    writeLastPart(part)
    setLastPart(part)
    setScreen({ name: 'study', part, index: 0 })
  }

  return (
    <main className="app">
      {screen.name === 'home' && (
        <Home onOpen={() => {
          partListScroll.current = 0
          setScreen({ name: 'parts' })
        }} />
      )}
      {screen.name === 'parts' && (
        <PartList
          scrollMemory={partListScroll}
          lastPart={lastPart}
          onBack={() => setScreen({ name: 'home' })}
          onOpen={openPart}
        />
      )}
      {screen.name === 'study' && (
        <WordScreen
          key={screen.part}
          cards={parts[screen.part]}
          index={screen.index}
          onBack={() => setScreen({ name: 'parts' })}
          onIndex={(index) => setScreen({ ...screen, index })}
          onNextPart={screen.part < parts.length - 1 ? () => openPart(screen.part + 1) : undefined}
        />
      )}
    </main>
  )
}

function Home({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="home" aria-label="作品">
      {slots.map((slot) => (
        slot.image ? (
          <button key={slot.id} className="book" onClick={onOpen}>
            <span className="book-title">{slot.title}</span>
            <img className="book-art" src={slot.image} alt="" />
          </button>
        ) : (
          <div key={slot.id} className="book book-empty" aria-hidden="true">
            <span className="book-title" />
            <span className="book-art" />
          </div>
        )
      ))}
    </section>
  )
}

function PartList({
  scrollMemory,
  lastPart,
  onBack,
  onOpen,
}: {
  scrollMemory: RefObject<number>
  lastPart: number | null
  onBack: () => void
  onOpen: (part: number) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const total = parts.reduce((sum, part) => sum + part.length, 0)

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    element.scrollTop = scrollMemory.current
    return () => {
      scrollMemory.current = element.scrollTop
    }
  }, [scrollMemory])

  function showLastPart() {
    scroller.current
      ?.querySelector<HTMLElement>('[data-last="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <section className="menu">
      <header className="words-top">
        <button className="text-button" onClick={onBack}>作品</button>
        <div className="menu-corner">
          {lastPart != null && (
            <button className="last-studied" onClick={showLastPart}>
              前回 Part {lastPart + 1}
            </button>
          )}
          <span className="count">{total}語</span>
        </div>
      </header>
      <div className="menu-scroll" ref={scroller}>
        <h1 className="menu-title">Z.A.T.O.</h1>
        <ul className="menu-list">
          {parts.map((part, index) => (
            <li key={index}>
              <button
                className={`menu-row${lastPart === index ? ' is-last' : ''}`}
                data-last={lastPart === index ? 'true' : undefined}
                onClick={() => onOpen(index)}
              >
                <span className="menu-name">Part {index + 1}</span>
                <span className="menu-meta">
                  {lastPart === index && <span className="last-tag">前回</span>}
                  {part.length}語
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function WordScreen({
  cards,
  index,
  onBack,
  onIndex,
  onNextPart,
}: {
  cards: StudyCard[]
  index: number
  onBack: () => void
  onIndex: (index: number) => void
  onNextPart?: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const card = cards[index]

  function move(next: number) {
    setRevealed(false)
    onIndex(next)
  }

  return (
    <section className="words">
      <header className="words-top">
        <button className="text-button" onClick={onBack}>パート</button>
        <span className="count">{index + 1} / {cards.length}</span>
      </header>
      <div className="track" aria-hidden="true">
        <span style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
      </div>
      <div className="words-body" key={card.word}>
        <p className="word">{card.word}</p>
        <p className={`gloss${revealed ? ' show' : ''}`}>{revealed ? card.gloss : ''}</p>
        <div className="passage">
          <p className="sentence">
            <Marked text={card.example} mark={card.exampleMark} revealed={revealed} />
          </p>
          {card.exampleJa ? (
            <p className="sentence ja">
              <Marked text={card.exampleJa} mark={card.jaMark} revealed={revealed} />
            </p>
          ) : null}
        </div>
      </div>
      {index === cards.length - 1 && onNextPart && (
        <button className="next-part" onClick={onNextPart}>次のパートへ</button>
      )}
      <div className="controls">
        <button
          className="round"
          aria-label="前の単語"
          disabled={index === 0}
          onClick={() => move(index - 1)}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M20 7 L11 16 L20 25" />
          </svg>
        </button>
        <button
          className={`round round-main${revealed ? ' is-open' : ''}`}
          aria-label={revealed ? '意味を隠す' : '意味を表示'}
          onClick={() => setRevealed((open) => !open)}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="9" y="9" width="14" height="14" />
          </svg>
        </button>
        <button
          className="round"
          aria-label="次の単語"
          disabled={index === cards.length - 1}
          onClick={() => move(index + 1)}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M12 7 L21 16 L12 25" />
          </svg>
        </button>
      </div>
    </section>
  )
}

function Marked({ text, mark, revealed }: { text: string; mark: string; revealed: boolean }) {
  const at = text.toLowerCase().indexOf(mark.toLowerCase())
  if (at < 0 || !mark) return text
  const before = text.slice(0, at)
  const hit = text.slice(at, at + mark.length)
  const after = text.slice(at + mark.length)
  return (
    <>
      {before}
      {revealed ? <span className="accent">{hit}</span> : <span className="blank" style={{ width: `${Math.max(hit.length, 2)}ch` }} />}
      {after}
    </>
  )
}
