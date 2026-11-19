// No console window next to the app on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! rsGIS on the desktop: the same map as the web app, in its own window,
//! with everything kept on this computer. Drawings go into a SQLite file in
//! the app's data folder, and base maps come from MBTiles files the person
//! adds, so nothing needs a server or Docker.

mod api;
mod maps;
mod store;

use api::{AppState, Shared};
use maps::{MapFile, MapInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

/// What the app remembers between runs, besides the drawings.
#[derive(Serialize, Deserialize, Default)]
struct Settings {
    map_file: Option<PathBuf>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, s: &Settings) -> Result<(), String> {
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(app)?, text).map_err(|e| e.to_string())
}

/// Asks for an MBTiles file and shows it as the base map. None if the
/// person closed the file chooser.
#[tauri::command]
async fn add_map_file(app: AppHandle, state: tauri::State<'_, Shared>) -> Result<Option<MapInfo>, String> {
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("Add a map file")
        .add_filter("MBTiles map", &["mbtiles"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let map = MapFile::open(&path)?;
    let info = map.info.clone();
    *state.map.lock().unwrap() = Some(map);
    save_settings(&app, &Settings { map_file: Some(path) })?;
    Ok(Some(info))
}

/// Goes back to the built-in maps only.
#[tauri::command]
fn remove_map_file(app: AppHandle, state: tauri::State<'_, Shared>) -> Result<(), String> {
    *state.map.lock().unwrap() = None;
    save_settings(&app, &Settings::default())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![add_map_file, remove_map_file])
        .setup(|app| {
            let handle = app.handle();
            let data_dir = handle.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let store = store::Store::open(&data_dir.join("rsgis.sqlite"))
                .map_err(|e| e.to_string())?;

            // The map file chosen last time, if it is still there.
            let map = load_settings(handle).map_file.and_then(|p| match MapFile::open(&p) {
                Ok(m) => Some(m),
                Err(e) => {
                    eprintln!("Map file {} not loaded: {e}", p.display());
                    None
                }
            });

            let state: Shared = Arc::new(AppState { store: Mutex::new(store), map: Mutex::new(map) });
            app.manage(state.clone());

            // Any free port on this computer only; the window is told which.
            let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
            listener.set_nonblocking(true)?;
            let port = listener.local_addr()?.port();
            tauri::async_runtime::spawn(async move {
                let listener = tokio::net::TcpListener::from_std(listener).expect("listener");
                if let Err(e) = axum::serve(listener, api::router(state, port)).await {
                    eprintln!("Local API stopped: {e}");
                }
            });

            let api_url = serde_json::to_string(&format!("http://127.0.0.1:{port}"))?;
            WebviewWindowBuilder::new(app.handle(), "main", WebviewUrl::default())
                .title("rsGIS")
                .inner_size(1360.0, 860.0)
                .min_inner_size(800.0, 560.0)
                .initialization_script(format!("window.__RSGIS_API__ = {api_url};"))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running rsGIS");
}
