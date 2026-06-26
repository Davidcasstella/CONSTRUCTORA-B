# Graph Report - CONSTRUCTORA-B  (2026-06-25)

## Corpus Check
- 1044 files · ~3,815,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 244 nodes · 287 edges · 15 communities (11 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bd4efab7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]

## God Nodes (most connected - your core abstractions)
1. `BaileysProvider` - 35 edges
2. `SessionManager` - 20 edges
3. `useSocket()` - 7 edges
4. `scripts` - 7 edges
5. `ConversationsPage()` - 5 edges
6. `ChatPage()` - 4 edges
7. `normalizePhoneNumber()` - 4 edges
8. `formatPhoneDisplay()` - 3 edges
9. `getInitials()` - 3 edges
10. `formatWhatsAppText()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `HomePage()` --calls--> `useSocket()`  [EXTRACTED]
  whatsapp-chatbot/frontend/src/pages/HomePage.jsx → whatsapp-chatbot/frontend/src/context/SocketContext.jsx
- `ChatPage()` --calls--> `getInitials()`  [INFERRED]
  whatsapp-chatbot/frontend/src/pages/ChatPage.jsx → whatsapp-chatbot/frontend/src/pages/ConversationsPage.jsx
- `ChatPage()` --calls--> `normalizePhoneNumber()`  [INFERRED]
  whatsapp-chatbot/frontend/src/pages/ChatPage.jsx → whatsapp-chatbot/frontend/src/pages/ConversationsPage.jsx
- `ChatPage()` --calls--> `useSocket()`  [EXTRACTED]
  whatsapp-chatbot/frontend/src/pages/ChatPage.jsx → whatsapp-chatbot/frontend/src/context/SocketContext.jsx
- `ConversationsPage()` --calls--> `useSocket()`  [EXTRACTED]
  whatsapp-chatbot/frontend/src/pages/ConversationsPage.jsx → whatsapp-chatbot/frontend/src/context/SocketContext.jsx

## Import Cycles
- None detected.

## Communities (15 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (34): aiRulesService, authRoutes, _autoPublishToWhatsApp(), bulkService, chatService, express, fs, getBaileysProvider() (+26 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (13): defaultSessionState, SocketContext, useSocket(), ChatPage(), ConversationsPage(), _convsCache, EMOJIS, formatPhoneDisplay() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (26): dependencies, @aws-sdk/client-cloudfront, @aws-sdk/client-dynamodb, @aws-sdk/client-s3, @aws-sdk/lib-dynamodb, axios, bcryptjs, dotenv (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (20): author, description, devDependencies, eslint, jest, nodemon, engines, node (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (15): advisorControlService, app, chatService, config, embeddingsService, http, io, logger (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (11): config, logger, MetaProvider, sessionManager, TwilioProvider, BaileysProvider, EventEmitter, fs (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (11): conversationStateService, { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestWaWebVersion, Browsers }, EventEmitter, ffmpeg, ffmpegPath, fs, logger, mediaStorageService (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.20
Nodes (8): mockFetchLatestVersion, mockMakeWASocket, mockQrcodeImage, mockQrcodeTerminal, mockSetWhatsAppSocket, mockSock, mockSockEv, mockUseMultiFileAuth

### Community 11 - "Community 11"
Cohesion: 0.47
Nodes (5): checkExistingDistribution(), cloudfront, {
  CloudFrontClient,
  CreateDistributionCommand,
  ListDistributionsCommand,
}, createDistribution(), main()

### Community 12 - "Community 12"
Cohesion: 0.40
Nodes (4): EventEmitter, mockSession1, mockSession2, mockSessionManager

## Knowledge Gaps
- **132 isolated node(s):** `graphify`, `Workflow: graphify`, `SocketContext`, `defaultSessionState`, `EMOJIS` (+127 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BaileysProvider` connect `Community 1` to `Community 8`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Community 5` to `Community 7`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 3` to `Community 4`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `graphify`, `Workflow: graphify`, `SocketContext` to the rest of the system?**
  _132 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09915966386554621 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.12307692307692308 - nodes in this community are weakly interconnected._