import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nlp from 'compromise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DICT_PATH = path.join(root, 'dict', 'ejdict.txt')

const SKIP_LINE = new Set([
  'define', 'default', 'image', 'scene', 'show', 'hide', 'play', 'stop', 'queue',
  'window', 'camera', 'with', 'pause', 'call', 'jump', 'return', 'python', 'init',
  'transform', 'screen', 'style', 'layeredimage', 'label', 'menu', 'if', 'elif',
  'else', 'while', 'pass', 'contains', 'onlayer', 'zorder', 'at', 'as', 'behind',
  'expression', 'predict', 'fixed', 'vbox', 'hbox', 'textbutton', 'add', 'frame',
  'viewport', 'null', 'use', 'has', 'imagemap', 'hotspot', 'key', 'timer',
])

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
`.split(/\s+/).filter(Boolean))

function parseArgs(argv) {
  const positional = []
  const flags = { limit: 400, id: '', title: '', dict: true }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--limit') flags.limit = Number(argv[++index])
    else if (arg === '--id') flags.id = argv[++index] ?? ''
    else if (arg === '--title') flags.title = argv[++index] ?? ''
    else if (arg === '--no-dict') flags.dict = false
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg.startsWith('--')) throw new Error(`不明なオプションです: ${arg}`)
    else positional.push(arg)
  }
  return { dir: positional[0], ...flags }
}

function printHelp() {
  console.log(`使い方:
  npm run extract -- <台本フォルダ> --id <作品id> --title "<作品名>" [--limit 400]

例:
  npm run extract -- sources/zato/game --id zato --title "Z.A.T.O."

.rpy と .txt を読み、decks/<作品id>.json を書き出します。
訳は初回だけ公開ドメインの英和辞書 ejdict-hand を dict/ejdict.txt に保存して引きます。`)
}

function cleanDialogue(raw) {
  return raw
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\[[^\]]*\]/g, '')
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

function dialogueFrom(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return []
  const first = trimmed.split(/\s+/)[0]?.replace(/:$/, '') ?? ''
  if (SKIP_LINE.has(first) || first.startsWith('$')) return []
  if (!trimmed.includes('"')) return []
  return quotesIn(trimmed).map(cleanDialogue).filter((text) => /[A-Za-z]/.test(text) && text.length > 1)
}

async function walkScripts(dir) {
  const files = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'tl' || entry.name === 'cache' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walkScripts(full))
    else if (/\.(rpy|txt)$/i.test(entry.name)) files.push(full)
  }
  return files
}

function glossFromSense(sense) {
  const cleaned = sense
    .replace(/《[^》]*》/g, '')
    .replace(/〈[^〉]*〉/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/『|』/g, '')
  const parts = cleaned
    .split(/[、,，]/)
    .map((part) => part.trim().replace(/^[をにへでと]/, ''))
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

async function ensureDict() {
  try {
    await access(DICT_PATH)
    return
  } catch {
    // 初回だけ取得する
  }
  console.log('英和辞書を取得しています…')
  await mkdir(path.dirname(DICT_PATH), { recursive: true })
  const letters = [...'abcdefghijklmnopqrstuvwxyz']
  const parts = new Array(letters.length)
  for (let index = 0; index < letters.length; index += 6) {
    const slice = letters.slice(index, index + 6)
    await Promise.all(slice.map(async (letter, offset) => {
      const response = await fetch(`https://raw.githubusercontent.com/kujirahand/EJDict/master/src/${letter}.txt`)
      if (!response.ok) throw new Error(`辞書(${letter})を取得できませんでした (${response.status})`)
      parts[index + offset] = await response.text()
    }))
  }
  await writeFile(DICT_PATH, parts.join('\n'), 'utf8')
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
  const lemma = String(term.root || term.normal || term.text || '')
    .toLowerCase()
    .replace(/^'+|'+$/g, '')
    .replace(/[^a-z'-]/g, '')
  if (!lemma || lemma.length < 2 || !/[a-z]/.test(lemma)) return null
  if (tags.has('ProperNoun') && !FUNCTION_WORDS.has(lemma)) {
    return { lemma, pos: 'proper', kind: 'term' }
  }
  if (FUNCTION_WORDS.has(lemma) || [...FUNCTION_TAGS].some((tag) => tags.has(tag))) {
    return { lemma, pos: 'function', kind: 'function' }
  }
  let pos = 'other'
  if (tags.has('Verb')) pos = 'verb'
  else if (tags.has('Adjective')) pos = 'adjective'
  else if (tags.has('Adverb')) pos = 'adverb'
  else if (tags.has('Noun')) pos = 'noun'
  else return { lemma, pos: 'function', kind: 'function' }
  return { lemma, pos, kind: 'word' }
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
  if (terms.length > 0) return terms
  return (sentence.toLowerCase().match(/[a-z][a-z'-]*/g) || [])
    .map((lemma) => (
      FUNCTION_WORDS.has(lemma)
        ? { lemma, pos: 'function', kind: 'function' }
        : { lemma, pos: 'other', kind: 'word' }
    ))
    .filter((info) => info.lemma.length > 1)
}

function bestPos(votes) {
  let pos = 'other'
  let count = -1
  for (const [name, value] of votes) {
    if (value > count) {
      pos = name
      count = value
    }
  }
  return pos
}

function clip(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.dir) {
    printHelp()
    return
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error('--limit は1以上の数にしてください。')

  const sourceDir = path.resolve(args.dir)
  const files = await walkScripts(sourceDir)
  if (files.length === 0) {
    throw new Error(`${sourceDir} に .rpy も .txt もありません。.rpa だけの場合は、先に台本を展開してください。`)
  }

  const rows = new Map()
  const episodeStats = []
  let tokenCount = 0
  let functionTokens = 0

  for (const file of files) {
    const episode = path.relative(sourceDir, file).replaceAll('\\', '/').replace(/\.(rpy|txt)$/i, '')
    const text = await readFile(file, 'utf8')
    let episodeTokens = 0
    for (const line of text.split(/\r?\n/)) {
      for (const sentence of dialogueFrom(line)) {
        for (const info of termsIn(sentence)) {
          tokenCount += 1
          episodeTokens += 1
          if (info.kind === 'function') {
            functionTokens += 1
            continue
          }
          let row = rows.get(info.lemma)
          if (!row) {
            row = {
              lemma: info.lemma,
              count: 0,
              episodes: new Set(),
              pos: new Map(),
              example: clip(sentence),
              kind: info.kind,
            }
            rows.set(info.lemma, row)
          }
          row.count += 1
          row.episodes.add(episode)
          row.pos.set(info.pos, (row.pos.get(info.pos) || 0) + 1)
          if (info.kind === 'term') row.kind = 'term'
        }
      }
    }
    episodeStats.push({ id: episode, title: episode, tokenCount: episodeTokens })
  }

  const content = [...rows.values()].filter((row) => row.kind === 'word')
  content.sort((a, b) => b.episodes.size - a.episodes.size || b.count - a.count || a.lemma.localeCompare(b.lemma))
  const selected = content.slice(0, args.limit)
  const terms = [...rows.values()]
    .filter((row) => row.kind === 'term' && row.count >= 2)
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma))
    .slice(0, 80)

  let coveredTokens = functionTokens
  for (const row of selected) coveredTokens += row.count
  for (const row of terms) coveredTokens += row.count

  let dict = new Map()
  if (args.dict) {
    await ensureDict()
    dict = loadDict(await readFile(DICT_PATH, 'utf8'))
  }

  const id = (args.id || path.basename(sourceDir)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'game'
  const cards = [...selected, ...terms].map((row) => ({
    id: `${id}:${row.lemma}`,
    lemma: row.lemma,
    pos: row.kind === 'term' ? 'proper' : bestPos(row.pos),
    count: row.count,
    episodeCount: row.episodes.size,
    episodes: [...row.episodes],
    gloss: pickGloss(dict.get(row.lemma) || '', row.kind === 'term' ? 'noun' : bestPos(row.pos)),
    example: row.example,
    kind: row.kind,
  }))

  const deck = {
    id,
    title: args.title || id,
    extractedAt: new Date().toISOString(),
    tokenCount,
    coveredTokens,
    limit: args.limit,
    episodes: episodeStats,
    cards,
  }

  const output = path.join(root, 'decks', `${id}.json`)
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(deck, null, 2)}\n`, 'utf8')

  const coverage = tokenCount ? Math.round((coveredTokens / tokenCount) * 100) : 0
  console.log(`${output}`)
  console.log(`内容語 ${selected.length} / 用語 ${terms.length} / カバー ${coverage}% / 延べ ${tokenCount}語`)
  console.log(selected.slice(0, 12).map((row) => row.lemma).join(', '))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
