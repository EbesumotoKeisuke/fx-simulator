# -*- coding: utf-8 -*-
"""
Claude Desktop MCP 設定ファイル自動生成スクリプト

このスクリプトは、Claude Desktop が FX Simulator の MCP サーバーに
接続するための設定ファイルを自動生成します。
"""

import json
import os
import sys
from pathlib import Path


def get_backend_path() -> str:
    """バックエンドディレクトリの絶対パスを取得"""
    # このスクリプトは backend/scripts/ にあるため、2つ上がbackendディレクトリ
    script_dir = Path(__file__).parent
    backend_dir = script_dir.parent
    return str(backend_dir.resolve()).replace("\\", "\\\\")


def get_config_path() -> Path:
    """Claude Desktop 設定ファイルのパスを取得"""
    # Windows: %APPDATA%\Claude\claude_desktop_config.json
    appdata = os.environ.get("APPDATA")
    if not appdata:
        raise RuntimeError("APPDATA environment variable not found")

    config_dir = Path(appdata) / "Claude"
    config_file = config_dir / "claude_desktop_config.json"

    return config_file


def create_config() -> dict:
    """MCP設定を生成"""
    backend_path = get_backend_path()

    config = {
        "mcpServers": {
            "fx-simulator-analytics": {
                "command": "python",
                "args": [
                    "-m",
                    "src.mcp_server"
                ],
                "cwd": backend_path,
                "env": {
                    "PYTHONPATH": backend_path
                }
            }
        }
    }

    return config


def main():
    """メイン処理"""
    print("=" * 60)
    print("Claude Desktop MCP 設定ファイル 自動生成")
    print("=" * 60)

    try:
        # 1. 設定ファイルのパスを取得
        config_path = get_config_path()
        print(f"\n設定ファイルのパス: {config_path}")

        # 2. ディレクトリが存在しない場合は作成
        config_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"設定ディレクトリ: {config_path.parent} (作成済み)")

        # 3. 既存の設定ファイルを読み込む（存在する場合）
        existing_config = {}
        if config_path.exists():
            print(f"\n既存の設定ファイルが見つかりました")
            with open(config_path, "r", encoding="utf-8") as f:
                existing_config = json.load(f)
            print(f"既存のMCPサーバー数: {len(existing_config.get('mcpServers', {}))}")

        # 4. 新しい設定を生成
        new_config = create_config()

        # 5. 既存の設定とマージ
        if "mcpServers" not in existing_config:
            existing_config["mcpServers"] = {}

        existing_config["mcpServers"]["fx-simulator-analytics"] = new_config["mcpServers"]["fx-simulator-analytics"]

        # 6. 設定ファイルを書き込み
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(existing_config, f, indent=2, ensure_ascii=False)

        print(f"\n[SUCCESS] 設定ファイルを作成しました: {config_path}")
        print("\n設定内容:")
        print("-" * 60)
        print(json.dumps(
            existing_config["mcpServers"]["fx-simulator-analytics"],
            indent=2,
            ensure_ascii=False
        ))
        print("-" * 60)

        print("\n次のステップ:")
        print("1. Claude Desktop を再起動してください")
        print("2. Claude Desktop で以下のように質問してください:")
        print('   「FXシミュレーターのトレードパフォーマンスを分析してください」')
        print("\n" + "=" * 60)
        print("[SUCCESS] セットアップ完了")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
