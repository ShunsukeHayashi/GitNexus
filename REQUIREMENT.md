# Miyabi Nexus Enterprise: Production Requirements Document (PRD)

## 1. 概要 (Overview)
Miyabi Nexus Enterprise は、巨大なモノレポ（Monorepo）および複数のマイクロサービス・リポジトリ（Polyrepo）を管理するエンタープライズ企業向けの「AI駆動型 コード・インテリジェンス＆アーキテクチャ監査プラットフォーム」である。
従来の人間のためのコード可視化にとどまらず、**「40体以上の自律型AIエージェント群（Swarm）が、Gitコンフリクトを起こさずに同時にコードを編集するための空間管制レーダー（Air Traffic Control）」** として機能する。
開発者がPRを作成する前、あるいはAIがコードを編集する前に「この変更が他チームや他のAIの作業領域と衝突しないか（Blast Radius）」を完全な3Dグラフ上で計算し、空間的な棲み分け（Spatial Isolation）を実現する。

## 2. システム・アーキテクチャ要件 (System Architecture)
### 2.1 バックエンド (Nexus Core Engine)
- **Node.js (TypeScript)** ベースのスタンドアロン・サーバー。
- **グラフデータベース**: KuzuDB（永続化ファイルモード）を必須とし、メモリ枯渇を防ぎ数百万ノードのコードベースに対応すること。
- **ベクターデータベース**: LanceDB または SQLite + pgvector 互換のローカル永続化Vector Store。In-memoryはテスト時のみ許容。
- **API層**: 
  - GraphQL または tRPC を用いた型安全なフロントエンド通信。
  - **WebSocket (Socket.io等)** を用いたステート同期（AIエージェントのカーソル・ロック情報のリアルタイム描画用）。
- **MCP (Model Context Protocol)**:
  - 外部の GitNexus インスタンスや知識ベース（Notion, Jira等）の情報を統合するためのルーター機能。
  - **Swarm Coordination API**: エージェント同士がCLIネイティブで排他制御を行うための `gitnexus_lock_resource` / `gitnexus_list_locks` ツールを提供する（Web UI依存ではなく、MCP層で完結させること）。

### 2.2 フロントエンド (Nexus Web UI)
- **React 18+ (Vite) + TailwindCSS**.
- **3D可視化エンジン**: `react-force-graph-3d` を用いたWebGLベースのレンダリング。
- **デザインシステム**: Apple-Style Light Theme（System Grays, 白背景、モノトーン基調）。ダークモードやゲーミング風（ネオン色）は廃止。
- **AI管制レーダー (Agent Radar)**: 人間が操作するためのUIというより、背後で自律動作しているAIエージェントたちの現在位置（ロック中ノード）、影響範囲（オーラ）、衝突状態を可視化するダッシュボードとして機能する。

## 3. 機能要件 (Functional Requirements)

### 3.1 リポジトリ横断グラフ (Cross-Repo Graph)
- **FR-1**: 異なるGitリポジトリの解析結果（graph-meta.jsonl等）を単一のKuzuDBにマージし、名前空間（Namespace）で分離できること。
- **FR-2**: APIエンドポイント、RPC呼び出し、共有ライブラリのImportを静的解析し、異なる名前空間間に `CROSS_REPO_CALL` エッジを自動生成すること。
- **FR-3**: `CROSS_REPO_CALL` を辿ったBlast Radius（影響範囲）計算が行えること。

### 3.2 AI・コンテキスト永続化 (Enterprise RAG)
- **FR-4**: ソースコードのAST（抽象構文木）チャンクを生成し、ローカルの永続Vector DBにEmbeddingsとして保存すること。
- **FR-5**: サーバー再起動時に、ファイルのハッシュを比較し「変更されたファイル」のみを差分再インデックス（Zero-cost re-indexing）すること。
- **FR-6**: ユーザーとAIのチャット履歴（Chat History）や、アーキテクチャに関する決定事項を `ProjectMemory` として永続化し、次回のコンテキストに自動で含めること。

### 3.3 空間的棲み分けプロトコル (Spatial Swarm Coordination)
- **FR-7 (Observe & Claim)**: エージェントは作業開始前にグラフからBlast Radiusを計算し、対象ノード群に対してMCP経由でロック（Swarm Lock）を取得できること。
- **FR-8 (Magnetic Repulsion & Pivot)**: 他のエージェントが既にロックしているBlast Radius（磁場）に衝突した場合、エージェントは直列で「待機（Wait）」するのではなく、瞬時に別のタスクへ「旋回（Pivot）」して並列処理を維持すること。
- **FR-9 (Live Radar)**: Web UIはWebSocketをポーリングし、稼働中のAIエージェントのカーソル（Floating Badges）やロック領域（Golden Auras）をマルチプレイヤー感覚でリアルタイム描画すること。

### 3.4 CI/CD 自動化 (GitHub Actions Integration)
- **FR-10**: `Miyabi-Nexus-Action` を提供し、Pull Request イベントで自動トリガーされること。
- **FR-11**: PRで変更されたファイル群からBlast Radiusを計算し、AIが「影響を受ける依存先（別リポジトリ含む）」を分析したMarkdownレポートをPRに自動コメントすること。
- **FR-12**: 複数AIによる並列PR提出でCIが破損した場合でも、AI自身が `main` をPullし直して自己修復（Self-heal）できる自律型ワークフローをサポートすること。

## 4. 非機能要件 (Non-Functional Requirements)
- **アーキテクチャ原則**: すべてのSwarm制御ロジックはCLI/MCP（バックエンド）で完結させること。Web UIは状態の「可視化」のみを担当し、UIのクラッシュがコアロジックを停止させないこと（UI / Logicの分離）。
- **パフォーマンス**: フロントエンドの3Dグラフは、10,000ノード/50,000エッジの環境でも 60FPS を維持すること。
- **セキュリティ**: 解析されたコードデータ（AST, グラフ, Vector）が外部のクラウドに漏洩しない完全ローカル（オンプレミス）動作モードをサポートすること。

## 5. スケジュール (Milestones)
- **Phase 1 (Q2 2026)**: Cross-Repo API & 3D UI (Apple-Style) 完全統合
- **Phase 2 (Q3 2026)**: 永続化Vector DB実装 & 差分Re-indexing
- **Phase 3 (Q4 2026)**: Spatial Swarm Coordination (Agent Radar) 実装【現在進行中】
- **Phase 4 (Q1 2027)**: GitHub Actions連携 (Autonomous PR Bot) & エンタープライズ版正式リリース
