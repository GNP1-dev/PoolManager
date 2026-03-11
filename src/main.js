import './style.css'
import { invoke } from '@tauri-apps/api/tauri'

// ── STATE ──
let connected      = false
let lastBlockNum   = null
let lastBlockTime  = null
let epochSlotsLeft = null
let localTickInterval = null
let refreshInterval   = null
let kesFetchCounter   = 0
let currentEpoch      = 0

// ── SETTINGS HELPER ──
function cfg() {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const home = s.cnodehome || '/opt/cardano/cnode'
  const pool = s.poolname  || 'POOL'
  const net  = s.network   || 'mainnet'
  return {
    home, pool, net,
    netflag:  net === 'mainnet' ? '--mainnet' : '--testnet-magic 1',
    env:      `${home}/scripts/env`,
    lib:      `${home}/scripts/cntools.library`,
    opcert:   `${home}/priv/pool/${pool}/op.cert`,
    wallets:  `${home}/priv/wallet/`,
    assets:   `${home}/priv/asset/`,
    promport: s.promport || '12799',
    decrypt:  s.decryptscript || '',
    encrypt:  s.encryptscript || '',
  }
}

// ── GAUGE SVG TEMPLATE ──
function gaugeSVG(id, sublabel) {
  return `
  <svg class="gauge-svg" viewBox="0 0 200 170" id="${id}">
    <circle cx="100" cy="95" r="70" fill="none" stroke="#1a1e2e"
      stroke-width="10" stroke-dasharray="330 110"
      transform="rotate(135 100 95)" stroke-linecap="round"/>
    <circle class="gauge-arc" cx="100" cy="95" r="70" fill="none"
      stroke="#0053ff" stroke-width="10" stroke-dasharray="0 440"
      transform="rotate(135 100 95)" stroke-linecap="round"/>
    <circle cx="100" cy="95" r="57" fill="none" stroke="#1a1e2e" stroke-width="1"/>
    <text class="gauge-val" x="100" y="88" text-anchor="middle"
      font-family="'Segoe UI',system-ui,sans-serif"
      fill="#e8eaf0" font-size="24" font-weight="700">--%</text>
    <text x="100" y="107" text-anchor="middle"
      font-family="'Segoe UI',system-ui,sans-serif"
      fill="#6b7280" font-size="10" font-weight="600" letter-spacing="1">${sublabel}</text>
    <text x="24"  y="158" text-anchor="middle" fill="#374151" font-size="9"
      font-family="'Segoe UI',system-ui,sans-serif">0%</text>
    <text x="176" y="158" text-anchor="middle" fill="#374151" font-size="9"
      font-family="'Segoe UI',system-ui,sans-serif">100%</text>
  </svg>`
}

// ── RENDER ──
document.querySelector('#app').innerHTML = `

<!-- SETUP WIZARD -->
<div id="wizard-screen" style="display:none">
  <div class="connect-box" style="max-width:560px">
    <div class="wizard-step" id="wz-1">
      <div class="connect-logo">
        <h1>Pool<span style="color:var(--accent)">Manager</span></h1>
        <p style="color:var(--text-muted);font-size:13px;line-height:1.6;margin-top:12px">
          A graphical desktop application combining <strong>cntools</strong> and
          <strong>gLiveView</strong> from the
          <a href="https://cardano-community.github.io/guild-operators/" style="color:var(--accent)">Guild Operators</a>
          suite into a single rich interface.<br><br>
          Full credit to the Guild Operators / Koios team &mdash; PoolManager builds on their work
          and requires their tools installed on your node. Open source under Apache 2.0.
        </p>
      </div>
      <div style="background:rgba(0,83,255,0.08);border:1px solid var(--accent);border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:var(--text)">
        This wizard guides you through setup in about 2 minutes.<br>
        You can re-run it any time from Settings.
      </div>
      <button class="btn btn-primary" id="btn-wz-start">Get Started &rarr;</button>
    </div>

    <div class="wizard-step" id="wz-2" style="display:none">
      <div class="panel-title" style="margin-bottom:4px">Step 1 of 3 &mdash; Connect to your node</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Enter your node&rsquo;s SSH connection details.</p>
      <div class="form-row">
        <div class="form-group">
          <label>Hostname / IP</label>
          <input id="wz-host" type="text" placeholder="hostname or IP" />
        </div>
        <div class="form-group port">
          <label>Port</label>
          <input id="wz-port" type="text" placeholder="22" value="22" />
        </div>
      </div>
      <div class="form-group">
        <label>Username</label>
        <input id="wz-user" type="text" placeholder="username" />
      </div>
      <div class="form-group">
        <label>Authentication Order</label>
        <select id="wz-order">
          <option value="totp_first">Authenticator code then Password</option>
          <option value="password_first">Password then Authenticator code</option>
          <option value="password_only">Password only</option>
        </select>
      </div>
      <div class="form-group" id="wz-totp-group">
        <label>Google Authenticator Code</label>
        <input id="wz-totp" type="text" placeholder="123456" maxlength="6" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input id="wz-pass" type="password" placeholder="password" />
      </div>
      <div id="wz-conn-error" style="color:var(--danger);font-size:13px;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-action" id="btn-wz-back-1">&larr; Back</button>
        <button class="btn btn-primary" style="flex:1" id="wz-conn-btn">Test Connection &rarr;</button>
      </div>
    </div>

    <div class="wizard-step" id="wz-3" style="display:none">
      <div class="panel-title" style="margin-bottom:4px">Step 2 of 3 &mdash; Node configuration</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Enter your env file path and pool name. Everything else is detected automatically.</p>
      <div class="form-group">
        <label>Path to env file</label>
        <input id="wz-envpath" type="text" placeholder="/path/to/cnode/scripts/env" />
      </div>
      <div class="form-group">
        <label>Pool Name (folder name under priv/pool/)</label>
        <input id="wz-poolname" type="text" placeholder="Your pool folder name e.g. MYPOOL" />
      </div>
      <div class="form-group">
        <label>Network</label>
        <select id="wz-network">
          <option value="mainnet">Mainnet</option>
          <option value="preprod">Preprod</option>
          <option value="preview">Preview</option>
        </select>
      </div>
      <button class="btn-action success" id="btn-wz-detect" style="margin-bottom:12px">Auto-Detect from env file</button>
      <div class="terminal" id="wz-detect-terminal" style="min-height:80px;margin-bottom:12px;font-size:12px">Click Auto-Detect to read your node configuration...</div>
      <div id="wz-node-error" style="color:var(--danger);font-size:13px;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px">
        <button class="btn-action" id="btn-wz-back-2">&larr; Back</button>
        <button class="btn btn-primary" style="flex:1" id="btn-wz-savenode">Next &rarr;</button>
      </div>
    </div>

    <div class="wizard-step" id="wz-4" style="display:none">
      <div class="panel-title" style="margin-bottom:4px">Step 3 of 3 &mdash; Key scripts (optional)</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:4px">
        If you have custom encrypt/decrypt scripts enter their paths here.<br>
        Leave blank to use cntools.library built-in functions.
      </p>
      <div class="form-group">
        <label>Decrypt keys script</label>
        <input id="wz-decrypt" type="text" placeholder="Optional: /path/to/your/decrypt-keys.sh" />
      </div>
      <div class="form-group">
        <label>Encrypt keys script</label>
        <input id="wz-encrypt" type="text" placeholder="Optional: /path/to/your/encrypt-keys.sh" />
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-action" id="btn-wz-back-3">&larr; Back</button>
        <button class="btn-action" id="btn-wz-skip">Skip</button>
        <button class="btn btn-primary" style="flex:1" id="btn-wz-finish">Finish Setup &rarr;</button>
      </div>
    </div>

    <div class="wizard-step" id="wz-5" style="display:none">
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:48px;margin-bottom:12px">&#10003;</div>
        <div class="panel-title" style="margin-bottom:8px">You&rsquo;re all set!</div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">
          PoolManager is configured and ready to use.<br>
          Settings can be updated any time from the Settings panel.
        </p>
        <button class="btn btn-primary" id="btn-wz-launch">Launch PoolManager &rarr;</button>
      </div>
    </div>
  </div>
</div>

<!-- CONNECTION SCREEN -->
<div id="connect-screen">
  <div class="connect-box">
    <div class="connect-logo">
      <h1>Pool<span style="color:var(--accent)">Manager</span></h1>
      <p>Cardano Stake Pool GUI &mdash; by GNP1</p>
    </div>
    <div class="form-group">
      <label>Saved Profiles</label>
      <select id="c-profile"><option value="">-- Select saved profile --</option></select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Hostname / IP</label>
        <input id="c-host" type="text" placeholder="hostname or IP" />
      </div>
      <div class="form-group port">
        <label>Port</label>
        <input id="c-port" type="text" placeholder="22" value="22" />
      </div>
    </div>
    <div class="form-group">
      <label>Username</label>
      <input id="c-user" type="text" placeholder="username" />
    </div>
    <div class="form-group">
      <label>Authentication Order</label>
      <select id="c-order">
        <option value="totp_first">Authenticator code then Password</option>
        <option value="password_first">Password then Authenticator code</option>
        <option value="password_only">Password only</option>
      </select>
    </div>
    <div class="form-group" id="totp-group">
      <label>Google Authenticator Code</label>
      <input id="c-totp" type="text" placeholder="123456" maxlength="6" />
    </div>
    <div class="form-group">
      <label>Password</label>
      <input id="c-pass" type="password" placeholder="password" />
    </div>
    <button class="btn btn-primary" id="btn-connect">Connect to Node</button>
    <div class="connect-error" id="connect-error"></div>
  </div>
</div>

<!-- MAIN APP -->
<div id="main-app">
  <div class="topbar">
    <div class="topbar-title">Pool<span>Manager</span></div>
    <div class="topbar-right">
      <div class="conn-status">
        <div class="conn-dot"></div>
        <span id="conn-label">Connected</span>
      </div>
      <div class="key-status locked" id="key-status" title="Click to manage keys">Keys Locked</div>
      <button class="btn-disconnect" id="btn-disconnect">Disconnect</button>
    </div>
  </div>

  <div class="body-layout">
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-label">Overview</div>
        <div class="nav-item active" data-panel="dashboard"><span class="nav-icon">&#9632;</span> Dashboard</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Pool</div>
        <div class="nav-item" data-panel="pool"><span class="nav-icon">&#127946;</span> Pool Info</div>
        <div class="nav-item" data-panel="kes"><span class="nav-icon">&#128273;</span> KES Keys</div>
        <div class="nav-item" data-panel="blocks"><span class="nav-icon">&#128230;</span> Blocks</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Wallet</div>
        <div class="nav-item" data-panel="wallet"><span class="nav-icon">&#128091;</span> Wallets</div>
        <div class="nav-item" data-panel="send"><span class="nav-icon">&#10148;</span> Send ADA</div>
        <div class="nav-item" data-panel="rewards"><span class="nav-icon">&#127873;</span> Rewards</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Governance</div>
        <div class="nav-item" data-panel="governance"><span class="nav-icon">&#128505;</span> DRep / Voting</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Advanced</div>
        <div class="nav-item" data-panel="assets"><span class="nav-icon">&#129689;</span> Assets</div>
        <div class="nav-item" data-panel="security"><span class="nav-icon">&#128272;</span> Security</div>
        <div class="nav-item" data-panel="terminal"><span class="nav-icon">&#9000;</span> Terminal</div>
        <div class="nav-item" data-panel="settings"><span class="nav-icon">&#9881;</span> Settings</div>
      </div>
    </div>

    <div class="content">

      <!-- ══ DASHBOARD ══ -->
      <div class="panel active" id="panel-dashboard">

        <!-- NODE STATUS -->
        <div class="section">
          <div class="section-title">Node Status</div>
          <div class="status-row">
            <div class="gauge-wrap">
              ${gaugeSVG('gauge-sync', 'SYNC')}
              <div class="gauge-title">Node Sync</div>
            </div>
            <div class="gauge-wrap">
              ${gaugeSVG('gauge-epoch', 'EPOCH')}
              <div class="gauge-title">Epoch Progress</div>
            </div>
            <div class="kes-wrap">
              <div class="kes-sublabel">KES Expiry</div>
              <div class="kes-body">
                <div class="kes-tank"><div class="kes-fill" id="kes-fill"></div></div>
                <div class="kes-scale"><span>62</span><span>31</span><span>0</span></div>
              </div>
              <div class="kes-days" id="kes-days">--d</div>
              <div class="kes-periods" id="kes-periods">-- / 62 periods</div>
              <div class="kes-expiry" id="kes-expiry">Expires: --</div>
            </div>
            <div class="quick-stats">
              <div class="qs-item"><span class="qs-label">Absolute Slot</span><span class="qs-val mono" id="qs-slot">--</span></div>
              <div class="qs-item"><span class="qs-label">Block Height</span><span class="qs-val mono" id="qs-block">--</span></div>
              <div class="qs-item"><span class="qs-label">Epoch</span><span class="qs-val" id="qs-epoch">--</span></div>
              <div class="qs-item"><span class="qs-label">Slot in Epoch</span><span class="qs-val mono" id="qs-slot-ep">--</span></div>
              <div class="qs-item"><span class="qs-label">Next Epoch In</span><span class="qs-val" id="qs-next-epoch">--</span></div>
              <div class="qs-item"><span class="qs-label">Era</span><span class="qs-val" id="qs-era">--</span></div>
              <div class="qs-item"><span class="qs-label">Node Version</span><span class="qs-val" id="qs-version">--</span></div>
              <div class="qs-item"><span class="qs-label">Pool</span><span class="qs-val success" id="qs-pool">--</span></div>
              <div class="qs-item"><span class="qs-label">Mempool TX</span><span class="qs-val mono" id="mc-mempool-tx">--</span></div>
              <div class="qs-item"><span class="qs-label">Mempool KB</span><span class="qs-val mono" id="mc-mempool-kb">--</span></div>
              <div class="qs-item"><span class="qs-label">Memory GB</span><span class="qs-val mono" id="mc-memory">--</span></div>
              <div class="qs-item"><span class="qs-label">Density</span><span class="qs-val mono" id="mc-density">--%</span></div>
            </div>
          </div>
        </div>

        <!-- NODE METRICS -->
        <div class="section">
          <div class="section-title">Node Resources</div>
          <div class="metrics-row">
            <div class="metric-card"><div class="mc-label">CPU %</div><div class="mc-value" id="mc-cpu">--%</div></div>
            <div class="metric-card"><div class="mc-label">Node Mem</div><div class="mc-value" id="mc-mem-rss">--G</div></div>
            <div class="metric-card"><div class="mc-label">Sys Mem %</div><div class="mc-value" id="mc-mem-pct">--%</div></div>
            <div class="metric-card"><div class="mc-label">Disk %</div><div class="mc-value" id="mc-disk">--%</div></div>
            <div class="metric-card"><div class="mc-label">Peers In</div><div class="mc-value" id="mc-peers-in">--</div></div>
            <div class="metric-card"><div class="mc-label">Peers Out</div><div class="mc-value" id="mc-peers-out">--</div></div>
          </div>
        </div>

        <!-- POOL + BLOCKS -->
        <div class="dash-bottom">

          <!-- POOL & DELEGATION -->
          <div class="section" style="margin-bottom:0">
            <div class="section-title">Pool &amp; Delegation <span class="koios-badge">Koios</span></div>
            <div id="pool-data-loading" style="color:var(--text-muted);font-size:13px">Loading pool data...</div>
            <div id="pool-data-grid" class="pool-data-grid" style="display:none">
              <div class="pool-stat"><div class="ps-label">Live Stake</div><div class="ps-value" id="ps-live-stake">--</div></div>
              <div class="pool-stat"><div class="ps-label">Active Stake</div><div class="ps-value" id="ps-active-stake">--</div></div>
              <div class="pool-stat"><div class="ps-label">Delegators</div><div class="ps-value" id="ps-delegators">--</div></div>
              <div class="pool-stat"><div class="ps-label">Saturation</div><div class="ps-value" id="ps-saturation">--</div></div>
              <div class="pool-stat"><div class="ps-label">Blocks Lifetime</div><div class="ps-value success" id="ps-blocks">--</div></div>
              <div class="pool-stat"><div class="ps-label">Pledge</div><div class="ps-value" id="ps-pledge">--</div></div>
              <div class="pool-stat"><div class="ps-label">Margin</div><div class="ps-value" id="ps-margin">--</div></div>
              <div class="pool-stat"><div class="ps-label">Fixed Fee</div><div class="ps-value" id="ps-fee">--</div></div>
            </div>
          </div>

          <!-- BLOCK ACTIVITY -->
          <div class="section" style="margin-bottom:0">
            <div class="section-title">
              Block Activity
              <span id="cncli-badge" style="display:none;font-size:9px;background:rgba(0,196,140,0.12);color:var(--success);border:1px solid rgba(0,196,140,0.25);border-radius:10px;padding:1px 6px;letter-spacing:0.5px;font-weight:600;margin-left:4px">cncli</span>
              <span id="cncli-missing" style="font-size:9px;background:rgba(255,184,0,0.12);color:var(--warning);border:1px solid rgba(255,184,0,0.25);border-radius:10px;padding:1px 6px;letter-spacing:0.5px;font-weight:600;margin-left:4px">cncli not found</span>
            </div>

            <!-- 6-stat row -->
            <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:10px">
              <div class="bes-stat-card"><div class="bsc-label">Leader</div><div class="bsc-val" id="bsc-leader">--</div></div>
              <div class="bes-stat-card"><div class="bsc-label">Ideal</div><div class="bsc-val" id="bsc-ideal">--</div></div>
              <div class="bes-stat-card"><div class="bsc-label">Luck</div><div class="bsc-val" id="bsc-luck">--%</div></div>
              <div class="bes-stat-card"><div class="bsc-label">Adopted</div><div class="bsc-val success" id="bsc-adopted">--</div></div>
              <div class="bes-stat-card"><div class="bsc-label">Confirmed</div><div class="bsc-val success" id="bsc-confirmed">--</div></div>
              <div class="bes-stat-card"><div class="bsc-label">Lost</div><div class="bsc-val" id="bsc-lost">--</div></div>
            </div>

            <!-- Dual countdowns -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div class="block-timer-wrap">
                <div class="bt-label">Next Assigned Slot In</div>
                <svg viewBox="0 0 100 100" width="100" height="100" id="slot-ring-svg" style="display:block;margin:6px auto">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1e2e" stroke-width="6"/>
                  <circle id="slot-ring-arc" cx="50" cy="50" r="42" fill="none" stroke="#2d3148"
                    stroke-width="6" stroke-dasharray="0 264" stroke-dashoffset="0"
                    transform="rotate(-90 50 50)" stroke-linecap="round"/>
                </svg>
                <div class="bt-time" id="bt-next-slot" style="font-size:17px;letter-spacing:1px;margin-top:2px">--:--:--</div>
                <div class="bt-sub" id="bt-next-slot-abs" style="font-size:10px">--</div>
              </div>
              <div class="block-timer-wrap">
                <div class="bt-label">Time Since Last Chain Block</div>
                <div class="bt-time" id="bt-time">--:--:--</div>
                <div class="bt-sub" id="bt-sub">Block #--</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- POOL -->
      <div class="panel" id="panel-pool">
        <div class="panel-title">Pool Info</div>
        <div class="action-row">
          <button class="btn-action" id="btn-run-pool-info">Refresh Pool Info</button>
          <button class="btn-action danger" id="btn-confirm-retire">Retire Pool</button>
        </div>
        <div class="terminal" id="pool-terminal">Click Refresh Pool Info to load...</div>
      </div>

      <!-- KES -->
      <div class="panel" id="panel-kes">
        <div class="panel-title">KES Key Management</div>
        <div class="action-row">
          <button class="btn-action" id="btn-check-kes">Check KES Expiry</button>
          <button class="btn-action success" id="btn-rotate-kes">Rotate KES Keys</button>
        </div>
        <div class="terminal" id="kes-terminal">Click Check KES Expiry to load...</div>
      </div>

      <!-- BLOCKS -->
      <div class="panel" id="panel-blocks">
        <div class="panel-title">Block Production</div>
        <div class="action-row">
          <button class="btn-action" id="btn-run-blocks">Refresh Block Stats</button>
        </div>
        <div class="terminal" id="blocks-terminal">Click Refresh to load block stats...</div>
      </div>

      <!-- WALLET -->
      <div class="panel" id="panel-wallet">
        <div class="panel-title">Wallets</div>
        <div class="action-row"><button class="btn-action" id="btn-list-wallets">List Wallets</button></div>
        <div class="terminal" id="wallet-terminal">Click List Wallets to load...</div>
      </div>

      <!-- SEND -->
      <div class="panel" id="panel-send">
        <div class="panel-title">Send ADA</div>
        <div style="max-width:480px">
          <div class="form-group"><label>From Wallet</label><input id="send-from" type="text" placeholder="wallet name" /></div>
          <div class="form-group"><label>To Address</label><input id="send-to" type="text" placeholder="addr1..." /></div>
          <div class="form-group"><label>Amount (ADA)</label><input id="send-amount" type="number" placeholder="0.00" min="1" step="0.1" /></div>
          <button class="btn btn-primary" style="width:auto;padding:10px 24px" id="btn-confirm-send">Review and Send</button>
        </div>
        <div class="terminal" id="send-terminal" style="margin-top:20px"></div>
      </div>

      <!-- REWARDS -->
      <div class="panel" id="panel-rewards">
        <div class="panel-title">Rewards</div>
        <div class="action-row">
          <button class="btn-action" id="btn-check-rewards">Check Rewards</button>
          <button class="btn-action" id="btn-confirm-withdraw">Withdraw Rewards</button>
        </div>
        <div class="terminal" id="rewards-terminal">Click Check Rewards to load...</div>
      </div>

      <!-- GOVERNANCE -->
      <div class="panel" id="panel-governance">
        <div class="panel-title">DRep / Governance</div>
        <div class="action-row">
          <button class="btn-action" id="btn-check-drep">DRep Status</button>
          <button class="btn-action" id="btn-list-gov-actions">Active Gov Actions</button>
        </div>
        <div class="terminal" id="governance-terminal">Select an action to load...</div>
      </div>

      <!-- ASSETS -->
      <div class="panel" id="panel-assets">
        <div class="panel-title">Native Assets</div>
        <div class="action-row"><button class="btn-action" id="btn-list-assets">List Assets</button></div>
        <div class="terminal" id="assets-terminal">Click List Assets to load...</div>
      </div>

      <!-- SECURITY -->
      <div class="panel" id="panel-security">
        <div class="panel-title">Key Security</div>
        <div class="action-row">
          <button class="btn-action success" id="btn-prompt-decrypt">Decrypt Keys</button>
          <button class="btn-action danger"  id="btn-prompt-encrypt">Encrypt and Wipe</button>
        </div>
        <div style="background:rgba(255,184,0,0.08);border:1px solid var(--warning);border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:var(--warning)">
          Decrypt keys only when needed for pool operations. Re-encrypt immediately after.
        </div>
        <div class="terminal" id="security-terminal">Key status will appear here...</div>
      </div>

      <!-- SETTINGS -->
      <div class="panel" id="panel-settings">
        <div class="panel-title">Settings</div>
        <div style="max-width:600px">
          <div style="background:rgba(0,83,255,0.08);border:1px solid var(--accent);border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px;color:var(--text)">
            Enter your env file path and pool name. Everything else is detected automatically.
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Node Configuration</div>
            <div class="form-group"><label>Path to env file</label><input id="s-envpath" type="text" placeholder="/path/to/cnode/scripts/env" /></div>
            <div class="form-group"><label>Pool Name (folder name under priv/pool/)</label><input id="s-poolname" type="text" placeholder="e.g. MYPOOL" /></div>
            <div class="form-group">
              <label>Network</label>
              <select id="s-network">
                <option value="mainnet">Mainnet</option>
                <option value="preprod">Preprod</option>
                <option value="preview">Preview</option>
              </select>
            </div>
            <button class="btn-action success" id="btn-detect-settings" style="margin-top:8px">Auto-Detect from env file</button>
          </div>
          <div class="card" id="detected-settings" style="margin-bottom:16px;display:none">
            <div class="card-label" style="margin-bottom:16px">Detected Configuration</div>
            <div class="terminal" id="settings-terminal" style="min-height:120px">Click Auto-Detect to load configuration...</div>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Detected Values</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted);width:40%">CNODE_HOME</td><td style="padding:8px 4px" id="d-cnodehome">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">Pool Name</td><td style="padding:8px 4px" id="d-poolname">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">Pool ID</td><td style="padding:8px 4px;font-family:monospace;font-size:11px" id="d-poolid">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">Pool Ticker</td><td style="padding:8px 4px" id="d-ticker">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">Node Port</td><td style="padding:8px 4px" id="d-nodeport">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">Prometheus Port</td><td style="padding:8px 4px" id="d-promport">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">cntools.library</td><td style="padding:8px 4px" id="d-library">&mdash;</td></tr>
              <tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 4px;color:var(--text-muted)">op.cert path</td><td style="padding:8px 4px" id="d-opcert">&mdash;</td></tr>
              <tr><td style="padding:8px 4px;color:var(--text-muted)">Node Version</td><td style="padding:8px 4px" id="d-nodeversion">&mdash;</td></tr>
            </table>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Key Scripts</div>
            <div class="form-group"><label>Decrypt keys script path</label><input id="s-decryptscript" type="text" placeholder="Optional: /path/to/decrypt-keys.sh" /></div>
            <div class="form-group"><label>Encrypt keys script path</label><input id="s-encryptscript" type="text" placeholder="Optional: /path/to/encrypt-keys.sh" /></div>
          </div>
          <button class="btn btn-primary" style="width:auto;padding:10px 32px" id="btn-save-settings">Save Settings</button>
          <button class="btn-action danger" style="margin-left:12px" id="btn-reset-settings">Reset Settings</button>
          <button class="btn-action"        style="margin-left:12px" id="btn-rerun-wizard">Re-run Setup Wizard</button>
          <span id="settings-saved" style="color:var(--success);margin-left:12px;font-size:13px;display:none">&#10003; Settings saved</span>
        </div>
      </div>

      <!-- TERMINAL -->
      <div class="panel" id="panel-terminal">
        <div class="panel-title">Terminal</div>
        <div class="form-row" style="margin-bottom:12px;gap:8px">
          <input id="term-cmd" type="text" placeholder="Enter command..." style="flex:1" />
          <button class="btn-action" style="white-space:nowrap" id="btn-run-cmd">Run</button>
        </div>
        <div class="terminal" id="custom-terminal">Output will appear here...</div>
      </div>

    </div>
  </div>
</div>
`

// ── HELPERS ──
function setText(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}

function formatADA(lovelace) {
  if (!lovelace) return '--'
  const ada = parseInt(lovelace) / 1000000
  if (ada >= 1000000) return (ada / 1000000).toFixed(2) + 'M ₳'
  if (ada >= 1000)    return (ada / 1000).toFixed(1)    + 'K ₳'
  return ada.toFixed(0) + ' ₳'
}

function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function formatCountdown(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return d + 'd ' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
}

async function run(command, terminalId) {
  const term = document.getElementById(terminalId)
  if (term) term.textContent = 'Running...'
  try {
    const result = await invoke('ssh_run', { command })
    if (term) term.textContent = result.output || result.error || '(no output)'
  } catch(e) {
    if (term) term.textContent = 'Error: ' + String(e)
  }
}

// ── GAUGE UPDATE ──
function updateGauge(svgId, pct, label, color) {
  const svg = document.getElementById(svgId)
  if (!svg) return
  const arcLen = 330 * Math.min(Math.max(pct, 0), 100) / 100
  const arc = svg.querySelector('.gauge-arc')
  const val = svg.querySelector('.gauge-val')
  if (arc) { arc.setAttribute('stroke-dasharray', `${arcLen.toFixed(1)} 440`); arc.setAttribute('stroke', color) }
  if (val) val.textContent = label
}

// ── PROMETHEUS PARSER ──
function parsePrometheus(text) {
  const m = {}
  ;(text || '').split('\n').forEach(line => {
    if (!line || line.startsWith('#')) return
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:\{[^}]*\})?\s+([\d.e+\-]+)/i)
    if (match) { const v = parseFloat(match[2]); if (!isNaN(v)) m[match[1]] = v }
  })
  return m
}

// ── BECH32 ENCODER (pool hex → pool1...) ──
function hexToPoolBech32(hex) {
  const CHARSET   = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
  const GENERATOR = [0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3]
  function polymod(values) {
    let chk = 1
    for (const v of values) {
      const top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v
      for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GENERATOR[i]
    }
    return chk
  }
  function hrpExpand(hrp) {
    const r = []
    for (const c of hrp) r.push(c.charCodeAt(0) >> 5)
    r.push(0)
    for (const c of hrp) r.push(c.charCodeAt(0) & 31)
    return r
  }
  function convertbits(data, frombits, tobits, pad) {
    let acc = 0, bits = 0; const ret = [], maxv = (1 << tobits) - 1
    for (const v of data) {
      acc = (acc << frombits) | v; bits += frombits
      while (bits >= tobits) { bits -= tobits; ret.push((acc >> bits) & maxv) }
    }
    if (pad && bits > 0) ret.push((acc << (tobits - bits)) & maxv)
    return ret
  }
  const hrp    = 'pool'
  const bytes  = hex.match(/.{1,2}/g).map(b => parseInt(b, 16))
  const data   = convertbits(bytes, 8, 5, true)
  const values = hrpExpand(hrp).concat(data).concat([0,0,0,0,0,0])
  const mod    = polymod(values) ^ 1
  const cksum  = []
  for (let i = 0; i < 6; i++) cksum.push((mod >> (5 * (5 - i))) & 31)
  return hrp + '1' + data.concat(cksum).map(d => CHARSET[d]).join('')
}

// ── TIP DATA ──
function updateTipData(tipJson) {
  try {
    const tip         = JSON.parse(tipJson)
    const sync        = parseFloat(tip.syncProgress) || 0
    const slot        = tip.slot  || 0
    const block       = tip.block || 0
    const epoch       = tip.epoch || 0
    currentEpoch      = epoch
    const slotInEpoch = tip.slotInEpoch     != null ? tip.slotInEpoch     : (slot % 432000)
    const slotsToEnd  = tip.slotsToEpochEnd != null ? tip.slotsToEpochEnd : (432000 - slotInEpoch)

    const syncColor = sync > 99 ? '#00c48c' : sync > 90 ? '#ffb800' : '#ff4d4d'
    updateGauge('gauge-sync',  sync, sync.toFixed(1) + '%', syncColor)
    const epochPct = (slotInEpoch / 432000) * 100
    updateGauge('gauge-epoch', epochPct, epochPct.toFixed(1) + '%', '#0053ff')

    setText('qs-slot',    slot.toLocaleString())
    setText('qs-block',   block.toLocaleString())
    setText('qs-epoch',   epoch.toString())
    setText('qs-slot-ep', slotInEpoch.toLocaleString() + ' / 432,000')
    if (tip.era) setText('qs-era', tip.era)

    const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
    if (s.poolname) setText('qs-pool', s.poolname)
    epochSlotsLeft = slotsToEnd

    if (block && block !== lastBlockNum) {
      lastBlockNum  = block
      lastBlockTime = Date.now()
      setText('bt-sub', 'Block #' + block.toLocaleString())
    }
  } catch(e) {}
}

// ── PROMETHEUS DATA ──
function updatePrometheusData(promText) {
  const m = parsePrometheus(promText)

  const mempTx    = m['cardano_node_metrics_txsInMempool_int']
  const mempBytes = m['cardano_node_metrics_mempoolBytes_int']
  const memory    = m['cardano_node_metrics_RTS_gcLiveBytes_int']
  const density   = m['cardano_node_metrics_density_real']
  if (mempTx    != null) setText('mc-mempool-tx', Math.round(mempTx).toString())
  if (mempBytes != null) setText('mc-mempool-kb', (mempBytes / 1024).toFixed(1))
  if (memory    != null) setText('mc-memory',     (memory / 1024 / 1024 / 1024).toFixed(2))
  if (density   != null) setText('mc-density',    (density * 100).toFixed(2) + '%')

  const vMatch = promText.match(/cardano_node_metrics_cardano_build_info[^}]*,version="([^"]+)"/)
  if (vMatch) setText('qs-version', vMatch[1])
}

// ── KOIOS DATA ──
async function fetchKoiosData() {
  const s         = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const poolId    = s.poolid
  const loadingEl = document.getElementById('pool-data-loading')
  const gridEl    = document.getElementById('pool-data-grid')

  if (!poolId) { if (loadingEl) loadingEl.textContent = '⚠️ No pool ID — run Auto-Detect in Settings'; return }

  try {
    const bech32Id = /^[0-9a-f]{56}$/i.test(poolId) ? hexToPoolBech32(poolId) : poolId
    const bodyStr  = `{"_pool_bech32_ids":["${bech32Id}"]}`
    const r = await invoke('ssh_run', {
      command: `printf '%s' '${bodyStr}' > /tmp/pm_koios.json && curl -s -X POST https://api.koios.rest/api/v1/pool_info -H 'Content-Type: application/json' -H 'accept: application/json' -d @/tmp/pm_koios.json`
    })
    const raw = (r.output || '').trim()
    if (!raw.startsWith('[') && !raw.startsWith('{')) { if (loadingEl) loadingEl.textContent = 'Koios: ' + raw.slice(0,100); return }
    const p = JSON.parse(raw)[0]
    if (!p) { if (loadingEl) loadingEl.textContent = 'Pool not found on Koios'; return }

    if (loadingEl) loadingEl.style.display = 'none'
    if (gridEl)    gridEl.style.display    = 'grid'

    setText('ps-live-stake',   formatADA(p.live_stake))
    setText('ps-active-stake', formatADA(p.active_stake))
    setText('ps-delegators',   (p.live_delegators ?? '--').toString())

    const sat = p.live_saturation != null ? parseFloat(p.live_saturation).toFixed(2) + '%' : '--'
    setText('ps-saturation', sat)

    // Store live_stake + saturation for cncli ideal calc
    const toStore = JSON.parse(localStorage.getItem('pm_settings') || '{}')
    if (p.live_saturation != null) toStore.liveSaturation = parseFloat(p.live_saturation)
    if (p.live_stake)      toStore.liveStakeLovelace     = p.live_stake
    localStorage.setItem('pm_settings', JSON.stringify(toStore))

    // Fetch total active stake for current epoch (needed for accurate ideal blocks)
    if (currentEpoch > 0) {
      try {
        const epochR = await invoke('ssh_run', {
          command: `curl -s "https://api.koios.rest/api/v1/epoch_info?_epoch_no=${currentEpoch}"`
        })
        const epochRaw = (epochR.output || '').trim()
        if (epochRaw.startsWith('[')) {
          const epochData = JSON.parse(epochRaw)
          if (epochData[0] && epochData[0].active_stake) {
            const toStore2 = JSON.parse(localStorage.getItem('pm_settings') || '{}')
            toStore2.totalActiveStakeLovelace = epochData[0].active_stake
            localStorage.setItem('pm_settings', JSON.stringify(toStore2))
          }
        }
      } catch(e) {}
    }

    setText('ps-blocks', (p.block_count ?? '--').toString())
    setText('ps-pledge',  formatADA(p.pledge))
    setText('ps-margin',  p.margin != null ? (parseFloat(p.margin) * 100).toFixed(2) + '%' : '--')
    setText('ps-fee',     p.fixed_cost ? (parseInt(p.fixed_cost) / 1_000_000).toFixed(0) + ' ₳' : '--')

    if (p.live_saturation != null) {
      const pct   = parseFloat(p.live_saturation)
      const satEl = document.getElementById('ps-saturation')
      if (satEl) satEl.className = 'ps-value ' + (pct > 90 ? 'danger' : pct > 70 ? 'warning' : 'success')
    }
  } catch(e) {
    if (loadingEl) loadingEl.textContent = 'Koios unavailable: ' + e.message
  }
}

// ── CNCLI DATA ──
async function fetchCncliData() {
  const s        = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const home     = s.cnodehome || '/opt/cardano/cnode'
  const poolIdHex = s.poolid   || ''
  const db       = home + '/guild-db/cncli/cncli.db'
  const badge    = document.getElementById('cncli-badge')
  const missing  = document.getElementById('cncli-missing')

  const cncliCheck = await invoke('ssh_run', { command: 'which cncli 2>/dev/null || ls ~/.local/bin/cncli 2>/dev/null || ls /usr/local/bin/cncli 2>/dev/null || ls ~/.cargo/bin/cncli 2>/dev/null || echo MISSING' })
  const cncliPath  = (cncliCheck.output || '').trim().split('\n')[0]
  const hasCncli   = !!cncliPath && !cncliPath.includes('MISSING')
  if (badge)   badge.style.display   = hasCncli ? 'inline' : 'none'
  if (missing) missing.style.display = hasCncli ? 'none'   : 'inline'
  if (!hasCncli) {
    // cncli not installed — show '--' for all Block Activity stats gracefully
    ;['bsc-leader','bsc-ideal','bsc-luck','bsc-adopted','bsc-confirmed','bsc-lost'].forEach(id => {
      const el = document.getElementById(id)
      if (el) { el.textContent = '--'; el.className = 'bsc-val' }
    })
    setText('bt-next-slot',     '--:--:--')
    setText('bt-next-slot-abs', 'cncli not installed — leader schedule unavailable')
    const ringArcNC = document.getElementById('slot-ring-arc')
    if (ringArcNC) { ringArcNC.setAttribute('stroke-dasharray', '0 264'); ringArcNC.setAttribute('stroke', '#2d3148') }
    return
  }

  try {
    const tipR        = await invoke('ssh_run', { command: `source ${home}/scripts/env && cardano-cli latest query tip --mainnet 2>/dev/null` })
    const tip         = JSON.parse(tipR.output || '{}')
    const currentSlot = tip.slot  || 0
    const currentEpoch = tip.epoch || 0

    const slotsR = await invoke('ssh_run', {
      command: `sqlite3 ${db} "SELECT slot_qty, slots FROM slots WHERE epoch=${currentEpoch};" 2>/dev/null`
    })
    let leaderCount = 0, slotList = []
    if (slotsR.output && slotsR.output.trim()) {
      const parts = slotsR.output.trim().split('|')
      leaderCount = parseInt(parts[0]) || 0
      try { slotList = JSON.parse(parts[1] || '[]') } catch(e) { slotList = [] }
    }
    setText('bsc-leader', leaderCount.toString())

    // Ideal + Luck — use live_stake/totalActiveStake for accurate sigma
    const freshS = JSON.parse(localStorage.getItem('pm_settings') || '{}')
    let ideal = null
    if (freshS.liveStakeLovelace && freshS.totalActiveStakeLovelace) {
      const sigma = parseInt(freshS.liveStakeLovelace) / parseInt(freshS.totalActiveStakeLovelace)
      ideal = sigma * 21600
    } else if (freshS.liveSaturation != null) {
      // Fallback: approximate via saturation / nOpt (less accurate but works without epoch_info)
      ideal = (freshS.liveSaturation / 100 / 500) * 21600
    }
    if (ideal != null) {
      setText('bsc-ideal', ideal.toFixed(2))
      if (leaderCount > 0 && ideal > 0) {
        const luck   = (leaderCount / ideal * 100).toFixed(2)
        const luckEl = document.getElementById('bsc-luck')
        if (luckEl) { luckEl.textContent = luck + '%'; luckEl.className = 'bsc-val' + (parseFloat(luck) >= 100 ? ' success' : parseFloat(luck) >= 75 ? '' : ' warning') }
      } else { setText('bsc-luck', '0%') }
    }

    // Confirmed (non-orphaned in our assigned slots range)
    if (poolIdHex && slotList.length > 0) {
      const slotMin = Math.min(...slotList), slotMax = Math.max(...slotList)
      const confR   = await invoke('ssh_run', {
        command: `sqlite3 ${db} "SELECT count(*) FROM chain WHERE pool_id='${poolIdHex}' AND orphaned=0 AND slot_number>=${slotMin} AND slot_number<=${slotMax};" 2>/dev/null`
      })
      const confirmed = parseInt((confR.output || '0').trim()) || 0
      const confEl    = document.getElementById('bsc-confirmed')
      if (confEl) { confEl.textContent = confirmed.toString(); confEl.className = 'bsc-val' + (confirmed > 0 ? ' success' : '') }
      // bsc-adopted = epoch-only adopted (non-orphaned blocks in our assigned slots this epoch)
      const adoptedEl = document.getElementById('bsc-adopted')
      if (adoptedEl) { adoptedEl.textContent = confirmed.toString(); adoptedEl.className = 'bsc-val' + (confirmed > 0 ? ' success' : '') }

      // Lost (orphaned blocks in our assigned slot range this epoch)
      const lostR = await invoke('ssh_run', {
        command: `sqlite3 ${db} "SELECT count(*) FROM chain WHERE pool_id='${poolIdHex}' AND orphaned=1 AND slot_number>=${slotMin} AND slot_number<=${slotMax};" 2>/dev/null`
      })
      const lost   = parseInt((lostR.output || '0').trim()) || 0
      const lostEl = document.getElementById('bsc-lost')
      if (lostEl) { lostEl.textContent = lost.toString(); lostEl.className = 'bsc-val' + (lost > 0 ? ' danger' : '') }
    } else {
      setText('bsc-confirmed', '0')
      setText('bsc-adopted',   '0')
      setText('bsc-lost',      '0')
    }

    // Next slot countdown
    const futureSlots = slotList.filter(sl => sl > currentSlot).sort((a, b) => a - b)
    if (futureSlots.length > 0) {
      // Store original distance only when the target slot changes
      if (window._nextSlotAbs !== futureSlots[0]) {
        window._nextSlotOriginalDistance = futureSlots[0] - currentSlot
      }
      window._nextSlotSlotsAway = futureSlots[0] - currentSlot
      window._nextSlotAbs       = futureSlots[0]
      setText('bt-next-slot-abs', 'Slot ' + futureSlots[0].toLocaleString() + ' (' + futureSlots.length + ' remaining)')
    } else {
      window._nextSlotSlotsAway = null
      window._nextSlotOriginalDistance = null
      const ringArc = document.getElementById('slot-ring-arc')
      if (ringArc) { ringArc.setAttribute('stroke-dasharray', '0 264'); ringArc.setAttribute('stroke', '#2d3148') }
      setText('bt-next-slot',     'No slots')
      setText('bt-next-slot-abs', leaderCount > 0 ? 'All slots passed this epoch' : 'No slots this epoch')
    }
  } catch(e) { console.error('cncli fetch error:', e) }
}

// ── KES DATA ──
async function fetchKESData() {
  const c = cfg()
  try {
    const kes = await invoke('ssh_run', { command: `source ${c.env} && cardano-cli query kes-period-info ${c.netflag} --op-cert-file ${c.opcert} 2>/dev/null` })
    if (!kes.success || !kes.output) return
    const expiryM  = kes.output.match(/"qKesKesKeyExpiry":\s*"([^"]+)"/)
    const endM     = kes.output.match(/"qKesEndKesInterval":\s*(\d+)/)
    const currentM = kes.output.match(/"qKesCurrentKesPeriod":\s*(\d+)/)
    if (!expiryM) return
    const expiry      = new Date(expiryM[1])
    const daysLeft    = Math.floor((expiry - new Date()) / 86400000)
    const periodsLeft = (endM && currentM) ? parseInt(endM[1]) - parseInt(currentM[1]) : null
    const fillPct     = periodsLeft != null ? (periodsLeft / 62) * 100 : Math.max(0, (daysLeft / 93) * 100)
    const color       = daysLeft < 7 ? '#ff4d4d' : daysLeft < 30 ? '#ffb800' : '#00c48c'
    const fill        = document.getElementById('kes-fill')
    if (fill) { fill.style.height = Math.min(100, Math.max(0, fillPct)) + '%'; fill.style.background = `linear-gradient(to top, ${color}, ${color}99)` }
    setText('kes-days',    daysLeft + 'd')
    setText('kes-periods', periodsLeft != null ? periodsLeft + ' / 62 periods' : 'periods unknown')
    setText('kes-expiry',  'Expires: ' + expiry.toLocaleDateString('en-GB'))
    const daysEl = document.getElementById('kes-days')
    if (daysEl) daysEl.style.color = color
  } catch(e) {}
}

// ── LOCAL TICK (1s) ──
function startLocalTick() {
  if (localTickInterval) clearInterval(localTickInterval)
  localTickInterval = setInterval(() => {

    // Epoch countdown
    if (epochSlotsLeft != null && epochSlotsLeft > 0) {
      epochSlotsLeft--
      setText('qs-next-epoch', formatCountdown(epochSlotsLeft))
      const sie = 432000 - epochSlotsLeft
      updateGauge('gauge-epoch', (sie / 432000) * 100, ((sie / 432000) * 100).toFixed(1) + '%', '#0053ff')
    }

    // Chain tip block timer
    if (lastBlockTime) {
      const elapsed = Math.floor((Date.now() - lastBlockTime) / 1000)
      setText('bt-time', formatElapsed(elapsed))
      const btEl = document.getElementById('bt-time')
      if (btEl) btEl.style.color = elapsed > 180 ? 'var(--danger)' : elapsed > 60 ? 'var(--warning)' : 'var(--success)'
    }

    // Next assigned slot countdown
    if (window._nextSlotSlotsAway != null && window._nextSlotSlotsAway > 0) {
      window._nextSlotSlotsAway--
      const ns   = window._nextSlotSlotsAway
      setText('bt-next-slot', formatCountdown(ns))
      const nsEl = document.getElementById('bt-next-slot')
      if (nsEl) nsEl.style.color = ns < 30 ? 'var(--warning)' : 'var(--success)'

      // Update countdown ring
      const ringArc = document.getElementById('slot-ring-arc')
      if (ringArc && window._nextSlotOriginalDistance > 0) {
        const pct   = Math.max(0, ns / window._nextSlotOriginalDistance)
        const circ  = 264
        ringArc.setAttribute('stroke-dasharray', `${(pct * circ).toFixed(1)} ${circ}`)
        const color = ns < 30 ? '#ff4d4d' : ns < 1800 ? '#ffb800' : '#00c48c'
        ringArc.setAttribute('stroke', color)
        if (ns < 30) ringArc.classList.add('slot-pulse')
        else         ringArc.classList.remove('slot-pulse')
      }
    } else if (window._nextSlotSlotsAway === 0) {
      setText('bt-next-slot', '00:00:00')
    }

  }, 1000)
}

function stopLocalTick() { if (localTickInterval) clearInterval(localTickInterval); localTickInterval = null }

// ── RESOURCES DATA (CPU, Memory, Disk — matching gLiveView methodology) ──
async function fetchResourcesData() {
  const s        = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const home     = s.cnodehome || '/opt/cardano/cnode'
  const nodePort = s.nodeport  || '6000'
  try {
    const r = await invoke('ssh_run', {
      command:
        `CPU=$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk '{print $2}' | cut -d% -f1); ` +
        // Node RSS from ps (matches gLiveView Mem RSS)
        `BPID=$(ss -tnlp 2>/dev/null | grep ":${nodePort} " | grep -o "pid=[0-9]*" | grep -o "[0-9]*" | head -1); ` +
        `RSS=$(ps -q $BPID -o rss= 2>/dev/null | awk '{printf "%.1f", $1/1048576}'); ` +
        // System memory %
        `MEM=$(free -m 2>/dev/null | awk 'NR==2{printf "%.1f", $3/$2*100}'); ` +
        // Disk % for cnode home partition
        `DISK=$(df "${home}" 2>/dev/null | awk 'NR==2{print $5}' | tr -d '%'); ` +
        `echo "$CPU $RSS $MEM $DISK"`
    })
    const parts = (r.output || '').trim().split(' ')
    const cpu  = parseFloat(parts[0])
    const rss  = parseFloat(parts[1])
    const mem  = parseFloat(parts[2])
    const disk = parseFloat(parts[3])

    const cpuEl  = document.getElementById('mc-cpu')
    const rssEl  = document.getElementById('mc-mem-rss')
    const memEl  = document.getElementById('mc-mem-pct')
    const diskEl = document.getElementById('mc-disk')

    if (!isNaN(cpu)  && cpuEl)  { cpuEl.textContent  = cpu.toFixed(1) + '%';  cpuEl.className  = 'mc-value' + (cpu  > 90 ? ' danger' : cpu  > 70 ? ' warning' : '') }
    if (!isNaN(rss)  && rssEl)  { rssEl.textContent  = rss.toFixed(1) + 'G';  rssEl.className  = 'mc-value' }
    if (!isNaN(mem)  && memEl)  { memEl.textContent  = mem.toFixed(1) + '%';  memEl.className  = 'mc-value' + (mem  > 90 ? ' danger' : mem  > 70 ? ' warning' : '') }
    if (!isNaN(disk) && diskEl) { diskEl.textContent = disk.toFixed(0) + '%'; diskEl.className = 'mc-value' + (disk > 90 ? ' danger' : disk > 70 ? ' warning' : '') }

    // Also update Prometheus Memory GB card with RSS if Prometheus hasn't populated it
    if (!isNaN(rss)) {
      const promMemEl = document.getElementById('mc-memory')
      if (promMemEl && promMemEl.textContent === '--') setText('mc-memory', rss.toFixed(2))
    }
  } catch(e) {}
}

// ── PEERS DATA (via ss, same method as gLiveView) ──
async function fetchPeersData() {
  const s        = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const nodePort = s.nodeport || '6000'
  const promPort = s.promport || '12799'
  try {
    const r = await invoke('ssh_run', {
      command:
        `BPID=$(ss -tnlp 2>/dev/null | grep ":${nodePort} " | grep -o "pid=[0-9]*" | grep -o "[0-9]*" | head -1); ` +
        `PIN=$(ss -tnp state established 2>/dev/null | grep "pid=$BPID," | grep ":${nodePort} " | wc -l); ` +
        `POUT=$(ss -tnp state established 2>/dev/null | grep "pid=$BPID," | grep -v ":${nodePort} \|:${promPort} " | wc -l); ` +
        `echo "$PIN $POUT"`
    })
    const parts = (r.output || '').trim().split(' ')
    const pIn   = parseInt(parts[0])
    const pOut  = parseInt(parts[1])
    if (!isNaN(pIn))  setText('mc-peers-in',  pIn.toString())
    if (!isNaN(pOut)) setText('mc-peers-out', pOut.toString())
  } catch(e) {}
}

// ── DASHBOARD LOAD ──
async function loadDashboard() {
  const c = cfg()
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  if (!s.cnodehome) return

  try {
    const r = await invoke('ssh_run', {
      command: `source ${c.env} && cardano-cli latest query tip --mainnet 2>/dev/null; echo "~~PROM~~"; curl -s http://127.0.0.1:${c.promport}/metrics 2>/dev/null`
    })
    if (r.success && r.output) {
      const parts = r.output.split('~~PROM~~')
      if (parts[0]) updateTipData(parts[0].trim())
      if (parts[1]) updatePrometheusData(parts[1])
    }
  } catch(e) {}

  if (kesFetchCounter === 0) { fetchKESData(); fetchKoiosData() }
  kesFetchCounter = (kesFetchCounter + 1) % 10

  fetchCncliData()
  fetchPeersData()
  fetchResourcesData()
}

// ── AUTO REFRESH ──
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(loadDashboard, 30000)
  startLocalTick()
}
function stopAutoRefresh() { if (refreshInterval) clearInterval(refreshInterval); refreshInterval = null; stopLocalTick() }

// ── NAVIGATION ──
function showPanel(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-panel="${name}"]`)?.classList.add('active')
  document.getElementById(`panel-${name}`)?.classList.add('active')
}

// ── SETTINGS ──
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  if (s.envpath)       document.getElementById('s-envpath').value = s.envpath
  if (s.poolname)      document.getElementById('s-poolname').value = s.poolname
  if (s.network)       document.getElementById('s-network').value = s.network
  if (s.decryptscript) document.getElementById('s-decryptscript').value = s.decryptscript
  if (s.encryptscript) document.getElementById('s-encryptscript').value = s.encryptscript
  if (s.cnodehome)     updateDetectedTable(s)
}

function updateDetectedTable(s) {
  if (s.cnodehome)               setText('d-cnodehome',   s.cnodehome)
  if (s.poolname)                setText('d-poolname',    s.poolname)
  if (s.poolid)                  setText('d-poolid',      s.poolid)
  if (s.ticker)                  setText('d-ticker',      s.ticker)
  if (s.nodeport)                setText('d-nodeport',    s.nodeport)
  if (s.promport)                setText('d-promport',    s.promport)
  if (s.cnodehome)               setText('d-library',    s.cnodehome + '/scripts/cntools.library')
  if (s.cnodehome && s.poolname) setText('d-opcert',     s.cnodehome + '/priv/pool/' + s.poolname + '/op.cert')
  if (s.nodeversion)             setText('d-nodeversion', s.nodeversion)
}

function applySettings() {
  loadSettings()
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  if (s.poolname) setText('qs-pool', s.poolname)
}

async function detectSettings() {
  const envpath  = document.getElementById('s-envpath').value.trim()
  const poolname = document.getElementById('s-poolname').value.trim()
  const term     = document.getElementById('settings-terminal')
  if (!envpath) { alert('Please enter the env file path first'); return }
  document.getElementById('detected-settings').style.display = 'block'
  term.textContent = 'Reading env file...'
  try {
    const normalEnvpath = envpath.endsWith('/env') ? envpath : envpath.replace(/\/?$/, '/env')
    const cnodehome     = normalEnvpath.replace('/scripts/env', '')
    document.getElementById('s-envpath').value = normalEnvpath
    const envResult = await invoke('ssh_run', { command: 'cat ' + normalEnvpath + ' | grep -v "^#" | grep -v "^$" | grep "^[A-Z_]*="' })
    const envText   = envResult.output || ''
    const s = { envpath: normalEnvpath, poolname, cnodehome }
    const poolidM      = envText.match(/^POOL_ID="?([^"\n]+)"?/m)
    const tickerM      = envText.match(/^POOL_TICKER="?([^"\n]+)"?/m)
    const nodeportM    = envText.match(/^CNODE_PORT=([^\s\n]+)/m)
    const detectedPool = envText.match(/^POOL_NAME="?([^"\n]+)"?/m)
    if (poolidM)   s.poolid   = poolidM[1].trim()
    if (tickerM)   s.ticker   = tickerM[1].trim()
    if (nodeportM) s.nodeport = nodeportM[1].trim()
    s.poolname = poolname || (detectedPool ? detectedPool[1].trim() : '')
    const configResult = await invoke('ssh_run', { command: 'grep -o "PrometheusSimple [^ ]* [0-9]*" ' + cnodehome + '/files/config.json 2>/dev/null' })
    const promMatch = configResult.output.match(/PrometheusSimple\s+\S+\s+(\d+)/)
    s.promport = promMatch ? promMatch[1] : '12799'
    const metricsResult = await invoke('ssh_run', { command: 'curl -s http://127.0.0.1:' + s.promport + '/metrics 2>/dev/null | grep cardano_node_metrics_cardano_build_info' })
    const versionMatch = metricsResult.output.match(/,version="([^"]+)"/)
    s.nodeversion = versionMatch ? versionMatch[1] : 'Unknown'
    s.decryptscript = s.decryptscript || ''; s.encryptscript = s.encryptscript || ''
    updateDetectedTable(s)
    term.textContent = 'Detection complete:\n\n' + JSON.stringify(s, null, 2)
    localStorage.setItem('pm_settings', JSON.stringify(s))
  } catch(e) { term.textContent = 'Detection failed: ' + String(e) }
}

function saveSettings() {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  s.envpath       = document.getElementById('s-envpath').value.trim()
  s.poolname      = document.getElementById('s-poolname').value.trim()
  s.network       = document.getElementById('s-network').value
  s.decryptscript = document.getElementById('s-decryptscript').value.trim()
  s.encryptscript = document.getElementById('s-encryptscript').value.trim()
  localStorage.setItem('pm_settings', JSON.stringify(s))
  const saved = document.getElementById('settings-saved')
  saved.style.display = 'inline'; setTimeout(() => saved.style.display = 'none', 3000)
  updateDetectedTable(s)
}

function resetSettings() {
  if (confirm('Clear all saved settings? This will re-run the setup wizard.')) {
    localStorage.removeItem('pm_settings'); rerunWizard()
  }
}

// ── WIZARD ──
let wizardSettings = null
function wzGo(step) { document.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none'); document.getElementById('wz-' + step).style.display = 'block' }

async function wzConnect() {
  const btn = document.getElementById('wz-conn-btn'), err = document.getElementById('wz-conn-error')
  err.style.display = 'none'
  const host = document.getElementById('wz-host').value.trim(), port = parseInt(document.getElementById('wz-port').value) || 22
  const username = document.getElementById('wz-user').value.trim(), order = document.getElementById('wz-order').value
  const totp = document.getElementById('wz-totp').value.trim(), password = document.getElementById('wz-pass').value
  if (!host || !username || !password) { err.textContent = 'Please fill in host, username and password'; err.style.display = 'block'; return }
  btn.disabled = true; btn.textContent = 'Connecting...'
  try {
    const result = await invoke('ssh_connect', { profile: { host, port, username, auth_order: order, totp_code: totp, password } })
    if (result.success) { saveProfile(host, port, username, order); setText('conn-label', username + '@' + host); wzGo(3) }
    else { err.textContent = result.error || 'Connection failed'; err.style.display = 'block' }
  } catch(e) { err.textContent = 'Connection failed: ' + String(e); err.style.display = 'block' }
  btn.disabled = false; btn.textContent = 'Test Connection →'
}

async function wzDetect() {
  const envpath = document.getElementById('wz-envpath').value.trim(), poolname = document.getElementById('wz-poolname').value.trim()
  const term    = document.getElementById('wz-detect-terminal')
  if (!envpath) { term.textContent = '⚠️ Please enter your env file path first'; return }
  term.textContent = 'Reading env file...'
  try {
    const normalEnvpath = envpath.endsWith('/env') ? envpath : envpath.replace(/\/?$/, '/env')
    const cnodehome     = normalEnvpath.replace('/scripts/env', '')
    document.getElementById('wz-envpath').value = normalEnvpath
    const envResult    = await invoke('ssh_run', { command: 'cat ' + normalEnvpath + ' | grep -v "^#" | grep -v "^$" | grep "^[A-Z_]*="' })
    const envText      = envResult.output || ''
    wizardSettings     = { envpath: normalEnvpath, cnodehome, poolname }
    const poolidM      = envText.match(/^POOL_ID="?([^"\n]+)"?/m)
    const tickerM      = envText.match(/^POOL_TICKER="?([^"\n]+)"?/m)
    const nodeportM    = envText.match(/^CNODE_PORT=([^\s\n]+)/m)
    const detectedPool = envText.match(/^POOL_NAME="?([^"\n]+)"?/m)
    const network      = document.getElementById('wz-network').value
    if (poolidM)   wizardSettings.poolid   = poolidM[1].trim()
    if (tickerM)   wizardSettings.ticker   = tickerM[1].trim()
    if (nodeportM) wizardSettings.nodeport = nodeportM[1].trim()
    wizardSettings.poolname = poolname || (detectedPool ? detectedPool[1].trim() : '')
    wizardSettings.network  = network
    wizardSettings.netflag  = network === 'mainnet' ? '--mainnet' : '--testnet-magic 1'
    if (detectedPool && !poolname) document.getElementById('wz-poolname').value = wizardSettings.poolname
    const configResult = await invoke('ssh_run', { command: 'grep -o "PrometheusSimple [^ ]* [0-9]*" ' + cnodehome + '/files/config.json 2>/dev/null' })
    const promMatch    = configResult.output.match(/PrometheusSimple\s+\S+\s+(\d+)/)
    wizardSettings.promport = promMatch ? promMatch[1] : '12799'
    const metricsResult = await invoke('ssh_run', { command: 'curl -s http://127.0.0.1:' + wizardSettings.promport + '/metrics 2>/dev/null | grep cardano_node_metrics_cardano_build_info' })
    const versionMatch  = metricsResult.output.match(/,version="([^"]+)"/)
    wizardSettings.nodeversion = versionMatch ? versionMatch[1] : 'Unknown'
    term.textContent = '✓ Detected successfully\n\nCNODE_HOME:   ' + cnodehome + '\nPool Name:    ' + wizardSettings.poolname + '\nPool ID:      ' + (wizardSettings.poolid || 'not found') + '\nTicker:       ' + (wizardSettings.ticker || 'not found') + '\nNode Port:    ' + (wizardSettings.nodeport || 'not found') + '\nPrometheus:   ' + wizardSettings.promport + '\nNode Version: ' + wizardSettings.nodeversion
  } catch(e) { term.textContent = '✗ Detection failed: ' + String(e) }
}

function wzSaveNode() {
  const err = document.getElementById('wz-node-error')
  if (!wizardSettings || !wizardSettings.cnodehome) { err.textContent = '⚠️ Please run Auto-Detect first'; err.style.display = 'block'; return }
  err.style.display = 'none'; wzGo(4)
}

function wzFinish() {
  if (!wizardSettings) return
  wizardSettings.decryptscript = document.getElementById('wz-decrypt').value.trim()
  wizardSettings.encryptscript = document.getElementById('wz-encrypt').value.trim()
  localStorage.setItem('pm_settings', JSON.stringify(wizardSettings))
  applySettings(); wzGo(5)
}

function wzLaunch() {
  document.getElementById('wizard-screen').style.display = 'none'
  document.getElementById('connect-screen').style.display = 'none'
  connected = true
  document.getElementById('main-app').classList.add('show')
  loadDashboard(); startAutoRefresh()
}

function rerunWizard() {
  document.getElementById('connect-screen').style.display = 'none'
  document.getElementById('main-app').classList.remove('show')
  stopAutoRefresh(); wizardSettings = null
  document.getElementById('wizard-screen').style.display = 'flex'
  wzGo(1)
}

function checkFirstRun() {
  const s = localStorage.getItem('pm_settings')
  if (!s || Object.keys(JSON.parse(s)).length === 0) {
    document.getElementById('wizard-screen').style.display = 'flex'
    document.getElementById('connect-screen').style.display = 'none'
  }
}

// ── SAVED PROFILES ──
function saveProfile(host, port, username, order) {
  const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]')
  const existing = profiles.findIndex(p => p.host === host && p.username === username)
  const profile  = { host, port, username, order, label: username + '@' + host }
  if (existing >= 0) profiles[existing] = profile; else profiles.push(profile)
  localStorage.setItem('pm_profiles', JSON.stringify(profiles))
  loadProfileDropdown()
}

function loadProfileDropdown() {
  const select   = document.getElementById('c-profile')
  const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]')
  select.innerHTML = '<option value="">-- Select saved profile --</option>'
  profiles.forEach((p, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = p.label; select.appendChild(opt) })
}

// ── EVENT LISTENERS ──
function initEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => showPanel(item.dataset.panel)))
  document.getElementById('key-status')?.addEventListener('click', () => showPanel('security'))

  document.getElementById('c-order').addEventListener('change', function() { document.getElementById('totp-group').style.display = this.value === 'password_only' ? 'none' : 'block' })
  document.getElementById('wz-order').addEventListener('change', function() { document.getElementById('wz-totp-group').style.display = this.value === 'password_only' ? 'none' : 'block' })

  document.getElementById('c-profile').addEventListener('change', function() {
    const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]'), p = profiles[this.value]
    if (p) { document.getElementById('c-host').value = p.host; document.getElementById('c-port').value = p.port; document.getElementById('c-user').value = p.username; document.getElementById('c-order').value = p.order; document.getElementById('totp-group').style.display = p.order === 'password_only' ? 'none' : 'block' }
  })

  document.getElementById('btn-connect').addEventListener('click', async () => {
    const btn = document.getElementById('btn-connect'), errEl = document.getElementById('connect-error')
    errEl.classList.remove('show')
    const host = document.getElementById('c-host').value.trim(), port = parseInt(document.getElementById('c-port').value) || 22
    const username = document.getElementById('c-user').value.trim(), order = document.getElementById('c-order').value
    const totp = document.getElementById('c-totp').value.trim(), password = document.getElementById('c-pass').value
    if (!host || !username || !password) { errEl.textContent = 'Please fill in host, username and password'; errEl.classList.add('show'); return }
    btn.disabled = true; btn.textContent = 'Connecting...'
    try {
      const result = await invoke('ssh_connect', { profile: { host, port, username, auth_order: order, totp_code: totp, password } })
      if (result.success) {
        connected = true
        document.getElementById('connect-screen').style.display = 'none'
        document.getElementById('main-app').classList.add('show')
        setText('conn-label', username + '@' + host)
        saveProfile(host, port, username, order)
        applySettings(); loadDashboard(); startAutoRefresh()
      } else { errEl.textContent = result.error || 'Connection failed'; errEl.classList.add('show') }
    } catch(e) { errEl.textContent = String(e); errEl.classList.add('show') }
    btn.disabled = false; btn.textContent = 'Connect to Node'
  })

  document.getElementById('btn-disconnect').addEventListener('click', async () => {
    await invoke('ssh_disconnect'); connected = false
    document.getElementById('main-app').classList.remove('show')
    stopAutoRefresh()
    document.getElementById('connect-screen').style.display = 'flex'
  })

  document.getElementById('btn-wz-start').addEventListener('click',    () => wzGo(2))
  document.getElementById('btn-wz-back-1').addEventListener('click',   () => wzGo(1))
  document.getElementById('wz-conn-btn').addEventListener('click',     wzConnect)
  document.getElementById('btn-wz-detect').addEventListener('click',   wzDetect)
  document.getElementById('btn-wz-back-2').addEventListener('click',   () => wzGo(2))
  document.getElementById('btn-wz-savenode').addEventListener('click', wzSaveNode)
  document.getElementById('btn-wz-back-3').addEventListener('click',   () => wzGo(3))
  document.getElementById('btn-wz-skip').addEventListener('click',     wzFinish)
  document.getElementById('btn-wz-finish').addEventListener('click',   wzFinish)
  document.getElementById('btn-wz-launch').addEventListener('click',   wzLaunch)

  document.getElementById('btn-run-pool-info').addEventListener('click', () => { const c = cfg(); run(`source ${c.env} && cardano-cli latest query tip --mainnet 2>/dev/null`, 'pool-terminal') })
  document.getElementById('btn-confirm-retire').addEventListener('click', () => { if (confirm('WARNING: This will begin pool retirement. Are you absolutely sure?')) { const c = cfg(); run(`source ${c.env} && source ${c.lib} && deRegisterPool`, 'pool-terminal') } })
  document.getElementById('btn-check-kes').addEventListener('click', () => { const c = cfg(); run(`source ${c.env} && cardano-cli query kes-period-info ${c.netflag} --op-cert-file ${c.opcert} 2>/dev/null`, 'kes-terminal') })
  document.getElementById('btn-rotate-kes').addEventListener('click', () => { if (confirm('Rotate KES keys?')) { const c = cfg(); run(`source ${c.env} && source ${c.lib} && rotatePoolKeys`, 'kes-terminal') } })
  document.getElementById('btn-run-blocks').addEventListener('click', () => { const c = cfg(); run(`source ${c.env} && echo "Block stats via cncli" && ls ${c.home}/scripts/`, 'blocks-terminal') })
  document.getElementById('btn-list-wallets').addEventListener('click', () => { const c = cfg(); run(`ls ${c.wallets} 2>/dev/null || echo "No wallets found"`, 'wallet-terminal') })
  document.getElementById('btn-confirm-send').addEventListener('click', () => {
    const from = document.getElementById('send-from').value.trim(), to = document.getElementById('send-to').value.trim(), amt = document.getElementById('send-amount').value
    if (!from || !to || !amt) { alert('Please fill in all fields'); return }
    if (confirm('Send ' + amt + ' ADA from ' + from + ' to ' + to + '?')) { const c = cfg(); run(`source ${c.env} && source ${c.lib} && sendAssets`, 'send-terminal') }
  })
  document.getElementById('btn-check-rewards').addEventListener('click',    () => { const c = cfg(); run(`source ${c.env} && source ${c.lib} && getWalletRewards 2>/dev/null`, 'rewards-terminal') })
  document.getElementById('btn-confirm-withdraw').addEventListener('click', () => { if (confirm('Withdraw all available rewards?')) { const c = cfg(); run(`source ${c.env} && source ${c.lib} && withdrawRewards`, 'rewards-terminal') } })
  document.getElementById('btn-check-drep').addEventListener('click',       () => { const c = cfg(); run(`source ${c.env} && source ${c.lib} && getDRepStatus 2>/dev/null`, 'governance-terminal') })
  document.getElementById('btn-list-gov-actions').addEventListener('click', () => { const c = cfg(); run(`source ${c.env} && source ${c.lib} && getActiveGovActionCount 2>/dev/null`, 'governance-terminal') })
  document.getElementById('btn-list-assets').addEventListener('click',      () => { const c = cfg(); run(`ls ${c.assets} 2>/dev/null || echo "No assets found"`, 'assets-terminal') })

  document.getElementById('btn-prompt-decrypt').addEventListener('click', () => {
    const s = JSON.parse(localStorage.getItem('pm_settings') || '{}'), pwd = prompt('Enter key encryption password:')
    if (!pwd) return
    const cmd = s.decryptscript ? `bash "${s.decryptscript}" "${pwd}" 2>/dev/null` : `source ${s.cnodehome}/scripts/env && source ${s.cnodehome}/scripts/cntools.library && decryptFile ${s.cnodehome}/priv "${pwd}" 2>/dev/null`
    run(cmd, 'security-terminal')
  })
  document.getElementById('btn-prompt-encrypt').addEventListener('click', () => {
    const s = JSON.parse(localStorage.getItem('pm_settings') || '{}'), pwd = prompt('Enter password to re-encrypt keys:')
    if (!pwd || !confirm('Encrypt keys and securely wipe unencrypted files?')) return
    const cmd = s.encryptscript ? `bash "${s.encryptscript}" "${pwd}" 2>/dev/null` : `source ${s.cnodehome}/scripts/env && source ${s.cnodehome}/scripts/cntools.library && encryptFile ${s.cnodehome}/priv "${pwd}" 2>/dev/null`
    run(cmd, 'security-terminal')
  })

  document.getElementById('btn-detect-settings').addEventListener('click', detectSettings)
  document.getElementById('btn-save-settings').addEventListener('click',   saveSettings)
  document.getElementById('btn-reset-settings').addEventListener('click',  resetSettings)
  document.getElementById('btn-rerun-wizard').addEventListener('click',    rerunWizard)

  document.getElementById('btn-run-cmd').addEventListener('click', () => { const cmd = document.getElementById('term-cmd').value.trim(); if (cmd) run(cmd, 'custom-terminal') })
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && document.activeElement.id === 'term-cmd') { const cmd = document.getElementById('term-cmd').value.trim(); if (cmd) run(cmd, 'custom-terminal') } })
}

// ── INIT ──
initEventListeners()
loadProfileDropdown()
checkFirstRun()
