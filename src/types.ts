export type CardKind = 'word' | 'term'

export type Card = {
  id: string
  lemma: string
  pos: string
  count: number
  episodeCount: number
  episodes: string[]
  gloss: string
  example: string
  kind: CardKind
}

export type EpisodeStat = {
  id: string
  title: string
  tokenCount: number
}

export type Deck = {
  id: string
  title: string
  extractedAt: string
  tokenCount: number
  coveredTokens: number
  limit: number
  episodes: EpisodeStat[]
  cards: Card[]
}

export type Memory = {
  ease: number
  intervalDays: number
  due: number
  reps: number
  lapses: number
}

export type Grade = 'again' | 'good'

export function posLabel(pos: string): string {
  switch (pos) {
    case 'verb':
      return '動詞'
    case 'noun':
      return '名詞'
    case 'adjective':
      return '形容詞'
    case 'adverb':
      return '副詞'
    case 'proper':
      return '固有名詞'
    default:
      return '語'
  }
}

export function coveragePercent(deck: Deck): number {
  if (!deck.tokenCount) return 0
  return Math.round((deck.coveredTokens / deck.tokenCount) * 100)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function parseDeckJson(text: string): Deck {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSONとして読めませんでした。')
  }
  const root = asRecord(parsed)
  if (!root || typeof root.id !== 'string' || typeof root.title !== 'string' || !Array.isArray(root.cards)) {
    throw new Error('単語リストの形式ではありません。')
  }
  const id = root.id.trim()
  if (!id) throw new Error('作品IDが空です。')

  const cards: Card[] = root.cards.map((item, index) => {
    const card = asRecord(item)
    if (!card || typeof card.lemma !== 'string' || !card.lemma.trim()) {
      throw new Error(`${index + 1}件目の単語が不正です。`)
    }
    const episodes = Array.isArray(card.episodes)
      ? card.episodes.filter((episode): episode is string => typeof episode === 'string')
      : []
    return {
      id: typeof card.id === 'string' && card.id.trim() ? card.id : `${id}:${card.lemma}:${index}`,
      lemma: card.lemma.trim().toLowerCase(),
      pos: typeof card.pos === 'string' ? card.pos : 'other',
      count: typeof card.count === 'number' ? card.count : 1,
      episodeCount: typeof card.episodeCount === 'number' ? card.episodeCount : episodes.length || 1,
      episodes,
      gloss: typeof card.gloss === 'string' ? card.gloss : '',
      example: typeof card.example === 'string' ? card.example : '',
      kind: card.kind === 'term' ? 'term' : 'word',
    }
  })

  const episodes: EpisodeStat[] = Array.isArray(root.episodes)
    ? root.episodes.flatMap((item) => {
        const episode = asRecord(item)
        if (!episode || typeof episode.id !== 'string') return []
        return [{
          id: episode.id,
          title: typeof episode.title === 'string' ? episode.title : episode.id,
          tokenCount: typeof episode.tokenCount === 'number' ? episode.tokenCount : 0,
        }]
      })
    : []

  return {
    id,
    title: root.title.trim() || id,
    extractedAt: typeof root.extractedAt === 'string' ? root.extractedAt : new Date().toISOString(),
    tokenCount: typeof root.tokenCount === 'number' ? root.tokenCount : 0,
    coveredTokens: typeof root.coveredTokens === 'number' ? root.coveredTokens : 0,
    limit: typeof root.limit === 'number' ? root.limit : cards.filter((card) => card.kind === 'word').length,
    episodes,
    cards,
  }
}
