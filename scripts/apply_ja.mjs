import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const deckPath = path.join(root, 'src', 'data', 'zatoChapters.json')
const deck = JSON.parse(await readFile(deckPath, 'utf8'))

const parts = []
for (const name of ['ja-01.json', 'ja-02.json', 'ja-03.json', 'ja-04.json', 'ja-05.json', 'ja-06.json']) {
  parts.push(...JSON.parse(await readFile(path.join(root, 'scripts', name), 'utf8')))
}

const cards = deck.chapters.flatMap((chapter) => chapter.parts.flat())
const order = []
const seen = new Set()
for (const card of cards) {
  if (seen.has(card.example)) continue
  seen.add(card.example)
  order.push(card.example)
}

if (parts.length !== order.length) {
  throw new Error(`訳 ${parts.length} 件 / 例文 ${order.length} 件`)
}

const byExample = new Map()
for (let index = 0; index < order.length; index += 1) {
  byExample.set(order[index], parts[index])
}

const missing = []
for (const card of cards) {
  const row = byExample.get(card.example)
  const spec = row?.m?.[card.word]
  if (!row || !spec) {
    missing.push(`${card.word}: no spec`)
    continue
  }
  const [mark, gloss] = spec.split('|')
  if (!row.ja.includes(mark)) missing.push(`${card.word}: 「${mark}」が訳に無い / ${row.ja}`)
  card.exampleJa = row.ja
  card.jaMark = mark
  card.gloss = gloss || mark
}

if (missing.length) {
  console.error(missing.slice(0, 40).join('\n'))
  throw new Error(`訳の不整合 ${missing.length} 件`)
}

await writeFile(deckPath, `${JSON.stringify(deck)}\n`, 'utf8')
console.log(`cards ${cards.length}`)
