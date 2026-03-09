import './style.css'
import { invoke } from '@tauri-apps/api/tauri'

// ── STATE ──
let connected = false

// ── RENDER ──
document.querySelector('#app').innerHTML = `

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
            <div class="card-value success" id="stat-pool">GNP1</div>
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
          <button class="btn-action" onclick="runPoolInfo()">Refresh Pool Info</button>
          <button class="btn-action danger" onclick="confirmRetire()">Retire Pool</button>
        </div>
        <div class="terminal" id="pool-terminal">Click Refresh Pool Info to load...</div>
      </div>

      <!-- KES -->
      <div class="panel" id="panel-kes">
        <div class="panel-title">KES Key Management</div>
        <div class="action-row">
          <button class="btn-action" onclick="checkKES()">Check KES Expiry</button>
          <button class="btn-action success" onclick="confirmRotateKES()">Rotate KES Keys</button>
        </div>
        <div class="terminal" id="kes-terminal">Click Check KES Expiry to load...</div>
      </div>

      <!-- BLOCKS -->
      <div class="panel" id="panel-blocks">
        <div class="panel-title">Block Production</div>
        <div class="action-row">
          <button class="btn-action" onclick="runBlocks()">Refresh Block Stats</button>
        </div>
        <div class="terminal" id="blocks-terminal">Click Refresh to load block stats...</div>
      </div>

      <!-- WALLET -->
      <div class="panel" id="panel-wallet">
        <div class="panel-title">Wallets</div>
        <div class="action-row">
          <button class="btn-action" onclick="listWallets()">List Wallets</button>
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
          <button class="btn btn-primary" style="width:auto;padding:10px 24px" onclick="confirmSend()">
            Review and Send
          </button>
        </div>
        <div class="terminal" id="send-terminal" style="margin-top:20px"></div>
      </div>

      <!-- REWARDS -->
      <div class="panel" id="panel-rewards">
        <div class="panel-title">Rewards</div>
        <div class="action-row">
          <button class="btn-action" onclick="checkRewards()">Check Rewards</button>
          <button class="btn-action" onclick="confirmWithdraw()">Withdraw Rewards</button>
        </div>
        <div class="terminal" id="rewards-terminal">Click Check Rewards to load...</div>
      </div>

      <!-- GOVERNANCE -->
      <div class="panel" id="panel-governance">
        <div class="panel-title">DRep / Governance</div>
        <div class="action-row">
          <button class="btn-action" onclick="checkDRep()">DRep Status</button>
          <button class="btn-action" onclick="listGovActions()">Active Gov Actions</button>
        </div>
        <div class="terminal" id="governance-terminal">Select an action to load...</div>
      </div>

      <!-- ASSETS -->
      <div class="panel" id="panel-assets">
        <div class="panel-title">Native Assets</div>
        <div class="action-row">
          <button class="btn-action" onclick="listAssets()">List Assets</button>
        </div>
        <div class="terminal" id="assets-terminal">Click List Assets to load...</div>
      </div>

      <!-- SECURITY -->
      <div class="panel" id="panel-security">
        <div class="panel-title">Key Security</div>
        <div class="action-row">
          <button class="btn-action success" onclick="promptDecrypt()">Decrypt Keys</button>
          <button class="btn-action danger" onclick="promptEncrypt()">Encrypt and Wipe</button>
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
            Enter your env file path (or just the scripts directory) and pool name. Everything else is detected automatically. Key scripts are optional — leave blank to use cntools.library built-in functions.
          </div>

          <div class="card" style="margin-bottom:16px">
            <div class="card-label" style="margin-bottom:16px">Node Configuration</div>

            <div class="form-group">
              <label>Path to env file</label>
              <input id="s-envpath" type="text" placeholder="/path/to/cnode/scripts/env" />
            </div>

            <div class="form-group">
              <label>Pool Name (folder name under priv/pool/)</label>
              <input id="s-poolname" type="text" placeholder="GNP1" />
            </div>

            <div class="form-group">
              <label>Network</label>
              <select id="s-network">
                <option value="mainnet">Mainnet</option>
                <option value="preprod">Preprod</option>
                <option value="preview">Preview</option>
              </select>
            </div>

            <button class="btn-action success" onclick="detectSettings()" style="margin-top:8px">
              Auto-Detect from env file
            </button>
          </div>

          <div class="card" style="margin-bottom:16px" id="detected-settings" style="display:none">
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
                <td style="padding:8px 4px" id="d-cnodehome">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool Name</td>
                <td style="padding:8px 4px" id="d-poolname">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool ID</td>
                <td style="padding:8px 4px;font-family:monospace;font-size:11px" id="d-poolid">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Pool Ticker</td>
                <td style="padding:8px 4px" id="d-ticker">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Node Port</td>
                <td style="padding:8px 4px" id="d-nodeport">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">Prometheus Port</td>
                <td style="padding:8px 4px" id="d-promport">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">cntools.library</td>
                <td style="padding:8px 4px" id="d-library">—</td>
              </tr>
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:8px 4px;color:var(--text-muted)">op.cert path</td>
                <td style="padding:8px 4px" id="d-opcert">—</td>
              </tr>
              <tr>
                <td style="padding:8px 4px;color:var(--text-muted)">Node Version</td>
                <td style="padding:8px 4px" id="d-nodeversion">—</td>
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

         <button class="btn btn-primary" style="width:auto;padding:10px 32px" onclick="saveSettings()">
            Save Settings
          </button>
          <button class="btn-action danger" style="margin-left:12px" onclick="resetSettings()">
            Reset Settings
          </button>
          <span id="settings-saved" style="color:var(--success);margin-left:12px;font-size:13px;display:none">
            ✓ Settings saved
          </span>

        </div>
      </div>
      <!-- TERMINAL -->
      <div class="panel" id="panel-terminal">
        <div class="panel-title">Terminal</div>
        <div class="form-row" style="margin-bottom:12px;gap:8px">
          <input id="term-cmd" type="text" placeholder="Enter command..." style="flex:1" />
          <button class="btn-action" style="white-space:nowrap" onclick="runCustomCommand()">Run</button>
        </div>
        <div class="terminal" id="custom-terminal">Output will appear here...</div>
      </div>

    </div>
  </div>
</div>
`

// ── AUTH ORDER TOGGLE ──
document.getElementById('c-order').addEventListener('change', function() {
  document.getElementById('totp-group').style.display =
    this.value === 'password_only' ? 'none' : 'block'
})

// ── NAVIGATION ──
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => showPanel(item.dataset.panel))
})

function showPanel(name) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-panel="${name}"]`)?.classList.add('active')
  document.getElementById(`panel-${name}`)?.classList.add('active')
}

// ── CONNECT ──
document.getElementById('btn-connect').addEventListener('click', async () => {
  const btn = document.getElementById('btn-connect')
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
  } catch (e) {
    errEl.textContent = String(e)
    errEl.classList.add('show')
  }

  btn.disabled = false
  btn.textContent = 'Connect to Node'
})

// ── DISCONNECT ──
document.getElementById('btn-disconnect').addEventListener('click', async () => {
  await invoke('ssh_disconnect')
  connected = false
  document.getElementById('main-app').classList.remove('show')
  stopAutoRefresh()
  document.getElementById('connect-screen').style.display = 'flex'
})

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

// ── DASHBOARD ──
async function loadDashboard() {
  const term = document.getElementById('dashboard-terminal')
  term.textContent = 'Loading node info...'
  try {
    const r = await invoke('ssh_run', {
      command: 'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query tip --mainnet 2>/dev/null'
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
      command: 'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query kes-period-info --mainnet --op-cert-file /opt/cardano/cnode_bp/priv/pool/GNP1/op.cert 2>/dev/null'
    })
    if (kes.success && kes.output) {
      const match = kes.output.match(/"qKesKesKeyExpiry":\s*"([^"]+)"/)
      if (match) {
        const expiry = new Date(match[1])
        const daysLeft = Math.floor((expiry - new Date()) / (1000 * 60 * 60 * 24))
        document.getElementById('stat-kes').textContent = daysLeft + ' days'
        document.getElementById('stat-kes').className = 'card-value ' + (daysLeft < 7 ? 'danger' : daysLeft < 30 ? 'warning' : 'success')
        const periodMatch = kes.output.match(/"qKesEndKesInterval":\s*(\d+)/)
	const currentMatch = kes.output.match(/"qKesCurrentKesPeriod":\s*(\d+)/)
	const periodsLeft = periodMatch && currentMatch ? parseInt(periodMatch[1]) - parseInt(currentMatch[1]) : null
	document.getElementById('stat-kes-sub').textContent = 'Expires ' + expiry.toLocaleDateString('en-GB') + (periodsLeft !== null ? ' (' + periodsLeft + ' periods)' : '')
      }
    }
  } catch(e) {}    
}

// ── POOL ──
window.runPoolInfo = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query tip --mainnet 2>/dev/null',
  'pool-terminal'
)

window.confirmRetire = () => {
  if (confirm('WARNING: This will begin pool retirement. Are you absolutely sure?')) {
    run('source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && deRegisterPool', 'pool-terminal')
  }
}

// ── KES ──
window.checkKES = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query kes-period-info --mainnet --op-cert-file /opt/cardano/cnode_bp/priv/pool/GNP1/op.cert 2>/dev/null',
  'kes-terminal'
)
window.confirmRotateKES = () => {
  if (confirm('Rotate KES keys? This will update your operational certificate.')) {
    run('source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && rotatePoolKeys', 'kes-terminal')
  }
}

// ── BLOCKS ──
window.runBlocks = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && echo "Block stats via cncli or gLiveView" && ls /opt/cardano/cnode_bp/scripts/',
  'blocks-terminal'
)

// ── WALLET ──
window.listWallets = () => run(
  'ls /opt/cardano/cnode_bp/priv/wallet/ 2>/dev/null || echo "No wallets found at default path"',
  'wallet-terminal'
)

// ── SEND ──
window.confirmSend = () => {
  const from   = document.getElementById('send-from').value.trim()
  const to     = document.getElementById('send-to').value.trim()
  const amount = document.getElementById('send-amount').value
  if (!from || !to || !amount) { alert('Please fill in all fields'); return }
  if (confirm('Send ' + amount + ' ADA from ' + from + ' to ' + to + '?')) {
    run('source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && sendAssets', 'send-terminal')
  }
}

// ── REWARDS ──
window.checkRewards = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && getWalletRewards 2>/dev/null || echo "Specify wallet name"',
  'rewards-terminal'
)

window.confirmWithdraw = () => {
  if (confirm('Withdraw all available rewards?')) {
    run('source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && withdrawRewards', 'rewards-terminal')
  }
}

// ── GOVERNANCE ──
window.checkDRep = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && getDRepStatus 2>/dev/null',
  'governance-terminal'
)

window.listGovActions = () => run(
  'source /opt/cardano/cnode_bp/scripts/env && source /opt/cardano/cnode_bp/scripts/cntools.library && getActiveGovActionCount 2>/dev/null',
  'governance-terminal'
)

// ── ASSETS ──
window.listAssets = () => run(
  'ls /opt/cardano/cnode_bp/priv/asset/ 2>/dev/null || echo "No assets found"',
  'assets-terminal'
)

// ── SECURITY ──
window.promptDecrypt = () => {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const cnodehome = s.cnodehome || ''
  const customScript = s.decryptscript || ''
  const pwd = prompt('Enter key encryption password:')
  if (!pwd) return
  const cmd = customScript
    ? `bash "${customScript}" "${pwd}" 2>/dev/null || echo "Custom decrypt script not found at ${customScript}"`
    : `source ${cnodehome}/scripts/env && source ${cnodehome}/scripts/cntools.library && decryptFile ${cnodehome}/priv "${pwd}" 2>/dev/null`
  run(cmd, 'security-terminal')
}

window.promptEncrypt = () => {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  const cnodehome = s.cnodehome || ''
  const customScript = s.encryptscript || ''
  const pwd = prompt('Enter password to re-encrypt keys:')
  if (!pwd) return
  if (!confirm('Encrypt keys and securely wipe unencrypted files?')) return
  const cmd = customScript
    ? `bash "${customScript}" "${pwd}" 2>/dev/null || echo "Custom encrypt script not found at ${customScript}"`
    : `source ${cnodehome}/scripts/env && source ${cnodehome}/scripts/cntools.library && encryptFile ${cnodehome}/priv "${pwd}" 2>/dev/null`
  run(cmd, 'security-terminal')
}

// ── TERMINAL ──
window.runCustomCommand = () => {
  const cmd = document.getElementById('term-cmd').value.trim()
  if (cmd) run(cmd, 'custom-terminal')
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'term-cmd') {
    window.runCustomCommand()
  }
})
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

loadProfileDropdown()

// ── AUTO REFRESH ──
let refreshInterval = null

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval)
  refreshInterval = setInterval(async () => {
    try {
      const r = await invoke('ssh_run', {
        command: 'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query tip --mainnet 2>/dev/null'
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
  if (s.envpath) document.getElementById('s-envpath').value = s.envpath
  if (s.poolname) document.getElementById('s-poolname').value = s.poolname
  if (s.network) document.getElementById('s-network').value = s.network
  if (s.decryptscript) document.getElementById('s-decryptscript').value = s.decryptscript
  if (s.encryptscript) document.getElementById('s-encryptscript').value = s.encryptscript
  if (s.cnodehome) updateDetectedTable(s)
}

function updateDetectedTable(s) {
  if (s.cnodehome) document.getElementById('d-cnodehome').textContent = s.cnodehome
  if (s.poolname) document.getElementById('d-poolname').textContent = s.poolname
  if (s.poolid) document.getElementById('d-poolid').textContent = s.poolid
  if (s.ticker) document.getElementById('d-ticker').textContent = s.ticker
  if (s.nodeport) document.getElementById('d-nodeport').textContent = s.nodeport
  if (s.promport) document.getElementById('d-promport').textContent = s.promport
  if (s.cnodehome) document.getElementById('d-library').textContent = s.cnodehome + '/scripts/cntools.library'
  if (s.cnodehome && s.poolname) document.getElementById('d-opcert').textContent = s.cnodehome + '/priv/pool/' + s.poolname + '/op.cert'
  if (s.nodeversion) document.getElementById('d-nodeversion').textContent = s.nodeversion
}

window.detectSettings = async () => {
  const envpath = document.getElementById('s-envpath').value.trim()
  const poolname = document.getElementById('s-poolname').value.trim()
  const term = document.getElementById('settings-terminal')

  if (!envpath) { alert('Please enter the env file path first'); return }

  term.textContent = 'Reading env file...'

  try {
    // Normalise env path — accept directory or full file path
    const normalEnvpath = envpath.endsWith('/env') ? envpath : envpath.replace(/\/?$/, '/env')
    const cnodehome = normalEnvpath.replace('/scripts/env', '')
    document.getElementById('s-envpath').value = normalEnvpath

    // Read env file
    const envResult = await invoke('ssh_run', {
    command: 'cat ' + normalEnvpath + ' | grep -v "^#" | grep -v "^$" | grep "^[A-Z_]*="'
    })

    const envText = envResult.output || ''
    const s = { envpath, poolname, cnodehome }

    // Parse env variables
    const poolid = envText.match(/^POOL_ID="?([^"\n]+)"?/m)
    const ticker = envText.match(/^POOL_TICKER="?([^"\n]+)"?/m)
    const nodeport = envText.match(/^CNODE_PORT=([^\s\n]+)/m)
    const detectedPool = envText.match(/^POOL_NAME="?([^"\n]+)"?/m)

    if (poolid) s.poolid = poolid[1].trim()
    if (ticker) s.ticker = ticker[1].trim()
    if (nodeport) s.nodeport = nodeport[1].trim()
    if (detectedPool && !poolname) s.poolname = detectedPool[1].trim()
    if (detectedPool) s.poolname = poolname || detectedPool[1].trim()

    // Read Prometheus port from config.json
    const configResult = await invoke('ssh_run', {
      command: 'grep -o "PrometheusSimple [^ ]* [0-9]*" ' + cnodehome + '/files/config.json 2>/dev/null'
    })
    const promMatch = configResult.output.match(/PrometheusSimple\s+\S+\s+(\d+)/)
    s.promport = promMatch ? promMatch[1] : '12799'

    // Get node version from Prometheus
    const metricsResult = await invoke('ssh_run', {
      command: 'curl -s http://127.0.0.1:' + s.promport + '/metrics 2>/dev/null | grep cardano_node_metrics_cardano_build_info'
    })
    const versionMatch = metricsResult.output.match(/version="([^"]+)"/)
    s.nodeversion = versionMatch ? versionMatch[1] : 'Unknown'

    // Don't guess script paths - leave for user to fill in manually
    s.decryptscript = s.decryptscript || ''
    s.encryptscript = s.encryptscript || ''
    updateDetectedTable(s)

    term.textContent = 'Detection complete:\n\n' + JSON.stringify(s, null, 2)

    // Auto-save detected settings
    localStorage.setItem('pm_settings', JSON.stringify(s))

  } catch(e) {
    term.textContent = 'Detection failed: ' + String(e)
  }
}

window.saveSettings = () => {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  s.envpath = document.getElementById('s-envpath').value.trim()
  s.poolname = document.getElementById('s-poolname').value.trim()
  s.network = document.getElementById('s-network').value
  s.decryptscript = document.getElementById('s-decryptscript').value.trim()
  s.encryptscript = document.getElementById('s-encryptscript').value.trim()
  localStorage.setItem('pm_settings', JSON.stringify(s))
  const saved = document.getElementById('settings-saved')
  saved.style.display = 'inline'
  setTimeout(() => saved.style.display = 'none', 3000)
  updateDetectedTable(s)
}

// Load settings on startup (after connect)
function applySettings() {
  const s = JSON.parse(localStorage.getItem('pm_settings') || '{}')
  loadSettings()
}
window.resetSettings = () => {
  if (confirm('Clear all saved settings?')) {
    localStorage.removeItem('pm_settings')
    document.getElementById('s-envpath').value = ''
    document.getElementById('s-poolname').value = ''
    document.getElementById('s-decryptscript').value = ''
    document.getElementById('s-encryptscript').value = ''
    document.getElementById('s-network').value = 'mainnet'
    document.getElementById('settings-terminal').textContent = 'Settings cleared.'
    ;['d-cnodehome','d-poolname','d-poolid','d-ticker','d-nodeport','d-promport','d-library','d-opcert','d-nodeversion'].forEach(id => {
      document.getElementById(id).textContent = '—'
    })
  }
}
// ── KEY STATUS ──
document.getElementById('key-status')?.addEventListener('click', () => showPanel('security'))
