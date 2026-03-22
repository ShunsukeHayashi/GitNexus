# Miyabi Nexus Enterprise: Production Requirements Document (PRD)

## 1. 概要 (Overview)
Miyabi Nexus Enterprise は、巨大なモノレポ（Monorepo）および複数のマイクロサービス・リポジトリ（Polyrepo）を管理するエンタープライズ企業向けの「AI駆動型 コード・インテリジェンス＆アーキテクチャ監査プラットフォーム」である。
開発者がPRを作成する前に、またはPR作成時に「この変更が他チームのどのシステムを破壊するか（Blast Radius）」を完全な3DグラフとAIレポートで可視化・警告する。

## 2. システム・アーキテクチャ要件 (System Architecture)
### 2.1 バックエンド (Nexus Core Engine)
- **Node.js (TypeScript)** ベースのスタンドアロン・サーバー。
- **グラフデータベース**: KuzuDB（永続化ファイルモード）を必須とし、メモリ枯渇を防ぎ数百万ノードのコードベースに対応すること。
- **ベクターデータベース**: LanceDB または SQLite + pgvector 互換のローカル永続化Vector Store。In-memoryはテスト時のみ許容。
- **API層**: 
  - GraphQL または tRPC を用いた型安全なフロントエンド通信。
  - **WebSocket (Socket.io等)** を用いたステート同期（マルチプレイヤー機能用）。
- **MCP (Model Context Protocol)**:
  - 外部の GitNexus インスタンスや、他の企業内知識ベース（Notion, Jira等）の情報をグラフに統合するための MCP ルーター機能を内蔵すること。

### 2.2 フロントエンド (Nexus Web UI)
- **React 18+ (Vite) + TailwindCSS**.
- **3D可視化エンジン**: eact-force-graph-3d を用いたWebGLベースのレンダリング。
- **デザインシステム**: Apple-Style Light Theme（System Grays, 白背景、モノトーン基調）。ダークモードやゲーミング風（ネオン色）は廃止。
- **AI統合UI**: 右パネルにLLMとのチャット、Diffプレビュー（Suggest Tool）、およびクリック可能なコード参照（CodeReferencesPanel）を完備。

## 3. 機能要件 (Functional Requirements)

### 3.1 リポジトリ横断グラフ (Cross-Repo Graph)
- **FR-1**: 異なるGitリポジトリの解析結果（graph-meta.jsonl等）を単一のKuzuDBにマージし、名前空間（Namespace）で分離できること。
- **FR-2**: APIエンドポイント、RPC呼び出し、共有ライブラリのImportを静的解析し、異なる名前空間間に CROSS_REPO_CALL エッジを自動生成すること。
- **FR-3**: CROSS_REPO_CALL を辿ったBlast Radius（影響範囲）計算が行えること。

### 3.2 AI・コンテキスト永続化 (Enterprise RAG)
- **FR-4**: ソースコードのAST（抽象構文木）チャンクを生成し、ローカルの永続Vector DBにEmbeddingsとして保存すること。
- **FR-5**: サーバー再起動時に、ファイルのハッシュを比較し「変更されたファイル」のみを差分再インデックス（Zero-cost re-indexing）すること。
- **FR-6**: ユーザーとAIのチャット履歴（Chat History）や、アーキテクチャに関する決定事項を ProjectMemory として永続化し、次回のコンテキストに自動で含めること。

### 3.3 コラボレーション機能 (Multi-player)
- **FR-7**: 同じMiyabi NexusのURLにアクセスしている同僚（クライアント）のカーソル位置や「選択中ノード」をWebSocket経由で同期・リアルタイム描画すること。
- **FR-8**: エンタープライズ向けのアクセス制御（RBAC）。SSO/SAMLまたはJWTによる認証機構を設け、特定のグラフ領域へのアクセスを制限可能にすること。

### 3.4 CI/CD 自動化 (GitHub Actions Integration)
- **FR-9**: Miyabi-Nexus-Action を提供し、Pull Request イベントで自動トリガーされること。
- **FR-10**: PRで変更されたファイル群からBlast Radiusを計算し、AIが「影響を受ける依存先（別リポジトリ含む）」を分析したMarkdownレポートをPRに自動コメントすること。
- **FR-11**: AIが検出したリスクに対する「回避策のコード差分（Diff）」をPRのレビューコメントとして自動提案（Suggest）すること。

## 4. 非機能要件 (Non-Functional Requirements)
- **パフォーマンス (Performance)**:
  - フロントエンドの3Dグラフは、10,000ノード/50,000エッジの環境でも 60FPS を維持すること（Geometry/Materialキャッシングの必須化）。
  - バックエンドのインデックス作成は、1,000ファイルのTypeScriptリポジトリに対して 1分以内 に完了すること。
- **可用性・永続性 (Availability & Durability)**:
  - Dockerコンテナとしてのデプロイをサポートし、VolumeマウントによってKuzuDBとVector Storeのデータを完全に維持できること。
- **セキュリティ (Security)**:
  - 解析されたコードデータ（AST, グラフ, Vector）が外部のクラウドに漏洩しない完全ローカル（オンプレミス）動作モードをサポートすること。
  - LLMプロンプトインジェクションへの対策（ASTパース時のサニタイズ）。

## 5. スケジュール (Milestones)
- **Phase 1 (Q2 2026)**: Cross-Repo API & 3D UI (Apple-Style) 完全統合
- **Phase 2 (Q3 2026)**: 永続化Vector DB実装 & 差分Re-indexing
- **Phase 3 (Q4 2026)**: WebSocketマルチプレイヤー & RBAC実装
- **Phase 4 (Q1 2027)**: GitHub Actions連携 & エンタープライズ版正式リリース
