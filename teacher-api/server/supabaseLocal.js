import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'teacherapi',
  user: process.env.PG_USER || 'teacherapi',
  password: process.env.PG_PASSWORD || 'huqiyunshiai_db_2024',
  max: 10,
  idleTimeoutMillis: 30000,
})

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || 'postgresql://127.0.0.1:5432/teacherapi'
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || 'local_pg_service_role'
}

export function isSupabaseAdminConfigured() {
  return true
}

/** 安全转义 PostgreSQL 标识符（表名/列名），防止 SQL 注入 */
function safeIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

/** Postgrest 风格 Query Builder（兼容 supabase-js API） */
class PostgrestBuilder {
  constructor(table, client, method) {
    this._tbl = table
    this._client = client
    this._method = method || 'select'
    this._sel = '*'
    this._wheres = []
    this._vals = []
    this._data = null
    this._orderCol = null
    this._orderAsc = true
    this._lim = null
    this._off = null
    this._single = false
    this._maybeSingle = false
    this._cols = null
  }

  select(columns) {
    this._method = 'select'
    this._sel = columns || '*'
    return this
  }

  insert(data, _opts) {
    this._method = 'insert'
    this._data = Array.isArray(data) ? data : [data]
    this._cols = this._data.length > 0 ? Object.keys(this._data[0]) : []
    return this
  }

  update(data, _opts) {
    this._method = 'update'
    this._data = data
    return this
  }

  delete(_opts) {
    this._method = 'delete'
    return this
  }

  eq(column, value) {
    this._vals.push(value)
    this._wheres.push(`${safeIdent(column)} = $${this._vals.length}`)
    return this
  }

  ilike(column, value) {
    this._vals.push(value)
    this._wheres.push(`${safeIdent(column)} ILIKE $${this._vals.length}`)
    return this
  }

  order(column, opts) {
    this._orderCol = column
    if (opts && opts.ascending === false) {
      this._orderAsc = false
    }
    return this
  }

  limit(n) {
    this._lim = n
    return this
  }

  range(from, to) {
    this._off = from
    this._lim = to - from + 1
    return this
  }

  single() {
    this._single = true
    return this
  }

  maybeSingle() {
    this._maybeSingle = true
    return this
  }

  _build() {
    var sql = ''
    switch (this._method) {
      case 'select':
        sql = 'SELECT ' + this._sel + ' FROM ' + safeIdent(this._tbl)
        break
      case 'insert': {
        if (!this._data || this._data.length === 0) {
          sql = 'INSERT INTO ' + safeIdent(this._tbl) + ' DEFAULT VALUES RETURNING *'
          break
        }
        var colNames = this._cols.map(function (c) { return safeIdent(c) })
        var placeholders = []
        this._data.forEach(function (row, rowIdx) {
          var rowPlaceholders = []
          var keys = Object.keys(row)
          keys.forEach(function (col, colIdx) {
            var idx = rowIdx * keys.length + colIdx + 1
            rowPlaceholders.push('$' + idx)
          })
          placeholders.push('(' + rowPlaceholders.join(', ') + ')')
        })
        // Push all values in order
        this._data.forEach(function (row) {
          var keys = Object.keys(row)
          keys.forEach(function (col) {
            this._vals.push(row[col])
          }.bind(this))
        }.bind(this))
        sql = 'INSERT INTO ' + safeIdent(this._tbl) + ' (' + colNames.join(', ') + ') VALUES ' + placeholders.join(', ') + ' RETURNING *'
        break
      }
      case 'update': {
        if (!this._data) break
        var sets = []
        var keys = Object.keys(this._data)
        keys.forEach(function (col, idx) {
          this._vals.push(this._data[col])
          sets.push(safeIdent(col) + ' = $' + this._vals.length)
        }.bind(this))
        sql = 'UPDATE ' + safeIdent(this._tbl) + ' SET ' + sets.join(', ')
        break
      }
      case 'delete':
        sql = 'DELETE FROM ' + safeIdent(this._tbl)
        break
    }
    if (this._wheres.length > 0 && this._method !== 'insert') {
      sql += ' WHERE ' + this._wheres.join(' AND ')
    }
    if (this._orderCol) {
      sql += ' ORDER BY ' + safeIdent(this._orderCol) + ' ' + (this._orderAsc ? 'ASC' : 'DESC')
    }
    if (this._lim !== null) {
      this._vals.push(this._lim)
      sql += ' LIMIT $' + this._vals.length
    }
    if (this._off !== null && this._method !== 'insert') {
      this._vals.push(this._off)
      sql += ' OFFSET $' + this._vals.length
    }
    return sql
  }

  async _exec() {
    var sql = this._build()
    if (!sql) {
      return { data: null, error: { message: 'Empty query built' } }
    }
    try {
      var result = await (this._client || pool).query(sql, this._vals)
      if (this._single) {
        if (result.rows.length === 0) {
          return { data: null, error: { message: 'No rows returned', code: 'PGRST116' } }
        }
        return { data: result.rows[0], error: null }
      }
      if (this._maybeSingle) {
        if (result.rows.length === 0) {
          return { data: null, error: null }
        }
        return { data: result.rows[0], error: null }
      }
      return { data: result.rows, error: null }
    } catch (err) {
      return { data: null, error: { message: String(err.message || err), code: err.code || 'UNKNOWN' } }
    }
  }
}

// 使 PostgrestBuilder 可被 await（thenable）
// 关键：永远 resolve（不 reject），匹配 supabase-js 行为——调用方通过 {data, error} 判断
PostgrestBuilder.prototype.then = function (resolve, _reject) {
  return this._exec().then(function (result) {
    if (result.error) {
      // 确保 error.message 是字符串，防止 [object Object]
      result.error.message = result.error.message || String(result.error)
    }
    resolve(result)
  }).catch(function (err) {
    // 框架级异常（如连接断开）→ 包装为 {data:null, error:{message}}
    resolve({ data: null, error: { message: String(err.message || err) } })
  })
}

class LocalSupabaseClient {
  from(table) {
    return new PostgrestBuilder(table, pool)
  }

  // Storage stub（本地 PG 模式不支持 Supabase Storage）
  get storage() {
    var self = this
    var emptyResult = { data: null, error: { message: 'Storage not available in local PG mode' } }
    return {
      getBucket: function () { return Promise.resolve(emptyResult) },
      createBucket: function () { return Promise.resolve({ data: { name: 'local' }, error: null }) },
      from: function () {
        return {
          upload: function () { return Promise.resolve({ data: null, error: null }) },
          getPublicUrl: function () {
            return { data: { publicUrl: '' } }
          },
        }
      },
    }
  }
}

var _client = null

export function createServiceRoleClient() {
  if (!_client) {
    console.log('[supabaseLocal] 使用本地 PostgreSQL (127.0.0.1:5432/teacherapi)')
    _client = new LocalSupabaseClient()
  }
  return _client
}

export function getSupabaseAdmin() {
  return createServiceRoleClient()
}

// Storage 相关 stub
export function isSupabaseStorageConfigured() {
  return false // 本地 PG 无 Storage
}

export function getBatchImagesBucket() {
  return 'batch-exam-images'
}

export function ensureBatchImagesBucket() {
  return Promise.reject(new Error('Storage not available in local PG mode'))
}

export function uploadBatchImage() {
  return Promise.reject(new Error('Storage not available in local PG mode'))
}

export function uploadQuestionImage() {
  return Promise.reject(new Error('Storage not available in local PG mode'))
}
