import omml2mathml from 'omml2mathml'
import { MathMLToLaTeX } from 'mathml-to-latex'
import getDom from 'get-dom'

const sample =
  '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>'

const dom = getDom.document()
const doc = new dom.defaultView.DOMParser().parseFromString(sample, 'text/xml')
const mathEl = omml2mathml(doc.documentElement)
const mathml = mathEl.outerHTML || mathEl.toString()
const latex = MathMLToLaTeX.convert(mathml)
console.log('latex:', latex)
