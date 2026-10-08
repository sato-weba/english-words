import { useState } from 'react'
import { parts, type StudyCard } from './data/chapters'

const cover = `${import.meta.env.BASE_URL}covers/zato.jpg`

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

  return (
    <main className="app">
      {screen.name === 'home' && (
        <Home onOpen={() => setScreen({ name: 'parts' })} />
      )}
      {screen.name === 'parts' && (
        <PartList
          onBack={() => setScreen({ name: 'home' })}
          onOpen={(part) => setScreen({ name: 'study', part, index: 0 })}
        />
      )}
      {screen.name === 'study' && (
        <WordScreen
          cards={parts[screen.part]}
          index={screen.index}
          onBack={() => setScreen({ name: 'parts' })}
          onIndex={(index) => setScreen({ ...screen, index })}
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

function PartList({ onBack, onOpen }: { onBack: () => void; onOpen: (part: number) => void }) {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  return (
    <section className="menu">
      <header className="words-top">
        <button className="text-button" onClick={onBack}>作品</button>
        <span className="count">{total}語</span>
      </header>
      <h1 className="menu-title">Z.A.T.O.</h1>
      <ul className="menu-list">
        {parts.map((part, index) => (
          <li key={index}>
            <button className="menu-row" onClick={() => onOpen(index)}>
              <span className="menu-name">Part {index + 1}</span>
              <span className="menu-meta">{part.length}語</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WordScreen({
  cards,
  index,
  onBack,
  onIndex,
}: {
  cards: StudyCard[]
  index: number
  onBack: () => void
  onIndex: (index: number) => void
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
