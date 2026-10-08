import raw from './zatoChapters.json'

export type StudyCard = {
  word: string
  gloss: string
  example: string
  exampleMark: string
  exampleJa: string
  jaMark: string
}

const PART_SIZE = 10

const cards = (raw.chapters as { parts: StudyCard[][] }[]).flatMap((chapter) => chapter.parts.flat())

export const parts: StudyCard[][] = []
for (let index = 0; index < cards.length; index += PART_SIZE) {
  parts.push(cards.slice(index, index + PART_SIZE))
}
