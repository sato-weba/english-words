import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sampleDeck } from './sampleDeck'
import { reviewMemory } from './srs'
import type { Deck, Grade, Memory } from './types'
import { parseDeckJson } from './types'

type Store = {
  decks: Deck[]
  memory: Record<string, Memory>
  glosses: Record<string, string>
  importDeck: (deck: Deck) => void
  importDeckText: (text: string) => Deck
  loadSample: () => void
  removeDeck: (id: string) => void
  grade: (lemma: string, grade: Grade) => void
  setGloss: (lemma: string, gloss: string) => void
}

function upsert(decks: Deck[], deck: Deck): Deck[] {
  return decks.some((item) => item.id === deck.id)
    ? decks.map((item) => (item.id === deck.id ? deck : item))
    : [...decks, deck]
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      decks: [],
      memory: {},
      glosses: {},
      importDeck: (deck) => set((state) => ({ decks: upsert(state.decks, deck) })),
      importDeckText: (text) => {
        const deck = parseDeckJson(text)
        get().importDeck(deck)
        return deck
      },
      loadSample: () => get().importDeck(sampleDeck),
      removeDeck: (id) => set((state) => ({ decks: state.decks.filter((deck) => deck.id !== id) })),
      grade: (lemma, grade) => set((state) => ({
        memory: {
          ...state.memory,
          [lemma]: reviewMemory(state.memory[lemma], grade, Date.now()),
        },
      })),
      setGloss: (lemma, gloss) => set((state) => ({
        glosses: { ...state.glosses, [lemma]: gloss.trim() },
      })),
    }),
    { name: 'english-words-v1' },
  ),
)
