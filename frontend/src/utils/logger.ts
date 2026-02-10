/**
 * ログ管理ユーティリティ
 *
 * フロントエンドアプリケーション全体で使用するログ機能を提供します。
 * ログはコンソールに出力され、ERROR/CRITICALレベルのログは
 * バックエンドAPIを通じてファイルに記録されます。
 *
 * ログレベル:
 * - DEBUG: デバッグ情報（開発時のみ）
 * - INFO: 情報（処理完了、ユーザー操作など）
 * - WARNING: 警告（リトライ発生、パフォーマンス低下など）
 * - ERROR: エラー（API失敗、バリデーションエラーなど）
 * - CRITICAL: 重大エラー（アプリケーションエラー、致命的な問題など）
 */

/**
 * ログレベル定義
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
  CRITICAL = 4,
}

/**
 * ログレベル名称マッピング
 */
const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARNING]: 'WARNING',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.CRITICAL]: 'CRITICAL',
}

/**
 * ログエントリーの構造
 */
interface LogEntry {
  timestamp: string
  level: LogLevel
  levelName: string
  source: string
  message: string
  data?: unknown
}

/**
 * バックエンドへ送信するログリクエストの構造
 */
interface LogRequest {
  level: string
  source: string
  message: string
  data?: unknown
  userAgent: string
  url: string
  timestamp: string
}

/**
 * ロガークラス
 *
 * シングルトンパターンで実装し、アプリケーション全体で
 * 統一されたログ出力を提供します。
 */
class Logger {
  private static instance: Logger
  private logLevel: LogLevel
  private logs: LogEntry[] = []
  private maxLogs: number = 1000
  private sendToBackend: boolean

  private constructor() {
    // 環境に応じてログレベルを設定
    const isDevelopment = import.meta.env.DEV
    this.logLevel = isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
    this.sendToBackend = !isDevelopment
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * ログレベルを設定
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * バックエンド送信を有効/無効にする
   */
  public setSendToBackend(enabled: boolean): void {
    this.sendToBackend = enabled
  }

  /**
   * 日本時間（JST）のタイムスタンプを取得
   */
  private getJSTTimestamp(): string {
    const now = new Date()
    // JSTオフセット（+9時間）を適用
    const jstOffset = 9 * 60 * 60 * 1000
    const jst = new Date(now.getTime() + jstOffset)
    return jst.toISOString().replace('T', ' ').substring(0, 19)
  }

  /**
   * ログを出力
   */
  private log(level: LogLevel, source: string, message: string, data?: unknown): void {
    // 設定されたログレベル未満のログはスキップ
    if (level < this.logLevel) {
      return
    }

    const entry: LogEntry = {
      timestamp: this.getJSTTimestamp(),
      level,
      levelName: LogLevelNames[level],
      source,
      message,
      data,
    }

    // メモリ内ログに追加
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // コンソール出力
    this.outputToConsole(entry)

    // ERROR/CRITICALはバックエンドに送信
    if (this.sendToBackend && level >= LogLevel.ERROR) {
      this.sendLogToBackend(entry)
    }
  }

  /**
   * コンソールに出力
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.levelName}] [${entry.source}]`
    const logMessage = entry.data
      ? `${prefix} ${entry.message}`
      : `${prefix} ${entry.message}`

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage, entry.data ?? '')
        break
      case LogLevel.INFO:
        console.info(logMessage, entry.data ?? '')
        break
      case LogLevel.WARNING:
        console.warn(logMessage, entry.data ?? '')
        break
      case LogLevel.ERROR:
        console.error(logMessage, entry.data ?? '')
        break
      case LogLevel.CRITICAL:
        console.error(`🚨 ${logMessage}`, entry.data ?? '')
        break
    }
  }

  /**
   * バックエンドにログを送信
   */
  private async sendLogToBackend(entry: LogEntry): Promise<void> {
    try {
      const request: LogRequest = {
        level: entry.levelName,
        source: entry.source,
        message: entry.message,
        data: entry.data,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: entry.timestamp,
      }

      await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
    } catch (error) {
      // バックエンドへの送信失敗は静かに無視
      // （無限ループを防ぐためログ出力しない）
      console.warn('Failed to send log to backend:', error)
    }
  }

  /**
   * DEBUGログを出力
   */
  public debug(source: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, source, message, data)
  }

  /**
   * INFOログを出力
   */
  public info(source: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, source, message, data)
  }

  /**
   * WARNINGログを出力
   */
  public warning(source: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARNING, source, message, data)
  }

  /**
   * ERRORログを出力
   */
  public error(source: string, message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, source, message, data)
  }

  /**
   * CRITICALログを出力
   */
  public critical(source: string, message: string, data?: unknown): void {
    this.log(LogLevel.CRITICAL, source, message, data)
  }

  /**
   * 保持しているログを取得
   */
  public getLogs(): LogEntry[] {
    return [...this.logs]
  }

  /**
   * 保持しているログをクリア
   */
  public clearLogs(): void {
    this.logs = []
  }
}

/**
 * ロガーインスタンス（エクスポート用）
 */
export const logger = Logger.getInstance()

/**
 * デフォルトエクスポート
 */
export default logger
