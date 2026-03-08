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

    <div class="form-row">
      <div class="form-group">
        <label>Hostname / IP</label>
        <input id="c-host" type="text" placeholder="192.168.0.62" />
      </div>
      <div class="form-group port">
        <label>Port</label>
        <input id="c-port" type="text" placeholder="22" value="22" />
      </div>
    </div>

    <div class="form-group">
      <label>Username</label>
      <input id="c-user" type="text" placeholder="russell" />
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
      loadDashboard()
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
  'source /opt/cardano/cnode_bp/scripts/env && cardano-cli query kes-period-info --mainnet 2>/dev/null || echo "Check KES manually with your pool cert path"',
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
  const pwd = prompt('Enter key encryption password:')
  if (pwd) run(
    'bash /opt/cardano/cnode_bp/priv/decrypt_keys.sh "' + pwd + '" 2>/dev/null || echo "Decrypt script not found - please configure path in Security panel"',
    'security-terminal'
  )
}

window.promptEncrypt = () => {
  const pwd = prompt('Enter password to re-encrypt keys:')
  if (pwd && confirm('Encrypt keys and securely wipe unencrypted files?')) {
    run(
      'bash /opt/cardano/cnode_bp/priv/encrypt_keys.sh "' + pwd + '" 2>/dev/null || echo "Encrypt script not found - please configure path in Security panel"',
      'security-terminal'
    )
  }
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

// ── KEY STATUS ──
document.getElementById('key-status')?.addEventListener('click', () => showPanel('security'))
