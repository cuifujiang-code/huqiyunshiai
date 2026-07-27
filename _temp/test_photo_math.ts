import { preparePhotoSearchMath, looksLikeMathSegment } from '../src/lib/photoSearchMath.ts'

const samples = [
  'Y~B(4, 2/3), E(X)=2+2E(Y)=2+2×4×(2/3)=2+16/3=22/3',
  'd_i=P_{i+1}-P_i, \\sum_{i=0}^{11}d_i=0',
  '(1) E(X)=6; (2)(ii) P_6=1/2',
]

for (const t of samples) {
  console.log('---')
  console.log('in:', t.slice(0, 60))
  console.log('looks:', looksLikeMathSegment(t))
  console.log('out:', preparePhotoSearchMath(t).slice(0, 120))
}
