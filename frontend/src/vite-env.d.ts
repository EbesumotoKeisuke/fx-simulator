/**
 * Vite環境変数の型定義
 *
 * import.meta.envで使用可能な環境変数の型を定義します。
 * .envファイルで定義したVITE_プレフィックスの変数はここに追加してください。
 */

/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    /** APIのベースURL */
    readonly VITE_API_URL?: string
    // 他の環境変数をここに追加
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
