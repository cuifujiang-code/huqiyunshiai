import { extractEmbeddedFigures, mergeEmbeddedFigures } from '../src/lib/embeddedImages'

const img =
  '<img src="data:image/png;base64,iVBORw0KGgo=" alt="图形" class="book-figure max-w-full h-auto my-2" />'
const raw = `text before\n${img}\ntext after`
const { text, figures } = extractEmbeddedFigures(raw)
console.log('collapsed:', text)
console.log('figure count:', figures.length)
console.log('roundtrip ok:', mergeEmbeddedFigures(text, figures).includes('base64'))
