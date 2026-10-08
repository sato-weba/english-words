import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nlp from 'compromise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'sources', 'zato-script')
const dictPath = path.join(root, 'dict', 'ejdict.txt')
const outputPath = path.join(root, 'src', 'data', 'zatoChapters.json')

const CHAPTERS = [
  { id: 'script', title: '序章', file: 'script.rpy' },
  { id: 'ep1', title: 'Episode 1', file: 'ep1.rpy' },
  { id: 'ep2d1', title: 'Episode 2 · Day 1', file: 'ep2d1.rpy' },
  { id: 'ep2d2', title: 'Episode 2 · Day 2', file: 'ep2d2.rpy' },
  { id: 'ep2d3', title: 'Episode 2 · Day 3', file: 'ep2d3.rpy' },
  { id: 'ep2d4', title: 'Episode 2 · Day 4', file: 'ep2d4.rpy' },
  { id: 'ep2d5', title: 'Episode 2 · Day 5', file: 'ep2d5.rpy' },
  { id: 'ep2d6', title: 'Episode 2 · Day 6', file: 'ep2d6.rpy' },
  { id: 'ep2d7', title: 'Episode 2 · Day 7', file: 'ep2d7.rpy' },
  { id: 'ep3', title: 'Episode 3', file: 'ep3.rpy' },
]

const MIN_COUNT = 5
const PART_SIZE = 10

const FUNCTION_TAGS = new Set([
  'Pronoun', 'Determiner', 'Preposition', 'Conjunction', 'Auxiliary', 'Copula',
  'QuestionWord', 'Negative', 'Value',
])

const FUNCTION_WORDS = new Set(`
a an the
i you he she it we they me him her us them
my your his its our their mine yours hers ours theirs
this that these those
am is are was were be been being
do does did doing done
have has had having
will would shall should can could may might must
not no nor
and or but if because while although though
of to in on at for from by with as into onto upon over under after before about between against during without within
there here when where why how what which who whom whose
than then so
up down out off
im ive ill id dont cant wont isnt arent wasnt werent didnt doesnt hasnt havent hadnt
couldnt wouldnt shouldnt thats theres heres whats lets youre youve youll theyre theyve
theyll weve well wed youd hed shed itd aint gonna wanna kinda sorta
`.split(/\s+/).filter(Boolean))

function cleanDialogue(raw) {
  return raw
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/%%/g, '%')
    .replace(/\s+/g, ' ')
    .trim()
}

function quotesIn(line) {
  const quotes = []
  const pattern = /"((?:\\.|[^"\\])*)"/g
  let match = pattern.exec(line)
  while (match) {
    quotes.push(match[1])
    match = pattern.exec(line)
  }
  return quotes
}

function isDialogue(text) {
  if (!text || text.length < 12 || !/[A-Za-z]{3}/.test(text)) return false
  if (/^(show|hide|play|stop|scene|window|camera|pause|call|jump|queue|with)\b/i.test(text)) return false
  if (/\b(fadeout|fadein|dissolve|hpunch)\b/i.test(text) && text.split(/\s+/).length < 6) return false
  return true
}

function sentencesIn(text) {
  const found = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const quoted = quotesIn(trimmed)
    const pieces = quoted.length > 0 ? quoted : [trimmed]
    for (const piece of pieces) {
      const sentence = cleanDialogue(piece)
      if (isDialogue(sentence)) found.push(sentence)
    }
  }
  return found
}

function glossFromSense(sense) {
  const cleaned = sense
    .replace(/《[^》]*》/g, '')
    .replace(/〈[^〉]*〉/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/『|』/g, '')
  const parts = cleaned
    .replace(/;/g, '、')
    .split(/[、,，]/)
    .map((part) => part.trim().replace(/^[.…・\s]+/, '').replace(/^[をにへでと]/, ''))
    .filter((part) => /[ぁ-んァ-ン一-龯]/.test(part))
  return parts.slice(0, 2).join('、')
}

function senseScore(sense, pos) {
  const core = glossFromSense(sense).split('、')[0]?.replace(/[.…・]/g, '') ?? ''
  if (!core) return 0
  const verbLike = /(する|できる|せる|れる)$/.test(core) || /[うくぐすずつぬぶむる]$/.test(core)
  if (pos === 'verb') return verbLike ? 3 : 0
  if (pos === 'adjective') return /[なに]$/.test(core) || /い$/.test(core) ? 3 : 0
  if (pos === 'adverb') return /[くに]$/.test(core) ? 2 : 0
  if (verbLike) return 0
  return /〈[CU]〉/.test(sense) ? 3 : 1
}

function pickGloss(raw, pos) {
  if (!raw) return ''
  const senses = raw.split(' / ').map((sense) => sense.trim()).filter(Boolean)
  let best = ''
  let bestScore = 0
  for (const sense of senses) {
    const score = senseScore(sense, pos)
    if (score > bestScore) {
      best = glossFromSense(sense)
      bestScore = score
    }
  }
  if (!best) best = glossFromSense(senses[0] || '')
  return best.length > 42 ? `${best.slice(0, 41)}…` : best
}

function loadDict(text) {
  const map = new Map()
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf('\t')
    if (tab < 1) continue
    const head = line.slice(0, tab).trim().toLowerCase()
    if (!/^[a-z][a-z'-]*$/.test(head) || map.has(head)) continue
    const gloss = line.slice(tab + 1).trim()
    if (gloss) map.set(head, gloss)
  }
  return map
}

function classify(term) {
  const tags = new Set(term.tags || [])
  const surface = String(term.text || '').replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
  const lemma = String(term.root || term.normal || term.text || '')
    .toLowerCase()
    .replace(/^'+|'+$/g, '')
    .replace(/[^a-z'-]/g, '')
  if (!lemma || lemma.length < 2 || !/[a-z]/.test(lemma) || !surface) return null
  if (FUNCTION_WORDS.has(lemma) || [...FUNCTION_TAGS].some((tag) => tags.has(tag))) return null
  if (tags.has('ProperNoun')) return null
  let pos = 'other'
  if (tags.has('Verb')) pos = 'verb'
  else if (tags.has('Adjective')) pos = 'adjective'
  else if (tags.has('Adverb')) pos = 'adverb'
  else if (tags.has('Noun')) pos = 'noun'
  else return null
  return { lemma, pos, surface }
}

function termsIn(sentence) {
  const doc = nlp(sentence)
  doc.compute('root')
  const packed = doc.json({ terms: { tags: true, root: true, normal: true, text: true } })
  const terms = []
  for (const sentenceJson of packed) {
    for (const term of sentenceJson.terms || []) {
      const info = classify(term)
      if (info) terms.push(info)
    }
  }
  return terms
}

function bestPos(votes) {
  let pos = 'noun'
  let count = -1
  for (const [name, value] of votes) {
    if (name === 'other') continue
    if (value > count) {
      pos = name
      count = value
    }
  }
  return pos
}

function clip(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean
}

function exampleScore(sentence) {
  const length = sentence.length
  if (length < 24) return 0
  if (length > 160) return 1
  return 3
}

const rows = new Map()

for (const chapter of CHAPTERS) {
  const text = await readFile(path.join(sourceDir, chapter.file), 'utf8')
  for (const sentence of sentencesIn(text)) {
    const seen = new Set()
    for (const info of termsIn(sentence)) {
      if (seen.has(info.lemma)) continue
      seen.add(info.lemma)
      let row = rows.get(info.lemma)
      if (!row) {
        row = { lemma: info.lemma, count: 0, pos: new Map(), chapters: new Map() }
        rows.set(info.lemma, row)
      }
      row.count += 1
      row.pos.set(info.pos, (row.pos.get(info.pos) || 0) + 1)
      let bucket = row.chapters.get(chapter.id)
      if (!bucket) {
        bucket = { count: 0, example: '', surface: '', score: -1 }
        row.chapters.set(chapter.id, bucket)
      }
      bucket.count += 1
      const score = exampleScore(sentence)
      const mark = info.surface
      const usable = sentence.toLowerCase().includes(mark.toLowerCase())
      if (usable && score > bucket.score) {
        bucket.example = clip(sentence)
        bucket.surface = mark
        bucket.score = score
      }
    }
  }
}

const dict = loadDict(await readFile(dictPath, 'utf8'))
const selected = [...rows.values()].filter((row) => row.count >= MIN_COUNT && row.chapters.size > 0)

const grouped = new Map(CHAPTERS.map((chapter) => [chapter.id, []]))
for (const row of selected) {
  const chapter = CHAPTERS.find((item) => row.chapters.has(item.id))
  if (!chapter) continue
  const bucket = row.chapters.get(chapter.id)
  if (!bucket?.example || !bucket.surface) continue
  const pos = bestPos(row.pos)
  const gloss = pickGloss(dict.get(row.lemma) || '', pos)
  if (!gloss) continue
  grouped.get(chapter.id).push({
    word: row.lemma,
    gloss,
    example: bucket.example,
    exampleMark: bucket.surface,
    exampleJa: '',
    jaMark: '',
    count: bucket.count,
    total: row.count,
  })
}

const chapters = CHAPTERS.map((chapter) => {
  const words = grouped.get(chapter.id)
  words.sort((a, b) => b.count - a.count || b.total - a.total || a.word.localeCompare(b.word))
  const parts = []
  for (let index = 0; index < words.length; index += PART_SIZE) {
    parts.push(words.slice(index, index + PART_SIZE).map(({ count, total, ...card }) => card))
  }
  return { id: chapter.id, title: chapter.title, parts }
})

const deck = { chapters }
await writeFile(outputPath, `${JSON.stringify(deck)}\n`, 'utf8')

const total = chapters.reduce((sum, chapter) => sum + chapter.parts.reduce((partSum, part) => partSum + part.length, 0), 0)
console.log(`${outputPath}`)
console.log(`words ${total}`)
for (const chapter of chapters) {
  const count = chapter.parts.reduce((sum, part) => sum + part.length, 0)
  console.log(`${chapter.title}\t${count}\tparts ${chapter.parts.length}`)
}
