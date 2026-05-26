import * as sdk from '@alicloud/ocr-api20210707'
import { $OpenApiUtil } from '@alicloud/openapi-core'

const Client = sdk.default?.default ?? sdk.default ?? sdk
console.log('Client', typeof Client)
console.log('RecognizeHandwritingRequest', typeof sdk.RecognizeHandwritingRequest)

const cfg = new $OpenApiUtil.Config({
  accessKeyId: 'test',
  accessKeySecret: 'test',
  endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com',
})

const client = new Client(cfg)
console.log('client ok', typeof client.recognizeHandwriting)
