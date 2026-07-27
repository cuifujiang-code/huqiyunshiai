/**
 * Vercel：waitUntil 延长生命周期；Express 本地：直接挂起 Promise 并捕获异常
 */
export function runInBackground(work) {
  const promise = typeof work === 'function' ? work() : work
  if (!promise || typeof promise.then !== 'function') {
    throw new TypeError('runInBackground 需要 Promise 或返回 Promise 的函数')
  }
  promise.catch((err) => {
    console.error('[runInBackground] 后台任务失败', err)
  })
  import('@vercel/functions')
    .then(({ waitUntil }) => {
      if (typeof waitUntil === 'function') waitUntil(promise)
    })
    .catch(() => { /* 非 Vercel 环境 */ })
  return promise
}
