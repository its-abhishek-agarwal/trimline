use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tauri::Manager;
use tauri::path::BaseDirectory;

const SUPPORTED_INPUT_EXTS: [&str; 6] = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];
const SUPPORTED_OUTPUT_FORMATS: [&str; 5] = ["mp3", "wav", "m4a", "flac", "ogg"];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioProbe {
    duration: f64,
    sample_rate: u32,
    channels: u32,
    codec: String,
    format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyStatus {
    ffmpeg: bool,
    ffprobe: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrimAudioRequest {
    input_path: String,
    output_path: String,
    start_sec: f64,
    end_sec: f64,
    output_format: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrimAudioResponse {
    output_path: String,
    duration: f64,
    size_bytes: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateOutputPathRequest {
    input_path: String,
    output_format: String,
    output_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputPathResponse {
    output_path: String,
}

fn normalize_ext<S: AsRef<str>>(value: S) -> String {
    value.as_ref().trim().trim_start_matches('.').to_lowercase()
}

fn source_ext(path: &Path) -> Result<String, String> {
    path.extension()
        .and_then(OsStr::to_str)
        .map(normalize_ext)
        .ok_or_else(|| "Input file must include a supported extension.".to_string())
}

fn validate_input_extension(path: &Path) -> Result<String, String> {
    let ext = source_ext(path)?;
    if SUPPORTED_INPUT_EXTS.contains(&ext.as_str()) {
        Ok(ext)
    } else {
        Err(format!(
            "Unsupported input format '.{}'. Supported formats: {}",
            ext,
            SUPPORTED_INPUT_EXTS.join(", ")
        ))
    }
}

fn resolve_output_extension(input_path: &Path, output_format: &str) -> Result<String, String> {
    let normalized = normalize_ext(output_format);
    if normalized == "same" {
        let input_ext = source_ext(input_path)?;
        if SUPPORTED_OUTPUT_FORMATS.contains(&input_ext.as_str()) {
            Ok(input_ext)
        } else {
            Ok("wav".to_string())
        }
    } else if SUPPORTED_OUTPUT_FORMATS.contains(&normalized.as_str()) {
        Ok(normalized)
    } else {
        Err(format!(
            "Unsupported export format '{}'. Supported formats: same, {}",
            output_format,
            SUPPORTED_OUTPUT_FORMATS.join(", ")
        ))
    }
}

fn format_ffmpeg_time(seconds: f64) -> String {
    format!("{seconds:.6}")
}

fn executable_name(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn bundled_tool_path(app: &tauri::AppHandle, tool_name: &str) -> Option<PathBuf> {
    bundled_tool_candidates(app, tool_name)
        .into_iter()
        .find(|p| p.exists())
}

fn bundled_tool_candidates(app: &tauri::AppHandle, tool_name: &str) -> Vec<PathBuf> {
    let exe = executable_name(tool_name);
    let mut candidates = Vec::new();

    if let Ok(path) = app
        .path()
        .resolve(format!("bin/{exe}"), BaseDirectory::Resource)
    {
        candidates.push(path);
    }

    if let Ok(path) = app
        .path()
        .resolve(format!("resources/bin/{exe}"), BaseDirectory::Resource)
    {
        candidates.push(path);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join(&exe));
        candidates.push(resource_dir.join("resources").join("bin").join(&exe));
    }

    candidates
}

fn run_tool(app: &tauri::AppHandle, tool_name: &str, args: &[&str]) -> Result<Output, String> {
    if let Some(path) = bundled_tool_path(app, tool_name) {
        if path.exists() {
            return Command::new(&path).args(args).output().map_err(|err| {
                format!(
                    "Failed to execute bundled {tool_name} at '{}': {err}",
                    path.display()
                )
            });
        }
    }

    Command::new(tool_name)
        .args(args)
        .output()
        .map_err(|err| format!("Failed to execute {tool_name} from PATH: {err}"))
}

fn tool_exists(app: &tauri::AppHandle, name: &str) -> bool {
    run_tool(app, name, &["-version"])
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn ffprobe(app: &tauri::AppHandle, path: &Path) -> Result<AudioProbe, String> {
    let path_text = path.to_string_lossy().to_string();
    let output = run_tool(
        app,
        "ffprobe",
        &[
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path_text.as_str(),
        ],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let payload: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|err| format!("Invalid ffprobe output: {err}"))?;

    let duration = payload["format"]["duration"]
        .as_str()
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .ok_or_else(|| "Could not determine audio duration.".to_string())?;

    let format = payload["format"]["format_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let audio_stream = payload["streams"]
        .as_array()
        .and_then(|streams| {
            streams
                .iter()
                .find(|stream| stream["codec_type"].as_str() == Some("audio"))
        })
        .ok_or_else(|| "No audio stream found in file.".to_string())?;

    let codec = audio_stream["codec_name"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();

    let sample_rate = audio_stream["sample_rate"]
        .as_str()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);

    let channels = audio_stream["channels"].as_u64().unwrap_or(0) as u32;

    Ok(AudioProbe {
        duration,
        sample_rate,
        channels,
        codec,
        format,
    })
}

fn build_collision_safe_path(input_path: &Path, final_ext: &str) -> Result<PathBuf, String> {
    build_collision_safe_path_with_base_name(input_path, final_ext, None)
}

fn sanitize_base_name(name: &str) -> String {
    let invalid: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let cleaned: String = name
        .chars()
        .map(|c| if invalid.contains(&c) { '_' } else { c })
        .collect();

    cleaned
        .trim()
        .trim_matches('.')
        .trim_end_matches(' ')
        .to_string()
}

fn build_collision_safe_path_with_base_name(
    input_path: &Path,
    final_ext: &str,
    requested_base_name: Option<&str>,
) -> Result<PathBuf, String> {
    let parent = input_path
        .parent()
        .ok_or_else(|| "Input file path does not have a valid parent directory.".to_string())?;

    let stem = input_path
        .file_stem()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "Input file name is invalid.".to_string())?;

    let fallback = format!("{stem}_trimmed");
    let requested = requested_base_name.unwrap_or_default();
    let sanitized = sanitize_base_name(requested);
    let base_name = if sanitized.is_empty() {
        fallback
    } else {
        sanitized
    };

    let mut candidate = parent.join(format!("{base_name}.{final_ext}"));
    let mut index: u32 = 2;

    while candidate.exists() {
        candidate = parent.join(format!("{base_name}_{index}.{final_ext}"));
        index += 1;
    }

    Ok(candidate)
}

#[tauri::command]
fn check_dependencies(handle: tauri::AppHandle) -> DependencyStatus {
    DependencyStatus {
        ffmpeg: tool_exists(&handle, "ffmpeg"),
        ffprobe: tool_exists(&handle, "ffprobe"),
    }
}

#[tauri::command]
fn probe_audio(path: String, handle: tauri::AppHandle) -> Result<AudioProbe, String> {
    let parsed = PathBuf::from(path);
    if !parsed.exists() {
        return Err("Input file does not exist.".to_string());
    }
    validate_input_extension(&parsed)?;
    ffprobe(&handle, &parsed)
}

#[tauri::command]
fn generate_output_path(payload: GenerateOutputPathRequest) -> Result<OutputPathResponse, String> {
    let input_path = PathBuf::from(payload.input_path);
    if !input_path.exists() {
        return Err("Input file does not exist.".to_string());
    }

    let ext = resolve_output_extension(&input_path, &payload.output_format)?;
    let output_path = build_collision_safe_path_with_base_name(
        &input_path,
        &ext,
        payload.output_name.as_deref(),
    )?;

    Ok(OutputPathResponse {
        output_path: output_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn trim_audio(payload: TrimAudioRequest, handle: tauri::AppHandle) -> Result<TrimAudioResponse, String> {
    let input_path = PathBuf::from(&payload.input_path);
    let output_path = PathBuf::from(&payload.output_path);

    if !input_path.exists() {
        return Err("Input file does not exist.".to_string());
    }

    validate_input_extension(&input_path)?;
    let probe = ffprobe(&handle, &input_path)?;

    if payload.start_sec < 0.0
        || payload.end_sec <= payload.start_sec
        || payload.end_sec > probe.duration
    {
        return Err("Invalid trim range. Ensure start < end and both are within file duration.".to_string());
    }

    let ext = resolve_output_extension(&input_path, &payload.output_format)?;
    let ffmpeg_format = if ext == "m4a" { "ipod" } else { ext.as_str() };

    let parent = output_path
        .parent()
        .ok_or_else(|| "Output path is invalid.".to_string())?;

    if !parent.exists() {
        return Err("Output directory does not exist.".to_string());
    }

    let start = format_ffmpeg_time(payload.start_sec);
    let end = format_ffmpeg_time(payload.end_sec);
    let input_path_text = input_path.to_string_lossy().to_string();
    let output_path_text = output_path.to_string_lossy().to_string();
    let output = run_tool(
        &handle,
        "ffmpeg",
        &[
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            start.as_str(),
            "-to",
            end.as_str(),
            "-i",
            input_path_text.as_str(),
            "-vn",
            "-ac",
            "2",
            "-f",
            ffmpeg_format,
            output_path_text.as_str(),
        ],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    let metadata = fs::metadata(&output_path)
        .map_err(|err| format!("Trimmed file was not created correctly: {err}"))?;

    Ok(TrimAudioResponse {
        output_path: output_path.to_string_lossy().to_string(),
        duration: payload.end_sec - payload.start_sec,
        size_bytes: metadata.len(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_dependencies,
            probe_audio,
            trim_audio,
            generate_output_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_same_to_input_ext() {
        let input = PathBuf::from("track.mp3");
        assert_eq!(resolve_output_extension(&input, "same").unwrap(), "mp3");
    }

    #[test]
    fn validates_supported_ext() {
        let input = PathBuf::from("track.wav");
        assert!(validate_input_extension(&input).is_ok());
    }

    #[test]
    fn rejects_unsupported_export_ext() {
        let input = PathBuf::from("track.wav");
        assert!(resolve_output_extension(&input, "aiff").is_err());
    }

    #[test]
    fn sanitizes_output_base_name() {
        let value = sanitize_base_name("my:trim*name?");
        assert_eq!(value, "my_trim_name_");
    }
}

