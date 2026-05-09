use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Spawn the Python backend process.
///
/// Two modes of operation:
///
/// 1. **Production (packaged build)**: Uses the sidecar binary defined in
///    `tauri.conf.json > bundle > externalBin`. The sidecar is the
///    PyInstaller-built backend executable (`binaries/backend`).
///
/// 2. **Development fallback**: If the sidecar binary is not available,
///    runs `uv run uvicorn` directly. This allows hot-reload during
///    development without needing to build the sidecar.
///
/// The backend process is started when the Tauri app launches.
/// When the Tauri window closes, the backend process is terminated
/// automatically by Tauri's process management.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_backend(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Try sidecar first (production), fall back to uv (development).
fn spawn_backend(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Try the packaged sidecar binary first (production mode)
    let sidecar_result = app.shell().sidecar("backend");

    match sidecar_result {
        Ok(sidecar_cmd) => {
            // Attempt to spawn the sidecar
            match sidecar_cmd.spawn() {
                Ok((rx, _child)) => {
                    log_output(rx, "backend(sidecar)");
                    eprintln!("[paper-reader] Backend sidecar spawned (production mode)");
                    Ok(())
                }
                Err(e) => {
                    eprintln!(
                        "[paper-reader] Sidecar found but spawn failed: {}",
                        e
                    );
                    eprintln!("[paper-reader] Falling back to uv development mode...");
                    spawn_backend_uv(app)
                }
            }
        }
        Err(_) => {
            eprintln!("[paper-reader] Sidecar not available, falling back to uv development mode...");
            spawn_backend_uv(app)
        }
    }
}

/// Start backend via `uv run uvicorn` (development mode).
fn spawn_backend_uv(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let (rx, _child) = app
        .shell()
        .command("uv")
        .args([
            "run",
            "--directory",
            "backend",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--reload",
        ])
        .spawn()?;

    log_output(rx, "backend(uv)");
    eprintln!("[paper-reader] Backend started via uv (development mode)");
    Ok(())
}

/// Log command output on a background async task.
///
/// Prints stdout/stderr prefixed with the label so backend logs are
/// visible in the Tauri console during development.
fn log_output(rx: tauri_plugin_shell::process::CommandRx, label: &'static str) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[{}] {}", label, String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[{}:err] {}", label, String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[{}] process exited: {:?}", label, status);
                    break;
                }
                CommandEvent::Error(err) => {
                    eprintln!("[{}] error: {}", label, err);
                    break;
                }
                _ => {}
            }
        }
    });
}