/**
 * ロガーユーティリティのテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger, LogLevel } from '../utils/logger'

describe('Logger', () => {
  beforeEach(() => {
    // コンソール出力をモック
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // fetch をモック
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })

    // ログをクリア
    logger.clearLogs()

    // テスト用にログレベルをDEBUGに設定
    logger.setLogLevel(LogLevel.DEBUG)

    // テスト用にバックエンド送信を無効化
    logger.setSendToBackend(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ログ出力', () => {
    it('DEBUGログを出力できる', () => {
      logger.debug('TestSource', 'デバッグメッセージ')

      expect(console.debug).toHaveBeenCalled()
      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('DEBUG')
      expect(logs[0].message).toBe('デバッグメッセージ')
    })

    it('INFOログを出力できる', () => {
      logger.info('TestSource', '情報メッセージ')

      expect(console.info).toHaveBeenCalled()
      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('INFO')
    })

    it('WARNINGログを出力できる', () => {
      logger.warning('TestSource', '警告メッセージ')

      expect(console.warn).toHaveBeenCalled()
      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('WARNING')
    })

    it('ERRORログを出力できる', () => {
      logger.error('TestSource', 'エラーメッセージ')

      expect(console.error).toHaveBeenCalled()
      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('ERROR')
    })

    it('CRITICALログを出力できる', () => {
      logger.critical('TestSource', '重大エラーメッセージ')

      expect(console.error).toHaveBeenCalled()
      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('CRITICAL')
    })
  })

  describe('ログレベル制御', () => {
    it('設定されたレベル未満のログはスキップされる', () => {
      logger.setLogLevel(LogLevel.WARNING)
      logger.debug('TestSource', 'デバッグメッセージ')
      logger.info('TestSource', '情報メッセージ')
      logger.warning('TestSource', '警告メッセージ')

      expect(console.debug).not.toHaveBeenCalled()
      expect(console.info).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalled()

      const logs = logger.getLogs()
      expect(logs.length).toBe(1)
      expect(logs[0].levelName).toBe('WARNING')
    })
  })

  describe('ログデータ', () => {
    it('追加データを含めてログを出力できる', () => {
      const data = { key: 'value', count: 42 }
      logger.info('TestSource', 'データ付きメッセージ', data)

      const logs = logger.getLogs()
      expect(logs[0].data).toEqual(data)
    })

    it('ソース情報が正しく記録される', () => {
      logger.info('MyComponent', 'テストメッセージ')

      const logs = logger.getLogs()
      expect(logs[0].source).toBe('MyComponent')
    })

    it('タイムスタンプが記録される', () => {
      logger.info('TestSource', 'テストメッセージ')

      const logs = logger.getLogs()
      expect(logs[0].timestamp).toBeDefined()
      expect(logs[0].timestamp).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
    })
  })

  describe('ログ管理', () => {
    it('ログをクリアできる', () => {
      logger.info('TestSource', 'メッセージ1')
      logger.info('TestSource', 'メッセージ2')
      expect(logger.getLogs().length).toBe(2)

      logger.clearLogs()
      expect(logger.getLogs().length).toBe(0)
    })

    it('ログ数が上限を超えると古いログが削除される', () => {
      // maxLogs は 1000 に設定されているため、テスト用に多数のログを作成
      for (let i = 0; i < 1005; i++) {
        logger.debug('TestSource', `メッセージ ${i}`)
      }

      const logs = logger.getLogs()
      expect(logs.length).toBe(1000)
      // 最新のログが残っていることを確認
      expect(logs[logs.length - 1].message).toBe('メッセージ 1004')
    })
  })

  describe('バックエンド送信', () => {
    it('ERROR以上のログはバックエンドに送信される', async () => {
      logger.setSendToBackend(true)
      logger.error('TestSource', 'エラーメッセージ')

      // 非同期処理を待つ
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/logs',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
    })

    it('WARNING以下のログはバックエンドに送信されない', async () => {
      logger.setSendToBackend(true)
      logger.warning('TestSource', '警告メッセージ')

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})
