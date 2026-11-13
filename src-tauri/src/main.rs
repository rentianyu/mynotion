#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! MyNotion 桌面壳。
//!
//! 职责只有三件事：
//! 1. 找出随包分发的 `bin/mynotion-server.exe` 与前端目录 `web/`，用一个空闲端口把它拉起来；
//! 2. 等后端 `/api/health` 真正可用后，把窗口从启动页导航到 `http://127.0.0.1:<port>/`；
//! 3. 应用退出时结束子进程，不留下孤儿 node 进程。

use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::Manager;

static SERVER: Mutex<Option<Child>> = Mutex::new(None);

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// 安装后：`<安装目录>\bin\mynotion-server.exe`；开发/便携形态再兜底几个位置。
fn server_exe() -> Option<PathBuf> {
    let base = exe_dir();
    [
        base.join("bin").join("mynotion-server.exe"),
        base.join("mynotion-server.exe"),
        base.join("resources").join("bin").join("mynotion-server.exe"),
        base.join("..").join("bin").join("mynotion-server.exe"),
    ]
    .into_iter()
    .find(|p| p.is_file())
}

/// 安装后：`<安装目录>\web\index.html`（Tauri resources 保留相对结构）。
fn web_dir() -> Option<PathBuf> {
    let base = exe_dir();
    [
        base.join("web"),
        base.join("resources").join("web"),
        base.join("..").join("apps").join("web").join("dist"),
    ]
    .into_iter()
    .find(|p| p.join("index.html").is_file())
}

/// 数据目录：默认 `%APPDATA%\MyNotion`，可用 MYNOTION_DATA_DIR 覆盖。
fn data_dir() -> PathBuf {
    if let Ok(v) = std::env::var("MYNOTION_DATA_DIR") {
        if !v.trim().is_empty() {
            return PathBuf::from(v);
        }
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        if !appdata.trim().is_empty() {
            return Path::new(&appdata).join("MyNotion");
        }
    }
    exe_dir().join("data")
}

fn free_port() -> u16 {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(8791)
}

/// 端口能连上还不够，必须确认是 MyNotion 后端在应答。
fn http_ready(port: u16) -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(400)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let req = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => String::from_utf8_lossy(&buf[..n]).starts_with("HTTP/1.1 200"),
        _ => false,
    }
}

fn wait_ready(port: u16, limit: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < limit {
        if http_ready(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn spawn_server() -> Result<(Child, u16), String> {
    let exe = server_exe().ok_or_else(|| "找不到 bin\\mynotion-server.exe（安装包不完整？）".to_string())?;
    let web = web_dir().ok_or_else(|| "找不到 web\\index.html（安装包不完整？）".to_string())?;
    let dir = data_dir();
    let logs = dir.join("logs");
    fs::create_dir_all(&logs).map_err(|e| format!("创建数据目录失败：{e}"))?;

    let port = free_port();
    let log_file = File::create(logs.join("server.log")).ok();
    let log_clone = log_file.as_ref().and_then(|f| f.try_clone().ok());

    let mut cmd = Command::new(&exe);
    cmd.env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("DATA_DIR", &dir)
        .env("DATA_FILE", dir.join("mynotion.db"))
        .env("TOKEN_FILE", dir.join("token"))
        .env("WEB_DIST", &web)
        .stdin(Stdio::null());
    match (log_file, log_clone) {
        (Some(out), Some(err)) => {
            cmd.stdout(Stdio::from(out)).stderr(Stdio::from(err));
        }
        _ => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| format!("启动后端失败：{e}"))?;
    Ok((child, port))
}

fn boot(handle: tauri::AppHandle) {
    let result = spawn_server();
    let (child, port) = match result {
        Ok(v) => v,
        Err(msg) => {
            show_error(&handle, &msg);
            return;
        }
    };
    if let Ok(mut guard) = SERVER.lock() {
        *guard = Some(child);
    }

    if wait_ready(port, Duration::from_secs(30)) {
        if let Some(win) = handle.get_webview_window("main") {
            // 用 location.replace 而不是 window.navigate：跨到 http:// 后不再回退到启动页。
            let _ = win.eval(&format!("window.location.replace('http://127.0.0.1:{port}/')"));
        }
    } else {
        show_error(
            &handle,
            "后端启动超时（30 秒）。请查看日志：%APPDATA%\\MyNotion\\logs\\server.log",
        );
    }
}

fn show_error(handle: &tauri::AppHandle, message: &str) {
    if let Some(win) = handle.get_webview_window("main") {
        let js = format!(
            "window.__mynotionError && window.__mynotionError({})",
            serde_json_string(message)
        );
        let _ = win.eval(&js);
    }
}

/// 把字符串安全地嵌进 JS 字面量（不引入 serde_json 依赖）。
fn serde_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || boot(handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("启动 MyNotion 失败")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = SERVER.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
