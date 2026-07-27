import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TAXONOMY_REGISTRY } from '../server/teacher/topicTaxonomy/registry.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jsonPath = resolve(root, 'shared/topicTaxonomy.json')
const tsPath = resolve(root, 'src/data/topicTaxonomyRegistry.ts')

writeFileSync(jsonPath, JSON.stringify(TAXONOMY_REGISTRY, null, 2), 'utf8')
writeFileSync(
  tsPath,
  `/** 自动生成，勿手改。运行: node _scripts/export-topic-taxonomy-json.mjs */\nexport const TAXONOMY_REGISTRY = ${JSON.stringify(TAXONOMY_REGISTRY, null, 2)} as const\n`,
  'utf8',
)
console.log('exported', Object.keys(TAXONOMY_REGISTRY).length, 'taxonomy keys')
