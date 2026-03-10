import './style.css'
import { invoke } from '@tauri-apps/api/tauri'

// ── STATE ──
let connected = false

// ── SETTINGS HELPER ──
function cfg() {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const home = s.cnodehome || '/opt/cardano/cnode'
  const pool = s.poolname || 'POOL'
  const net  = s.network  || 'mainnet'
  return {
    home,
    pool,
    net,
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

// ── RENDER ──
document.querySelector('#app').innerHTML = `

<!-- SETUP WIZARD -->
<div id="wizard-screen" style="display:none">
  <div class="connect-box" style="max-width:560px">

    <!-- Step 1: Welcome -->
    <div class="wizard-step" id="wz-1">
      <div class="connect-logo">
        <h1>Pool<span style="color:var(--accent)">Manager</span></h1>
        <p style="color:var(--text-muted);font-size:13px;line-height:1.6;margin-top:12px">
          A graphical desktop application that combines the functionality of
          <strong>cntools</strong> and <strong>gLiveView</strong> from the
          <a href="https://cardano-community.github.io/guild-operators/" style="color:var(--accent)">Guild Operators</a>
          suite into a single rich interface.<br><br>
          Full credit and thanks to the Guild Operators / Koios team for
          <strong>cntools</strong> and <strong>gLiveView</strong> — this application
          builds on top of their work and requires their tools to be installed on your node.
          PoolManager is open source under Apache 2.0.
        </p>
      </div>
      <div style="background:rgba(0,83,255,0.08);border:1px solid var(--accent);border-radius:8px;padding:14px;margin:16px 0;font-size:13px;color:var(--text)">
        This wizard will guide you through setup in about 2 minutes.<br>
        You can re-run it any time from the Settings panel.
      </div>
      <button class="btn btn-primary" id="btn-wz-start">Get Started &rarr;</button>
    </div>

    <!-- Step 2: SSH Connection -->
    <div class="wizard-step" id="wz-2" style="display:none">
      <div class="panel-title" style="margin-bottom:4px">Step 1 of 3 &mdash; Connect to your node</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Enter your node's SSH connection details.</p>
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

    <!-- Step 3: Node Configuration -->
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

    <!-- Step 4: Key Scripts -->
    <div class="wizard-step" id="wz-4" style="display:none">
      <div class="panel-title" style="margin-bottom:4px">Step 3 of 3 &mdash; Key scripts (optional)</div>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:4px">
        If you have custom encrypt/decrypt scripts, enter their paths here.<br>
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

    <!-- Step 5: Done -->
    <div class="wizard-step" id="wz-5" style="display:none">
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:48px;margin-bottom:12px">&#10003;</div>
        <div class="panel-title" style="margin-bottom:8px">You're all set!</div>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">
          PoolManager is configured and ready to use.<br>
          You can update any settings at any time from the Settings panel.
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
      <select id="c-profile">
        <option value="">-- Select saved profile --</option>
      </select>
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
      <div class="key-status locked" id="key-status" title="Click to manage keys">
        Keys Locked
      </div>
      <button class="btn-disconnect" id="btn-disconnect">Disconnect</button>
    </div>
  </div>

  <div class="body-layout">
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-label">Overview</div>
        <div class="nav-item active" data-panel="dashboard">
          <span class="nav-icon">&#9632;</span> Dashboard
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Pool</div>
        <div class="nav-item" data-panel="pool">
          <span class="nav-icon">&#127946;</span> Pool Info
        </div>
        <div class="nav-item" data-panel="kes">
          <span class="nav-icon">&#128273;</span> KES Keys
        </div>
        <div class="nav-item" data-panel="blocks">
          <span class="nav-icon">&#128230;</span> Blocks
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Wallet</div>
        <div class="nav-item" data-panel="wallet">
          <span class="nav-icon">&#128091;</span> Wallets
        </div>
        <div class="nav-item" data-panel="send">
          <span class="nav-icon">&#10148;</span> Send ADA
        </div>
        <div class="nav-item" data-panel="rewards">
          <span class="nav-icon">&#127873;</span> Rewards
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Governance</div>
        <div class="nav-item" data-panel="governance">
          <span class="nav-icon">&#128505;</span> DRep / Voting
        </div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Advanced</div>
        <div class="nav-item" data-panel="assets">
          <span class="nav-icon">&#129689;</span> Assets
        </div>
        <div class="nav-item" data-panel="security">
          <span class="nav-icon">&#128272;</span> Security
        </div>
        <div class="nav-item" data-panel="terminal">
          <span class="nav-icon">&#9000;</span> Terminal
        </div>
        <div class="nav-item" data-panel="settings">
          <span class="nav-icon">&#9881;</span> Settings
        </div>
      </div>
    </div>

    <div class="content">

      <!-- DASHBOARD -->
      <div class="panel active" id="panel-dashboard">
        <div class="panel-title">Dashboard</div>
        <div class="card-grid">
          <div class="card">
            <div class="card-label">Pool Status</div>
            <div class="card-value success" id="stat-pool">--</div>
            <div class="card-sub" id="stat-pool-sub">Block Producer</div>
          </div>
          <div class="card">
            <div class="card-label">Node Sync</div>
            <div class="card-value" id="stat-sync">--</div>
            <div class="card-sub" id="stat-sync-sub">Loading...</div>
          </div>
          <div class="card">
            <div class="card-label">KES Expiry</div>
            <div class="card-value" id="stat-kes">--</div>
            <div class="card-sub" id="stat-kes-sub">Click KES panel to check</div>
          </div>
          <div class="card">
            <div class="card-label">Epoch</div>
            <div class="card-value" id="stat-epoch">--</div>
            <div class="card-sub" id="stat-epoch-sub">Loading...</div>
          </div>
        </div>
        <div class="terminal-label">Node Output</div>
        <div class="terminal" id="dashboard-terminal">Connecting to node...</div>
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
        <div class="action-row">
          <button class="btn-action" id="btn-list-wallets">List Wallets</button>
        </div>
        <div class="terminal" id="wallet-terminal">Click List Wallets to load...</div>
      </div>

      <!-- SEND -->
      <div class="panel" id="panel-send">
        <div class="panel-title">Send ADA</div>
        <div style="max-width:480px">
          <div class="form-group">
            <label>From Wallet</label>
            <input id="send-from" type="text" placeholder="wallet name" />
          </div>
          <div class="form-group">
            <label>To Address</label>
            <input id="send-to" type="text" placeholder="addr1..." />
          </div>
          <div class="form-group">
            <label>Amount (ADA)</label>
            <input id="send-amount" type="number" placeholder="0.00" min="1" step="0.1" />
          </div>
          <button class="btn btn-primary" style="width:auto;padding:10px 24px" id="btn-confirm-send">
            Review and Send
          </button>
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
        <div class="action-row">
          <button class="btn-action" id="btn-list-assets">List Assets</button>
        </div>
        <div class="terminal" id="assets-terminal">Click List Assets to load...</div>
      </div>

      <!-- SECURITY -->
      <div class="panel" id="panel-security">
        <div class="panel-title">Key Security</div>
        <div class="action-row">
          <button class="btn-action success" id="btn-prompt-decrypt">Decrypt Keys</button>
          <button class="btn-action danger" id="btn-prompt-encrypt">Encrypt and Wipe</button>
        </div>
        <div style="background:rgba(255,184,0,0.08);border:1px solid var(--warning);border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;color:var(--warning)">
          Decrypt keys only when needed for pool operations. Re-encrypt immediately after.
          The encrypt function also performs a secure wipe of unencrypted key files.
        </div>
        <div class="terminal" id="security-terminal">Key status will appear here...</div>
      </div>

      <!-- SETTINGS -->
      <div class="panel" id="panel-settings">
        <div class="panel-title">Settings</div>
        <div style="max-width:600px">
          <div style="background:rgba(0,83,255,0.08);border:1px solid var(--accent);border-radius:8px;padding:16px;margin-bottom:24px;font-size:13px;color:var(--text)">
            Enter your env file path (or just the scripts directory) and pool name. Everything else is detected automatically. Key scripts are optional &mdash; leave blank to use cntools.library built-in functions.
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Node Configuration</div>
            <div class="form-group">
              <label>Path to env file</label>
              <input id="s-envpath" type="text" placeholder="/path/to/cnode/scripts/env" />
            </div>
            <div class="form-group">
              <label>Pool Name (folder name under priv/pool/)</label>
              <input id="s-poolname" type="text" placeholder="Your pool folder name e.g. MYPOOL" />
            </div>
            <div class="form-group">
              <label>Network</label>
              <select id="s-network">
                <option value="mainnet">Mainnet</option>
                <option value="preprod">Preprod</option>
                <option value="preview">Preview</option>
              </select>
            </div>
            <button class="btn-action success" id="btn-detect-settings" style="margin-top:8px">
              Auto-Detect from env file
            </button>
          </div>
          <div class="card" id="detected-settings" style="margin-bottom:16px;display:none">
            <div class="card-label" style="margin-bottom:16px">Detected Configuration</div>
            <div class="terminal" id="settings-terminal" style="min-height:120px">
              Click Auto-Detect to load configuration from your node...
            </div>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Detected Values</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted);width:40%">CNODE_HOME</td>
                <td style="padding:8px 4px" id="d-cnodehome">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool Name</td>
                <td style="padding:8px 4px" id="d-poolname">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool ID</td>
                <td style="padding:8px 4px;font-family:monospace;font-size:11px" id="d-poolid">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool Ticker</td>
                <td style="padding:8px 4px" id="d-ticker">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Node Port</td>
                <td style="padding:8px 4px" id="d-nodeport">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Prometheus Port</td>
                <td style="padding:8px 4px" id="d-promport">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">cntools.library</td>
                <td style="padding:8px 4px" id="d-library">&mdash;</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">op.cert path</td>
                <td style="padding:8px 4px" id="d-opcert">&mdash;</td>
              </tr>
              <tr>
                <td style="padding:8px 4px;color:var(--text-muted)">Node Version</td>
                <td style="padding:8px 4px" id="d-nodeversion">&mdash;</td>
              </tr>
            </table>
          </div>
          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Key Scripts</div>
            <div class="form-group">
              <label>Decrypt keys script path</label>
              <input id="s-decryptscript" type="text" placeholder="Optional: /path/to/your/decrypt-keys.sh" />
            </div>
            <div class="form-group">
              <label>Encrypt keys script path</label>
              <input id="s-encryptscript" type="text" placeholder="Optional: /path/to/your/encrypt-keys.sh" />
            </div>
          </div>
          <button class="btn btn-primary" style="width:auto;padding:10px 32px" id="btn-save-settings">
            Save Settings
          </button>
          <button class="btn-action danger" style="margin-left:12px" id="btn-reset-settings">
            Reset Settings
          </button>
          <button class="btn-action" style="margin-left:12px" id="btn-rerun-wizard">
            Re-run Setup Wizard
          </button>
          <span id="settings-saved" style="color:var(--success);margin-left:12px;font-size:13px;display:none">
            &#10003; Settings saved
          </span>
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

// ── HELPER: run command and display in terminal ──
async function run(command, terminalId) {
  const term = document.getElementById(terminalId)
  term.textContent = 'Running...'
  try {
    const result = await invoke('ssh_run', { command })
    term.textContent = result.output || result.error || '(no output)'
  } catch(e) {
    term.textContent = 'Error: ' + String(e)
  }
}

// ── NAVIGATION ──
function showPanel(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-panel="${name}"]`)?.classList.add('active')
  document.getElementById(`panel-${name}`)?.classList.add('active')
}

// ── WIZARD ──
let wizardSettings = null

function wzGo(step) {
  document.querySelectorAll('.wizard-step').forEach(s => s.style.display = 'none')
  document.getElementById('wz-' + step).style.display = 'block'
}

async function wzConnect() {
  const btn = document.getElementById('wz-conn-btn')
  const err = document.getElementById('wz-conn-error')
  err.style.display = 'none'

  const host     = document.getElementById('wz-host').value.trim()
  const port     = parseInt(document.getElementById('wz-port').value) || 22
  const username = document.getElementById('wz-user').value.trim()
  const order    = document.getElementById('wz-order').value
  const totp     = document.getElementById('wz-totp').value.trim()
  const password = document.getElementById('wz-pass').value

  if (!host || !username || !password) {
    err.textContent = 'Please fill in host, username and password'
    err.style.display = 'block'
    return
  }

  btn.disabled = true
  btn.textContent = 'Connecting...'

  try {
    const result = await invoke('ssh_connect', {
      profile: { host, port, username, auth_order: order, totp_code: totp, password }
    })
    if (result.success) {
      saveProfile(host, port, username, order)
      document.getElementById('conn-label').textContent = username + '@' + host
      wzGo(3)
    } else {
      err.textContent = result.error || 'Connection failed — check your details and try again'
      err.style.display = 'block'
    }
  } catch(e) {
    err.textContent = 'Connection failed: ' + String(e)
    err.style.display = 'block'
  }

  btn.disabled = false
  btn.textContent = 'Test Connection →'
}

async function wzDetect() {
  const envpath  = document.getElementById('wz-envpath').value.trim()
  const poolname = document.getElementById('wz-poolname').value.trim()
  const term     = document.getElementById('wz-detect-terminal')

  if (!envpath) {
    term.textContent = '⚠️ Please enter your env file path first'
    return
  }

  term.textContent = 'Reading env file...'

  try {
    const normalEnvpath = envpath.endsWith('/env') ? envpath : envpath.replace(/\/?$/, '/env')
    const cnodehome = normalEnvpath.replace('/scripts/env', '')
    document.getElementById('wz-envpath').value = normalEnvpath

    const envResult = await invoke('ssh_run', {
      command: 'cat ' + normalEnvpath + ' | grep -v "^#" | grep -v "^$" | grep "^[A-Z_]*="'
    })

    const envText = envResult.output || ''
    wizardSettings = { envpath: normalEnvpath, cnodehome, poolname }

    const poolid       = envText.match(/^POOL_ID="?([^"\n]+)"?/m)
    const ticker       = envText.match(/^POOL_TICKER="?([^"\n]+)"?/m)
    const nodeport     = envText.match(/^CNODE_PORT=([^\s\n]+)/m)
    const detectedPool = envText.match(/^POOL_NAME="?([^"\n]+)"?/m)
    const network      = document.getElementById('wz-network').value

    if (poolid)   wizardSettings.poolid   = poolid[1].trim()
    if (ticker)   wizardSettings.ticker   = ticker[1].trim()
    if (nodeport) wizardSettings.nodeport = nodeport[1].trim()
    wizardSettings.poolname = poolname || (detectedPool ? detectedPool[1].trim() : '')
    wizardSettings.network  = network
    wizardSettings.netflag  = network === 'mainnet' ? '--mainnet' : '--testnet-magic 1'

    if (detectedPool && !poolname)
      document.getElementById('wz-poolname').value = wizardSettings.poolname

    const configResult = await invoke('ssh_run', {
      command: 'grep -o "PrometheusSimple [^ ]* [0-9]*" ' + cnodehome + '/files/config.json 2>/dev/null'
    })
    const promMatch = configResult.output.match(/PrometheusSimple\s+\S+\s+(\d+)/)
    wizardSettings.promport = promMatch ? promMatch[1] : '12799'

    const metricsResult = await invoke('ssh_run', {
      command: 'curl -s http://127.0.0.1:' + wizardSettings.promport + '/metrics 2>/dev/null | grep cardano_node_metrics_cardano_build_info'
    })
    const versionMatch = metricsResult.output.match(/version="([^"]+)"/)
    wizardSettings.nodeversion = versionMatch ? versionMatch[1] : 'Unknown'

    term.textContent =
      '✓ Detected successfully\n\n' +
      'CNODE_HOME:   ' + cnodehome + '\n' +
      'Pool Name:    ' + wizardSettings.poolname + '\n' +
      'Pool ID:      ' + (wizardSettings.poolid || 'not found') + '\n' +
      'Ticker:       ' + (wizardSettings.ticker || 'not found') + '\n' +
      'Node Port:    ' + (wizardSettings.nodeport || 'not found') + '\n' +
      'Prometheus:   ' + wizardSettings.promport + '\n' +
      'Node Version: ' + wizardSettings.nodeversion

  } catch(e) {
    term.textContent = '✗ Detection failed: ' + String(e)
  }
}

function wzSaveNode() {
  const err = document.getElementById('wz-node-error')
  if (!wizardSettings || !wizardSettings.cnodehome) {
    err.textContent = '⚠️ Please run Auto-Detect first to verify your node configuration'
    err.style.display = 'block'
    return
  }
  err.style.display = 'none'
  wzGo(4)
}

function wzFinish() {
  if (!wizardSettings) return
  wizardSettings.decryptscript = document.getElementById('wz-decrypt').value.trim()
  wizardSettings.encryptscript = document.getElementById('wz-encrypt').value.trim()
  localStorage.setItem('pm_settings', JSON.stringify(wizardSettings))
  applySettings()
  wzGo(5)
}

function wzLaunch() {
  document.getElementById('wizard-screen').style.display = 'none'
  document.getElementById('connect-screen').style.display = 'none'
  connected = true
  document.getElementById('main-app').classList.add('show')
  loadDashboard()
  startAutoRefresh()
}

function rerunWizard() {
  document.getElementById('connect-screen').style.display = 'none'
  document.getElementById('main-app').classList.remove('show')
  stopAutoRefresh()
  wizardSettings = null
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

// ── DASHBOARD ──
async function loadDashboard() {
  const term = document.getElementById('dashboard-terminal')
  const c = cfg()
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  if (!s.cnodehome) {
    term.textContent = '⚠️ Node not configured yet.\n\nPlease go to Settings → Re-run Setup Wizard, or configure your node path in the Settings panel.'
    return
  }
  term.textContent = 'Loading node info...'
  try {
    const r = await invoke('ssh_run', {
      command: `source ${c.env} && cardano-cli query tip ${c.netflag} 2>/dev/null`
    })
    if (r.success && r.output) {
      try {
        const tip = JSON.parse(r.output)
        const sync = parseFloat(tip.syncProgress) || 0
        document.getElementById('stat-sync').textContent = sync + '%'
        document.getElementById('stat-sync').className = 'card-value ' + (sync > 99 ? 'success' : 'warning')
        document.getElementById('stat-sync-sub').textContent = 'Slot ' + (tip.slot || '?')
        document.getElementById('stat-epoch').textContent = tip.epoch || '?'
        document.getElementById('stat-epoch-sub').textContent = 'Block ' + (tip.block || '?')
      } catch(e) {
        document.getElementById('stat-sync').textContent = 'Parse error'
      }
      term.textContent = r.output
    } else {
      term.textContent = r.error || 'No output from node'
    }
  } catch(e) {
    term.textContent = 'Could not load node info: ' + String(e)
  }
  // Load KES info
  try {
    const kes = await invoke('ssh_run', {
      command: `source ${c.env} && cardano-cli query kes-period-info ${c.netflag} --op-cert-file ${c.opcert} 2>/dev/null`
    })
    if (kes.success && kes.output) {
      const match = kes.output.match(/"qKesKesKeyExpiry":\s*"([^"]+)"/)
      if (match) {
        const expiry = new Date(match[1])
        const daysLeft = Math.floor((expiry - new Date()) / (1000 * 60 * 60 * 24))
        document.getElementById('stat-kes').textContent = daysLeft + ' days'
        document.getElementById('stat-kes').className = 'card-value ' + (daysLeft < 7 ? 'danger' : daysLeft < 30 ? 'warning' : 'success')
        const periodMatch  = kes.output.match(/"qKesEndKesInterval":\s*(\d+)/)
        const currentMatch = kes.output.match(/"qKesCurrentKesPeriod":\s*(\d+)/)
        const periodsLeft  = periodMatch && currentMatch ? parseInt(periodMatch[1]) - parseInt(currentMatch[1]) : null
        document.getElementById('stat-kes-sub').textContent = 'Expires ' + expiry.toLocaleDateString('en-GB') + (periodsLeft !== null ? ' (' + periodsLeft + ' periods)' : '')
      }
    }
  } catch(e) {}
}

// ── AUTO REFRESH ──
let refreshInterval = null

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(async () => {
    try {
      const c = cfg()
      const r = await invoke('ssh_run', {
        command: `source ${c.env} && cardano-cli query tip ${c.netflag} 2>/dev/null`
      })
      if (r.success && r.output) {
        const tip = JSON.parse(r.output)
        const sync = parseFloat(tip.syncProgress) || 0
        document.getElementById('stat-sync').textContent = sync + '%'
        document.getElementById('stat-sync').className = 'card-value ' + (sync > 99 ? 'success' : 'warning')
        document.getElementById('stat-sync-sub').textContent = 'Slot ' + (tip.slot || '?')
        document.getElementById('stat-epoch').textContent = tip.epoch || '?'
        document.getElementById('stat-epoch-sub').textContent = 'Block ' + (tip.block || '?')
        document.getElementById('dashboard-terminal').textContent = r.output
      }
    } catch(e) {}
  }, 30000)
}

function stopAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = null
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
  if (s.cnodehome)               document.getElementById('d-cnodehome').textContent = s.cnodehome
  if (s.poolname)                document.getElementById('d-poolname').textContent = s.poolname
  if (s.poolid)                  document.getElementById('d-poolid').textContent = s.poolid
  if (s.ticker)                  document.getElementById('d-ticker').textContent = s.ticker
  if (s.nodeport)                document.getElementById('d-nodeport').textContent = s.nodeport
  if (s.promport)                document.getElementById('d-promport').textContent = s.promport
  if (s.cnodehome)               document.getElementById('d-library').textContent = s.cnodehome + '/scripts/cntools.library'
  if (s.cnodehome && s.poolname) document.getElementById('d-opcert').textContent = s.cnodehome + '/priv/pool/' + s.poolname + '/op.cert'
  if (s.nodeversion)             document.getElementById('d-nodeversion').textContent = s.nodeversion
}

function applySettings() {
  loadSettings()
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  if (s.poolname) document.getElementById('stat-pool').textContent = s.poolname
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
    const cnodehome = normalEnvpath.replace('/scripts/env', '')
    document.getElementById('s-envpath').value = normalEnvpath

    const envResult = await invoke('ssh_run', {
      command: 'cat ' + normalEnvpath + ' | grep -v "^#" | grep -v "^$" | grep "^[A-Z_]*="'
    })

    const envText = envResult.output || ''
    const s = { envpath: normalEnvpath, poolname, cnodehome }

    const poolid       = envText.match(/^POOL_ID="?([^"\n]+)"?/m)
    const ticker       = envText.match(/^POOL_TICKER="?([^"\n]+)"?/m)
    const nodeport     = envText.match(/^CNODE_PORT=([^\s\n]+)/m)
    const detectedPool = envText.match(/^POOL_NAME="?([^"\n]+)"?/m)

    if (poolid)   s.poolid   = poolid[1].trim()
    if (ticker)   s.ticker   = ticker[1].trim()
    if (nodeport) s.nodeport = nodeport[1].trim()
    s.poolname = poolname || (detectedPool ? detectedPool[1].trim() : '')

    const configResult = await invoke('ssh_run', {
      command: 'grep -o "PrometheusSimple [^ ]* [0-9]*" ' + cnodehome + '/files/config.json 2>/dev/null'
    })
    const promMatch = configResult.output.match(/PrometheusSimple\s+\S+\s+(\d+)/)
    s.promport = promMatch ? promMatch[1] : '12799'

    const metricsResult = await invoke('ssh_run', {
      command: 'curl -s http://127.0.0.1:' + s.promport + '/metrics 2>/dev/null | grep cardano_node_metrics_cardano_build_info'
    })
    const versionMatch = metricsResult.output.match(/version="([^"]+)"/)
    s.nodeversion = versionMatch ? versionMatch[1] : 'Unknown'

    s.decryptscript = s.decryptscript || ''
    s.encryptscript = s.encryptscript || ''

    updateDetectedTable(s)
    term.textContent = 'Detection complete:\n\n' + JSON.stringify(s, null, 2)
    localStorage.setItem('pm_settings', JSON.stringify(s))

  } catch(e) {
    term.textContent = 'Detection failed: ' + String(e)
  }
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
  saved.style.display = 'inline'
  setTimeout(() => saved.style.display = 'none', 3000)
  updateDetectedTable(s)
}

function resetSettings() {
  if (confirm('Clear all saved settings? This will re-run the setup wizard.')) {
    localStorage.removeItem('pm_settings')
    rerunWizard()
  }
}

// ── SAVED PROFILES ──
function saveProfile(host, port, username, order) {
  const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]')
  const existing = profiles.findIndex(p => p.host === host && p.username === username)
  const profile = { host, port, username, order, label: username + '@' + host }
  if (existing >= 0) {
    profiles[existing] = profile
  } else {
    profiles.push(profile)
  }
  localStorage.setItem('pm_profiles', JSON.stringify(profiles))
  loadProfileDropdown()
}

function loadProfileDropdown() {
  const select = document.getElementById('c-profile')
  const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]')
  select.innerHTML = '<option value="">-- Select saved profile --</option>'
  profiles.forEach((p, i) => {
    const opt = document.createElement('option')
    opt.value = i
    opt.textContent = p.label
    select.appendChild(opt)
  })
}

// ── WIRE ALL EVENT LISTENERS ──
function initEventListeners() {

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => showPanel(item.dataset.panel))
  })

  // Key status
  document.getElementById('key-status')?.addEventListener('click', () => showPanel('security'))

  // Auth order toggle (connect screen)
  document.getElementById('c-order').addEventListener('change', function() {
    document.getElementById('totp-group').style.display =
      this.value === 'password_only' ? 'none' : 'block'
  })

  // Auth order toggle (wizard)
  document.getElementById('wz-order').addEventListener('change', function() {
    document.getElementById('wz-totp-group').style.display =
      this.value === 'password_only' ? 'none' : 'block'
  })

  // Saved profiles dropdown
  document.getElementById('c-profile').addEventListener('change', function() {
    const profiles = JSON.parse(localStorage.getItem('pm_profiles') || '[]')
    const p = profiles[this.value]
    if (p) {
      document.getElementById('c-host').value = p.host
      document.getElementById('c-port').value = p.port
      document.getElementById('c-user').value = p.username
      document.getElementById('c-order').value = p.order
      document.getElementById('totp-group').style.display = p.order === 'password_only' ? 'none' : 'block'
    }
  })

  // Connect button
  document.getElementById('btn-connect').addEventListener('click', async () => {
    const btn   = document.getElementById('btn-connect')
    const errEl = document.getElementById('connect-error')
    errEl.classList.remove('show')

    const host     = document.getElementById('c-host').value.trim()
    const port     = parseInt(document.getElementById('c-port').value) || 22
    const username = document.getElementById('c-user').value.trim()
    const order    = document.getElementById('c-order').value
    const totp     = document.getElementById('c-totp').value.trim()
    const password = document.getElementById('c-pass').value

    if (!host || !username || !password) {
      errEl.textContent = 'Please fill in host, username and password'
      errEl.classList.add('show')
      return
    }

    btn.disabled = true
    btn.textContent = 'Connecting...'

    try {
      const result = await invoke('ssh_connect', {
        profile: { host, port, username, auth_order: order, totp_code: totp, password }
      })
      if (result.success) {
        connected = true
        document.getElementById('connect-screen').style.display = 'none'
        document.getElementById('main-app').classList.add('show')
        document.getElementById('conn-label').textContent = username + '@' + host
        saveProfile(host, port, username, order)
        applySettings()
        loadDashboard()
        startAutoRefresh()
      } else {
        errEl.textContent = result.error || 'Connection failed'
        errEl.classList.add('show')
      }
    } catch(e) {
      errEl.textContent = String(e)
      errEl.classList.add('show')
    }

    btn.disabled = false
    btn.textContent = 'Connect to Node'
  })

  // Disconnect
  document.getElementById('btn-disconnect').addEventListener('click', async () => {
    await invoke('ssh_disconnect')
    connected = false
    document.getElementById('main-app').classList.remove('show')
    stopAutoRefresh()
    document.getElementById('connect-screen').style.display = 'flex'
  })

  // Wizard buttons
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

  // Pool panel
  document.getElementById('btn-run-pool-info').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && cardano-cli query tip ${c.netflag} 2>/dev/null`, 'pool-terminal')
  })
  document.getElementById('btn-confirm-retire').addEventListener('click', () => {
    if (confirm('WARNING: This will begin pool retirement. Are you absolutely sure?')) {
      const c = cfg()
      run(`source ${c.env} && source ${c.lib} && deRegisterPool`, 'pool-terminal')
    }
  })

  // KES panel
  document.getElementById('btn-check-kes').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && cardano-cli query kes-period-info ${c.netflag} --op-cert-file ${c.opcert} 2>/dev/null`, 'kes-terminal')
  })
  document.getElementById('btn-rotate-kes').addEventListener('click', () => {
    if (confirm('Rotate KES keys? This will update your operational certificate.')) {
      const c = cfg()
      run(`source ${c.env} && source ${c.lib} && rotatePoolKeys`, 'kes-terminal')
    }
  })

  // Blocks panel
  document.getElementById('btn-run-blocks').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && echo "Block stats via cncli or gLiveView" && ls ${c.home}/scripts/`, 'blocks-terminal')
  })

  // Wallet panel
  document.getElementById('btn-list-wallets').addEventListener('click', () => {
    const c = cfg()
    run(`ls ${c.wallets} 2>/dev/null || echo "No wallets found"`, 'wallet-terminal')
  })

  // Send panel
  document.getElementById('btn-confirm-send').addEventListener('click', () => {
    const from   = document.getElementById('send-from').value.trim()
    const to     = document.getElementById('send-to').value.trim()
    const amount = document.getElementById('send-amount').value
    if (!from || !to || !amount) { alert('Please fill in all fields'); return }
    if (confirm('Send ' + amount + ' ADA from ' + from + ' to ' + to + '?')) {
      const c = cfg()
      run(`source ${c.env} && source ${c.lib} && sendAssets`, 'send-terminal')
    }
  })

  // Rewards panel
  document.getElementById('btn-check-rewards').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && source ${c.lib} && getWalletRewards 2>/dev/null || echo "Specify wallet name"`, 'rewards-terminal')
  })
  document.getElementById('btn-confirm-withdraw').addEventListener('click', () => {
    if (confirm('Withdraw all available rewards?')) {
      const c = cfg()
      run(`source ${c.env} && source ${c.lib} && withdrawRewards`, 'rewards-terminal')
    }
  })

  // Governance panel
  document.getElementById('btn-check-drep').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && source ${c.lib} && getDRepStatus 2>/dev/null`, 'governance-terminal')
  })
  document.getElementById('btn-list-gov-actions').addEventListener('click', () => {
    const c = cfg()
    run(`source ${c.env} && source ${c.lib} && getActiveGovActionCount 2>/dev/null`, 'governance-terminal')
  })

  // Assets panel
  document.getElementById('btn-list-assets').addEventListener('click', () => {
    const c = cfg()
    run(`ls ${c.assets} 2>/dev/null || echo "No assets found"`, 'assets-terminal')
  })

  // Security panel
  document.getElementById('btn-prompt-decrypt').addEventListener('click', () => {
    const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
    const cnodehome    = s.cnodehome || ''
    const customScript = s.decryptscript || ''
    const pwd = prompt('Enter key encryption password:')
    if (!pwd) return
    const cmd = customScript
      ? `bash "${customScript}" "${pwd}" 2>/dev/null || echo "Custom decrypt script not found at ${customScript}"`
      : `source ${cnodehome}/scripts/env && source ${cnodehome}/scripts/cntools.library && decryptFile ${cnodehome}/priv "${pwd}" 2>/dev/null`
    run(cmd, 'security-terminal')
  })
  document.getElementById('btn-prompt-encrypt').addEventListener('click', () => {
    const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
    const cnodehome    = s.cnodehome || ''
    const customScript = s.encryptscript || ''
    const pwd = prompt('Enter password to re-encrypt keys:')
    if (!pwd) return
    if (!confirm('Encrypt keys and securely wipe unencrypted files?')) return
    const cmd = customScript
      ? `bash "${customScript}" "${pwd}" 2>/dev/null || echo "Custom encrypt script not found at ${customScript}"`
      : `source ${cnodehome}/scripts/env && source ${cnodehome}/scripts/cntools.library && encryptFile ${cnodehome}/priv "${pwd}" 2>/dev/null`
    run(cmd, 'security-terminal')
  })

  // Settings panel
  document.getElementById('btn-detect-settings').addEventListener('click', detectSettings)
  document.getElementById('btn-save-settings').addEventListener('click',   saveSettings)
  document.getElementById('btn-reset-settings').addEventListener('click',  resetSettings)
  document.getElementById('btn-rerun-wizard').addEventListener('click',    rerunWizard)

  // Terminal panel
  document.getElementById('btn-run-cmd').addEventListener('click', () => {
    const cmd = document.getElementById('term-cmd').value.trim()
    if (cmd) run(cmd, 'custom-terminal')
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.id === 'term-cmd') {
      const cmd = document.getElementById('term-cmd').value.trim()
      if (cmd) run(cmd, 'custom-terminal')
    }
  })
}

// ── INIT ──
initEventListeners()
loadProfileDropdown()
checkFirstRun()
