import type { Card, Deck, Grade, Memory } from './types'

const DAY = 24 * 60 * 60 * 1000

export function reviewMemory(previous: Memory | undefined, grade: Grade, now: number): Memory {
  const current = previous ?? { ease: 2.5, intervalDays: 0, due: now, reps: 0, lapses: 0 }
  if (grade === 'again') {
    return {
      ease: Math.max(1.3, current.ease - 0.2),
      intervalDays: 0,
      due: now,
      reps: current.reps,
      lapses: current.lapses + 1,
    }
  }
  const reps = current.reps + 1
  let intervalDays = 1
  if (reps === 2) intervalDays = 3
  else if (reps > 2) intervalDays = Math.max(1, Math.round((current.intervalDays || 1) * current.ease))
  return {
    ease: current.ease + 0.1,
    intervalDays,
    due: now + intervalDays * DAY,
    reps,
    lapses: current.lapses,
  }
}

export function isRemembered(memory: Memory | undefined, now: number): boolean {
  return !!memory && memory.reps > 0 && memory.intervalDays >= 1 && memory.due > now
}

export function queueCards(
  deck: Deck,
  episode: string,
  memory: Record<string, Memory>,
  now: number,
  limit = 20,
): Card[] {
  const due: Card[] = []
  const fresh: Card[] = []
  for (const card of deck.cards) {
    if (card.kind !== 'word') continue
    if (episode && !card.episodes.includes(episode)) continue
    const item = memory[card.lemma]
    if (!item) fresh.push(card)
    else if (item.due <= now) due.push(card)
  }
  fresh.sort((a, b) => b.episodeCount - a.episodeCount || b.count - a.count)
  due.sort((a, b) => (memory[a.lemma]?.due ?? 0) - (memory[b.lemma]?.due ?? 0))
  return [...due, ...fresh].slice(0, limit)
}

export function rememberedCount(deck: Deck, memory: Record<string, Memory>, now: number): number {
  return deck.cards.filter((card) => card.kind === 'word' && isRemembered(memory[card.lemma], now)).length
}

export function wordCount(deck: Deck): number {
  return deck.cards.filter((card) => card.kind === 'word').length
}
