import { countMissingAnswersOnClient } from './handoutImportUtils'

export { parseWorkbuddyJson, detectMissingAnswersOnClient, pdfFileToPageImages } from './handoutImportUtils'

export function countMissingAnswers(modules: { missingAnswer?: boolean }[]): number {
  return countMissingAnswersOnClient(modules as import('../types/teacher').HandoutModule[])
}
