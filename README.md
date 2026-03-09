> ⚠️ **DEVELOPMENT STATUS — NOT FOR PRODUCTION USE**
> PoolManager is currently in active development and has not been security audited.
> Do NOT use this software to manage real funds or production stake pools at this stage.
> Use at your own risk.

# PoolManager

A professional graphical desktop application for Cardano stake pool operators.

PoolManager provides a full GUI wrapper around [Guild Operators cntools](https://github.com/cardano-community/guild-operators), replacing the terminal-based menu interface with a modern native desktop application. It connects securely to your Cardano node over SSH, meaning it runs on your everyday computer — Windows, Mac, or Linux — while all operations execute on your remote node.

---

## Features

- **Native desktop application** — runs on Linux (AppImage/deb), Windows (coming soon), Mac (coming soon)
- **Secure SSH connection** — connects to your remote Cardano node, keys never leave your server
- **Full 2FA support** — supports Google Authenticator / TOTP in any authentication sequence
- **Multiple node profiles** — manage block producer, relays, and testnet nodes from one app
- **Real-time output** — all cardano-cli operations stream live output back to the GUI
- **Key management** — one-click encrypt/decrypt with password prompt and secure wipe
- **Transaction feedback** — fee estimates, confirmation dialogs, and CardanoScan links for every tx

---

## Panels

- **Dashboard** — pool status, sync state, epoch progress, KES expiry warning
- **Wallet** — balances, send ADA, delegate, withdraw rewards
- **Pool** — register, modify, retire, rotate KES keys
- **Transactions** — build, sign, submit, verify
- **Governance** — DRep registration, voting, delegation (CIP-1694)
- **Assets** — mint and burn native tokens
- **Security** — encrypt/decrypt cold keys with secure wipe

---

## How it works

PoolManager sources and calls functions from `cntools.library` (Guild Operators) directly over SSH. The TUI menu layer is replaced entirely by the GUI — all underlying logic remains in the battle-tested cntools library.
```
PoolManager GUI (your local machine)
  └── SSH connection to your Cardano node
        └── cntools.library functions execute on the node
              └── cardano-cli handles all on-chain operations
```

This means PoolManager works with any remote Cardano node — VPS, home server, or bare metal — with nothing extra to install on the node itself.

---

## Built against

- cardano-node 10.5.3
- cardano-cli 10.11.1.0
- cntools.library (Guild Operators) — 109 functions
- Tauri 1.6.6
- Rust 1.85.1

---

## Attribution

All pool management logic is provided by [Guild Operators cntools](https://github.com/cardano-community/guild-operators), licensed under Apache 2.0. PoolManager is a GUI wrapper and does not modify the underlying cntools library.

---

## Licence

Apache 2.0 — see [LICENSE](LICENSE)

---

## Security

- PoolManager never stores or transmits your private keys
- All operations execute on your own node via SSH
- Cold key encrypt/decrypt operations run locally on your node with secure wipe
- Source code is fully open for community audit
- Never expose PoolManager or your node to the public internet

---

## Project

Built and maintained by [GNP1 — GrahamsNumberPlus1](https://grahamsnumberplus1.com), a Cardano stake pool with a mental health awareness mission.

Contributions and feedback welcome.
