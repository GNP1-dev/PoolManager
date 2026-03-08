#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ssh2::{Session, KeyboardInteractivePrompt, Prompt};
use std::io::Read;
use std::net::TcpStream;
use std::sync::Mutex;
use tauri::State;

struct SshState(Mutex<Option<Session>>);

#[derive(serde::Deserialize)]
struct ConnectionProfile {
    host: String,
    port: u16,
    username: String,
    totp_code: String,
    password: String,
}

#[derive(serde::Serialize)]
struct CommandResult {
    success: bool,
    output: String,
    error: String,
}

fn ok(output: &str) -> CommandResult {
    CommandResult { success: true, output: output.to_string(), error: String::new() }
}

fn err(error: &str) -> CommandResult {
    CommandResult { success: false, output: String::new(), error: error.to_string() }
}

struct Authenticator {
    totp: String,
    password: String,
}

impl KeyboardInteractivePrompt for Authenticator {
    fn prompt(&mut self, _username: &str, _instructions: &str, prompts: &[Prompt]) -> Vec<String> {
        prompts.iter().map(|p| {
            let text = p.text.to_lowercase();
            if text.contains("verification") || text.contains("authenticator") || text.contains("code") {
                self.totp.clone()
            } else {
                self.password.clone()
            }
        }).collect()
    }
}

#[tauri::command]
fn ssh_connect(profile: ConnectionProfile, state: State<SshState>) -> CommandResult {
    let addr = format!("{}:{}", profile.host, profile.port);

    let tcp = match TcpStream::connect(&addr) {
        Ok(t) => t,
        Err(e) => return err(&format!("Could not reach {} — {}", addr, e)),
    };

    let mut sess = match Session::new() {
        Ok(s) => s,
        Err(e) => return err(&format!("SSH session error: {}", e)),
    };

    sess.set_tcp_stream(tcp);

    if let Err(e) = sess.handshake() {
        return err(&format!("SSH handshake failed: {}", e));
    }

    let mut authenticator = Authenticator {
        totp: profile.totp_code.clone(),
        password: profile.password.clone(),
    };

    let _ = sess.userauth_keyboard_interactive(&profile.username, &mut authenticator);

    if !sess.authenticated() {
        if let Err(e) = sess.userauth_password(&profile.username, &profile.password) {
            return err(&format!("Authentication failed: {}", e));
        }
    }

    if !sess.authenticated() {
        return err("Authentication failed — check your credentials and TOTP code");
    }

    *state.0.lock().unwrap() = Some(sess);
    ok("Connected successfully")
}

#[tauri::command]
fn ssh_run(command: String, state: State<SshState>) -> CommandResult {
    let guard = state.0.lock().unwrap();
    let sess = match guard.as_ref() {
        Some(s) => s,
        None => return err("Not connected — please connect to a node first"),
    };

    let mut channel = match sess.channel_session() {
        Ok(c) => c,
        Err(e) => return err(&format!("Channel error: {}", e)),
    };

    if let Err(e) = channel.exec(&command) {
        return err(&format!("Exec error: {}", e));
    }

    let mut output = String::new();
    channel.read_to_string(&mut output).unwrap_or(0);

    let mut stderr_output = String::new();
    channel.stderr().read_to_string(&mut stderr_output).unwrap_or(0);

    channel.wait_close().ok();
    let exit_code = channel.exit_status().unwrap_or(1);

    CommandResult {
        success: exit_code == 0,
        output,
        error: stderr_output,
    }
}

#[tauri::command]
fn ssh_disconnect(state: State<SshState>) -> CommandResult {
    *state.0.lock().unwrap() = None;
    ok("Disconnected")
}

fn main() {
    tauri::Builder::default()
        .manage(SshState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            ssh_connect,
            ssh_run,
            ssh_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
