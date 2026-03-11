# PoolManager — Development Documentation

> This is a living document. It is updated as the project evolves.
> Last updated: March 2026 (Session 2)

---

## Table of Contents

1. [Project Vision](#1-project-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [SSH Connection Layer](#5-ssh-connection-layer)
6. [Settings System](#6-settings-system)
7. [Node Resources & Metrics](#7-node-resources--metrics)
8. [cntools.library Integration](#8-cntoolslibrary-integration)
9. [Node Version Compatibility](#9-node-version-compatibility)
10. [Node Upgrades and Hard Forks](#10-node-upgrades-and-hard-forks)
11. [Building from Source](#11-building-from-source)
12. [Current Status](#12-current-status)
13. [Roadmap](#13-roadmap)
14. [Known Issues and Limitations](#14-known-issues-and-limitations)
15. [Session History](#15-session-history)
16. [Contributing](#16-contributing)
17. [Security Model](#17-security-model)

---

## 1. Project Vision

PoolManager is a professional native desktop application for Cardano stake pool operators. It combines the functionality of two existing Guild Operators tools into a single, unified, graphical interface:

- **cntools** — the bash TUI for pool management operations
- **gLiveView** — the live node monitoring dashboard

The goal is to replace the terminal-based workflow entirely for operators who prefer a graphical interface, while adding richer data visualisation, better user feedback, and a more accessible experience for less technical operators.

**Key principles:**
- The application runs on the operator's local machine (Windows, Mac, or Linux)
- All operations execute on the remote Cardano node over SSH
- Private keys never leave the node
- The underlying cntools.library bash functions do all the actual work — PoolManager is a GUI layer on top
- Fully open source, fully auditable

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Operator's local machine                    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  PoolManager (Tauri desktop app)    │    │
│  │                                     │    │
│  │  ┌──────────────┐ ┌──────────────┐  │    │
│  │  │  HTML/CSS/JS │ │  Rust backend│  │    │
│  │  │  Frontend UI │ │  SSH handler │  │    │
│  │  └──────┬───────┘ └──────┬───────┘  │    │
│  │         │   invoke()     │          │    │
│  │         └────────────────┘          │    │
│  └─────────────────┬───────────────────┘    │
│                    │ SSH (port 22)           │
└────────────────────┼────────────────────────┘
                     │
┌────────────────────┼────────────────────────┐
│  Remote Cardano node                        │
│                    │                        │
│  ┌─────────────────▼───────────────────┐    │
│  │  Persistent SSH session             │    │
│  │                                     │    │
│  │  Commands execute here:             │    │
│  │  - cardano-cli                      │    │
│  │  - cntools.library bash functions   │    │
│  │  - curl http://127.0.0.1:{port}/metrics  │
│  │  - encrypt/decrypt key scripts      │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Data flow

1. User interacts with the HTML/JS frontend (clicks a button, fills a form)
2. JS calls `invoke('rust_command', { params })` via the Tauri API
3. Rust backend receives the call, executes an SSH command on the remote node
4. Output streams back to Rust, which returns it to JS as a `CommandResult`
5. JS displays the output in the terminal pane or parses it to update UI cards

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| App framework | Tauri | 1.6.6 | Native desktop, WebKitGTK on Linux |
| Backend language | Rust | 1.85.1 | SSH handling, process management |
| SSH library | ssh2 (Rust) | 0.9.5 | Keyboard-interactive 2FA support |
| Frontend build | Vite | 7.3.1 | Requires Node.js 20+ |
| Frontend language | Vanilla JS | ES2020 | No framework, keeps bundle small |
| CSS | Custom | — | Dark theme, CSS variables |
| Cardano tools | cntools.library | Guild Operators | Sourced on remote node |
| Node metrics | Prometheus | — | Port configurable, default 12799 |

### Why Tauri over Electron?

- Binary size: ~10MB vs ~150MB
- Memory usage: significantly lower
- Rust backend is safer for subprocess/SSH handling
- Compiles natively for Linux, Windows, Mac from same codebase
- WebKitGTK renders natively on Linux desktop environments (lightdm etc.)

### Why vanilla JS over React/Vue?

- Keeps the bundle tiny
- No build complexity
- Sufficient for the UI patterns we need
- Easier for contributors without framework knowledge

---

## 4. Project Structure

```
projects/
├── index.html                  # App entry point
├── package.json                # Node dependencies
├── src/
│   ├── main.js                 # All frontend JS — UI, SSH calls, dashboard
│   └── style.css               # All styles — dark theme, layout, components
├── src-tauri/
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri configuration
│   ├── icons/                  # App icons (all sizes)
│   └── src/
│       └── main.rs             # Rust backend — SSH commands, Tauri handlers
└── dist/                       # Built frontend (generated by npm run build)
```

---

## 5. SSH Connection Layer

### Authentication

PoolManager supports three authentication modes, configured per node profile:

| Mode | Description |
|------|-------------|
| Authenticator then Password | TOTP first, password second (e.g. GNP1 block producer) |
| Password then Authenticator | Password first, TOTP second (e.g. GNP1 relays) |
| Password only | No 2FA |

The Rust `ssh2` crate's `userauth_keyboard_interactive` method handles the prompt sequence. A custom `Authenticator` struct implements `KeyboardInteractivePrompt`, detecting each prompt by keyword (`verification`, `code`, `password`) and responding appropriately.

If keyboard-interactive auth fails, the code falls back to `userauth_password`.

### Session management

A single SSH session is established at connect time and stored in a `Mutex<Option<Session>>` in Tauri's managed state. All subsequent commands reuse this session — the user is only prompted for credentials once per session.

On disconnect, the session is dropped and the state is set to `None`.

### Command execution

The `ssh_run` Tauri command opens a new channel on the existing session for each command, executes it, reads stdout and stderr, waits for the channel to close, and returns a `CommandResult` struct containing success status, stdout, and stderr.

### Tauri commands exposed to frontend

| Command | Parameters | Description |
|---------|-----------|-------------|
| `ssh_connect` | `ConnectionProfile` | Establish SSH session with 2FA |
| `ssh_run` | `command: String` | Run command, return output |
| `ssh_disconnect` | — | Drop SSH session |

### Node profiles (saved in localStorage)

Connection profiles (host, port, username, auth order) are saved in browser localStorage. Passwords and TOTP codes are never saved — entered fresh each session.

---

## 6. Settings System

### Design principle

The user provides the minimum possible configuration. Everything that can be derived automatically is derived automatically.

### Required user input

| Setting | Example | Notes |
|---------|---------|-------|
| Path to env file | `/opt/cardano/cnode_bp/scripts/env` | Single most important setting |
| Pool name | `GNP1` | Must match folder name under priv/pool/ |

### Auto-detected from env file

Once the env file path is known, PoolManager reads and parses it over SSH to extract:

| Variable | Source | Example |
|----------|--------|---------|
| `CNODE_HOME` | env file | `/opt/cardano/cnode_bp` |
| `POOL_ID` | env file | `4b0a9386...` |
| `POOL_TICKER` | env file | `GNP1` |
| `CNODE_PORT` | env file | `12798` |
| `PT_API_KEY` | env file | PoolTool API key |

### Derived from CNODE_HOME + pool name

| Path | Derived as |
|------|-----------|
| cntools.library | `{CNODE_HOME}/scripts/cntools.library` |
| cntools.sh | `{CNODE_HOME}/scripts/cntools.sh` |
| Pool folder | `{CNODE_HOME}/priv/pool/{POOL_NAME}/` |
| op.cert | `{CNODE_HOME}/priv/pool/{POOL_NAME}/op.cert` |
| Wallet folder | `{CNODE_HOME}/priv/wallet/` |
| config.json | `{CNODE_HOME}/files/config.json` |
| topology.json | `{CNODE_HOME}/files/topology.json` |
| cnode.sh | `{CNODE_HOME}/scripts/cnode.sh` |

### Prometheus metrics port

Read from `config.json` — specifically the `PrometheusSimple` entry. Falls back to 12799 if not found.

### Network detection

Auto-detected from env file or config.json. Supports mainnet, preprod, preview.

---

## 7. Node Metrics

### Source

PoolManager fetches live node metrics from the Prometheus endpoint over SSH:

```bash
curl -s http://127.0.0.1:{PROMETHEUS_PORT}/metrics
```

This runs on the remote node via the existing SSH session — no port forwarding required.

### Key metrics used

| Metric | Dashboard use |
|--------|--------------|
| `cardano_node_metrics_blockNum_int` | Current block height |
| `cardano_node_metrics_epoch_int` | Current epoch |
| `cardano_node_metrics_slotNum_int` | Current slot |
| `cardano_node_metrics_slotInEpoch_int` | Slot within epoch |
| `cardano_node_metrics_blocksForged_int` | Blocks minted this session |
| `cardano_node_metrics_Forge_node_is_leader_counter` | Slots won |
| `cardano_node_metrics_slotsMissed_int` | Missed slots |
| `cardano_node_metrics_remainingKESPeriods_int` | KES periods remaining |
| `cardano_node_metrics_currentKESPeriod_int` | Current KES period |
| `cardano_node_metrics_operationalCertificateExpiryKESPeriod_int` | KES expiry period |
| `cardano_node_metrics_density_real` | Chain density |
| `cardano_node_metrics_Mem_resident_int` | Memory usage (bytes) |
| `cardano_node_metrics_peersFromNodeKernel_int` | Connected peers |
| `cardano_node_metrics_txsInMempool_int` | Transactions in mempool |
| `cardano_node_metrics_mempoolBytes_int` | Mempool size (bytes) |
| `cardano_node_metrics_forging_enabled_int` | Is forging active (1/0) |
| `cardano_node_metrics_nodeIsLeader_int` | Currently slot leader (1/0) |
| `cardano_node_metrics_cardano_build_info` | Node version string |

### Refresh rate

Dashboard auto-refreshes every 30 seconds. A manual refresh button is also provided.

### Important note — node 10.6.x config change

From node 10.4.x, the new cardano-tracer infrastructure was introduced. From 10.6.x the legacy EKG monitoring is deprecated. Guild Operators have shifted to SimplePrometheus as the standard. PoolManager uses SimplePrometheus exclusively and is therefore forward-compatible with this change. EKG is not used.

---

## 8. cntools.library Integration

### Principle

PoolManager does not rewrite any pool management logic. All operations use the existing `cntools.library` bash functions directly, sourced over SSH:

```bash
source {CNODE_HOME}/scripts/env && \
source {CNODE_HOME}/scripts/cntools.library && \
{function_name} {params}
```

### Function inventory (109 functions — BP version)

**TUI functions — replaced by GUI (not called):**
`logln`, `println`, `dialogSetup`, `fileDialog`, `dirDialog`, `selectOption`, `select_opt`, `selectDir`, `selectWallet`, `selectPool`, `selectPolicy`, `selectAsset`, `getAnswerAnyCust`, `getPasswordCust`, `cursor_blink_off`

**Dashboard / status:**
`isPoolRegistered`, `getPoolType`, `getPriceInfo`, `getPriceString`, `poolCalidusInfo`

**Wallet operations:**
`createNewWallet`, `createMnemonicWallet`, `printWalletInfo`, `getWalletBalance`, `getWalletType`, `getBalance`, `getAddressInfo`, `getBaseAddress`, `getRewardAddress`, `registerStakeWallet`, `deregisterStakeWallet`, `sendAssets`, `delegate`, `withdrawRewards`, `getWalletRewards`

**Pool operations:**
`registerPool`, `modifyPool`, `deRegisterPool`, `rotatePoolKeys`

**Transactions:**
`buildTx`, `calcMinFee`, `submitTx`, `submitTxNode`, `getTxId`, `verifyTx`, `witnessTx`, `assembleTx`, `buildOfflineJSON`, `transformRawTx`

**Governance:**
`registerDRep`, `retireDRep`, `governanceVote`, `voteDelegation`, `getDRepIds`, `getDRepStatus`, `getDRepAnchor`, `getDRepVotePower`, `getAllGovActions`, `getActiveGovActionCount`, `isAllowedToVote`, `getWalletVoteDelegation`

**Assets:**
`mintAsset`, `burnAsset`, `getAssetInfo`

**Security:**
`encryptFile`, `decryptFile`, `lockFile`, `unlockFile`, `protectionPreRequisites`

**Key management:**
`getGovKeyInfo`, `getDRepIds`, `parseDRepId`, `getCCIds`

### cntools.library version tracking

PoolManager tracks the cntools.library it was built and tested against. This is shown in Settings. A warning is displayed if the detected library on the connected node differs significantly.

Built against: Guild Operators cntools.library — 109 functions (node 10.5.3)

---

## 9. Node Version Compatibility

| Node version | Status | Notes |
|-------------|--------|-------|
| < 10.1.4 | Not supported | Pre-Conway governance, missing functions |
| 10.1.4 | Compatible | Minimum supported version |
| 10.5.3 | Fully tested | Development reference version |
| 10.5.4 | Compatible | Same library |
| 10.6.x | Not yet tested | Config format changes, needs verification |
| 10.7.x | Not yet tested | Pending release |

### Compatibility check on connect

On successful connection, PoolManager reads the node version from the Prometheus metrics endpoint (`cardano_node_metrics_cardano_build_info`) and displays it in the topbar and Settings. A warning banner is shown if the version is outside the tested range.

---

## 10. Node Upgrades and Hard Forks

### Minor patch upgrades (e.g. 10.5.3 → 10.5.4)

- Guild's `guild-deploy.sh -s dlm` updates binaries only
- No config file changes
- cntools.library typically unchanged
- PoolManager should work without any changes
- Verify after upgrade by checking node version in PoolManager Settings

### Major upgrades (e.g. 10.5.x → 10.6.x)

- Config file format may change (already happened with 10.4.x tracer changes)
- cntools.library may have new or changed functions
- Steps required:
  1. Upgrade node using `guild-deploy.sh -s dlfm`
  2. Verify node starts and syncs
  3. Test PoolManager against new version
  4. Update PoolManager version compatibility table
  5. Tag new PoolManager release

### Hard forks

Hard forks can change:
- cardano-cli command syntax
- Protocol parameters
- New era-specific features (e.g. Conway governance in Chang)

PoolManager handles this by:
- Sourcing cntools.library which abstracts cardano-cli calls — Guild Operators handle CLI changes
- Detecting the current era from node tip (`era` field in `cardano-cli query tip`)
- Showing era in Settings and dashboard
- Disabling era-specific features (e.g. governance) if the node is not in the required era

### Config file changes (10.6.x warning)

Node 10.6.x removes legacy EKG monitoring and the old JSON logging format. PoolManager is already compliant — we use SimplePrometheus only. No action required when upgrading to 10.6.x from this perspective.

---

## 11. Building from Source

### Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Rust | 1.60 | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Node.js | 20.x | via nvm: `nvm install 20` |
| Tauri CLI | 1.6.6 | `cargo install tauri-cli --version "^1.0" --locked` |
| libwebkit2gtk-4.0-dev | — | `sudo apt install libwebkit2gtk-4.0-dev` |
| build-essential | — | `sudo apt install build-essential` |

Full dependency install (Ubuntu/Debian):
```bash
sudo apt install -y libwebkit2gtk-4.0-dev build-essential libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build steps

```bash
git clone https://github.com/GNP1-dev/PoolManager.git
cd PoolManager
npm install
npm run build
cargo tauri build
```

Outputs:
- `.deb` — `src-tauri/target/release/bundle/deb/`
- `.rpm` — `src-tauri/target/release/bundle/rpm/`
- `.AppImage` — `src-tauri/target/release/bundle/appimage/`

### Development mode

```bash
npm run dev &
cargo tauri dev
```

---

## 12. Current Status

**Version: 0.1.0 — Development / Not for production use**

### Working features

- [x] SSH connection with Google Authenticator 2FA support
- [x] Configurable authentication order per node (TOTP first or password first)
- [x] Saved node connection profiles (host, port, username, auth order)
- [x] Setup wizard (5 steps: Welcome → SSH → Node config → Key scripts → Done)
- [x] Settings panel with auto-detect from env file
- [x] Dashboard — SVG speedometer gauges for Node Sync % and Epoch Progress %
- [x] Dashboard — KES fuel tank (vertical, colour-coded green/amber/red)
- [x] Dashboard — 12 quick-stat cards (slot, block, epoch, slot-in-epoch, next epoch countdown, era, version, pool, mempool TX, mempool KB, memory GB, density)
- [x] Dashboard — Node Resources row: CPU %, Node Mem RSS GB, Sys Mem %, Disk %, Peers In, Peers Out
- [x] Dashboard — Peers In/Out via `ss` (same method as gLiveView, not Prometheus)
- [x] Dashboard — Pool & Delegation section via Koios API (live stake, active stake, delegators, saturation, blocks lifetime, pledge, margin, fee)
- [x] Dashboard — Block Activity section: Leader, Ideal, Luck, Adopted, Confirmed, Lost
- [x] Dashboard — Dual countdown timers: Next Assigned Slot (with SVG countdown ring) and Time Since Last Chain Block
- [x] Dashboard — auto-refresh every 30s; KES + Koios every ~5 min; cncli every 30s; local 1s tick
- [x] cncli integration — leader schedule and confirmed blocks from sqlite3 DB
- [x] Block Activity: Lost stat is epoch-only orphaned blocks from cncli chain table (not Prometheus session counter)
- [x] Block Activity: Adopted is epoch-only from cncli (not Prometheus)
- [x] Block Activity: Ideal uses sigma-based calculation (live_stake / totalActiveStake × 21600)
- [x] Block Activity: friendly `--` UI with explanatory message when cncli not installed
- [x] Countdowns show `Xd HH:MM:SS` format
- [x] bech32 pool ID conversion in pure JS (no external tools needed)
- [x] KES panel — check KES expiry with full detail
- [x] KES panel — rotate KES keys (calls cntools.library rotatePoolKeys)
- [x] Sidebar navigation to all panels
- [x] Terminal panel — run arbitrary commands on remote node
- [x] Security panel — decrypt/encrypt key buttons with password prompt
- [x] Disconnect and reconnect

### Panels present but not fully wired

- [ ] Pool Info — currently shows raw `query tip` output; needs formatted Koios summary
- [ ] Blocks — needs cncli leader schedule as a proper table (slot, time, status)
- [ ] Wallets — needs wallet listing and balance display
- [ ] Send ADA — UI present, full flow not implemented
- [ ] Rewards — UI present, full flow not implemented
- [ ] Governance — DRep status partial, voting not implemented
- [ ] Assets — UI present, not wired

### Not yet built

- [ ] Peers panel — dedicated sidebar panel with inbound/outbound peer tables and RTT latency (via `ss -ni`)
- [ ] Node restart/stop/start from UI
- [ ] Windows build via GitHub Actions
- [ ] Mac build
- [ ] Hardware wallet support
- [ ] Offline/air-gapped mode

---

## 13. Roadmap

### Phase 1 — Foundation (current)
- [x] Tauri app scaffold
- [x] SSH with 2FA
- [x] Setup wizard
- [x] Settings panel with auto-detection from env file
- [x] Basic dashboard
- [x] KES management
- [x] Rich dashboard using Prometheus metrics + cncli + Koios + ss
- [ ] Peers panel with RTT latency
- [ ] Pool Info panel — formatted Koios data
- [ ] Blocks panel — cncli leader schedule table

### Phase 2 — Core operations
- [ ] Full wallet management
- [ ] Send ADA with fee preview
- [ ] Pool registration and modification
- [ ] Rewards withdrawal
- [ ] Block production statistics

### Phase 3 — Advanced features
- [ ] Governance — full DRep and voting workflow
- [ ] Asset minting and burning
- [ ] Hardware wallet support (Ledger/Trezor via cardano-hw-cli)
- [ ] Offline/air-gapped transaction signing
- [ ] Node service management (restart, stop, start)

### Phase 4 — Polish and distribution
- [ ] Windows installer (.msi) via GitHub Actions
- [ ] Mac build (.dmg)
- [ ] Auto-update mechanism
- [ ] Full error handling and user-friendly error messages
- [ ] Security audit

### Future ideas
- [ ] Multi-pool management from single instance
- [ ] Alert notifications (KES expiry warning, missed blocks)
- [ ] Peer performance monitoring
- [ ] Mithril integration
- [ ] Midnight validator support (Q2 2026 SPO onboarding)

---

## 14. Known Issues and Limitations

| Issue | Impact | Notes |
|-------|--------|-------|
| No streaming output | Medium | Long operations show no progress until complete |
| localStorage for profiles | Low | Cleared if user clears browser data |
| No session timeout handling | Medium | SSH session may drop without clear error |
| Single node connection | Low | Cannot manage multiple nodes simultaneously |
| Confirmed vs Adopted identical | Low | Both show cncli non-orphaned count; true depth-based confirmed TBD |
| KES panel uses old cardano-cli syntax | Low | Missing `latest` keyword — fix pending |
| Peers panel not yet built | Medium | In/Out counts on dashboard; full peer list with RTT coming next |
| Pool Info panel shows raw query tip | Low | Koios data fetched but panel not yet formatted |
| Blocks panel not yet built | Medium | Leader schedule table coming next |

---

## 15. Session History

### Session 1 (March 2026)
Initial build. SSH connection, setup wizard, basic dashboard scaffold, KES panel, all sidebar panels created, bech32 pure JS implementation, Koios integration via SSH curl, cncli sqlite3 integration, SVG speedometer gauges, KES fuel tank, Prometheus metrics parsing, Block Activity section, dual countdown timers.

### Session 2 (March 2026)
- **Block Activity fixes**: Lost stat changed from Prometheus session counter to epoch-only orphaned blocks via cncli `chain` table (`orphaned=1`). Adopted changed from Prometheus to epoch-only cncli count. Ideal calculation corrected to sigma-based (`live_stake / totalActiveStake × 21600`) with Koios `epoch_info` fallback. Countdowns changed to `Xd HH:MM:SS` format.
- **Friendly cncli fallback**: When cncli is not installed all Block Activity stats show `--` with explanatory message rather than silently failing.
- **Node Resources row**: Added CPU %, Node Mem RSS GB (matching gLiveView `ps -q PID -o rss=`), Sys Mem %, Disk % (using `cnodehome` path from settings). Section renamed from Node Metrics to Node Resources.
- **Peers In/Out**: Moved from Prometheus `peersFromNodeKernel_int` (single undifferentiated count) to `ss` socket inspection — same method as gLiveView. PID obtained from `ss -tnlp` listening socket (reliable over non-interactive SSH; `pgrep` was matching the SSH command itself). Peers In = connections to node port; Peers Out = all other established connections excluding Prometheus port.
- **Quick stats expanded**: Mempool TX, Mempool KB, Memory GB, Density moved from Node Metrics row into the quick-stats grid (now 12 cards).
- **Next Assigned Slot ring**: SVG countdown arc replaces plain timer. Drains clockwise, turns amber under 30 minutes, turns red and pulses under 30 seconds. Time text reduced to fit `Xd HH:MM:SS` on one line.
- **Hardcoded values removed**: `/home/russell/.local/bin/cncli` → `~/.local/bin/cncli`; nodeport default changed from `12798` to `6000` (Guild standard).

---

## 16. Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test against a real Cardano node (testnet is fine)
5. Commit with a clear message describing what changed
6. Push and open a pull request

### Areas where help is most needed

- Windows cross-compilation and testing
- Mac build and testing
- Hardware wallet integration (cardano-hw-cli)
- UI/UX improvements
- Testing against different node configurations

### Code style

- Rust: standard `rustfmt` formatting
- JS: no framework, keep it simple, comment anything non-obvious
- CSS: use the existing CSS variables, don't add inline styles

---

## 17. Security Model

### What PoolManager does

- Connects to your node over SSH — same as you would manually
- Executes commands on your node via that SSH connection
- Displays the output in the GUI
- Saves connection profiles (host, port, username, auth order) in localStorage — no passwords

### What PoolManager does NOT do

- Store or transmit passwords or TOTP codes
- Access private keys directly
- Send any data to external servers
- Phone home to GNP1 or any third party
- Require any software to be installed on your node

### Key management

Cold keys and signing keys remain on your node at all times. The Security panel provides:
- One-click decrypt (password prompt, runs your decrypt script on the node)
- One-click encrypt and secure wipe (runs your encrypt script on the node)

The decrypt and encrypt scripts are yours — PoolManager just calls them. The scripts themselves are user-configurable.

### Threat model

| Threat | Mitigation |
|--------|-----------|
| Malicious PoolManager binary | Build from source, verify GitHub commits |
| SSH credentials intercepted | SSH encryption, keys never leave your machine |
| Man-in-the-middle SSH | SSH host key verification (standard SSH) |
| Local machine compromise | Outside scope — secure your machine |
| Node compromise via PoolManager | Same access as direct SSH — PoolManager adds no new attack surface |

### Recommendation

- Run PoolManager only on your own trusted machine
- Do not expose your node's SSH port to the public internet without IP allowlisting
- Use SSH key authentication where possible in addition to 2FA
- Always re-encrypt cold keys after operations

---

*Built by GNP1 — a Cardano stake pool with a mental health awareness mission.*
*https://grahamsnumberplus1.com*
