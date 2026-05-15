import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import './index.css'
import { clamp, formatTime, isValidTrimRange, parseSeconds } from './utils'
import appLogo from './assets/trimline-primary-logo.svg'

type AudioProbe = { duration: number; sampleRate: number; channels: number; codec: string; format: string }
type OutputPathResponse = { outputPath: string }
type DependencyStatus = { ffmpeg: boolean; ffprobe: boolean }
type TrimAudioResponse = { outputPath: string; duration: number; sizeBytes: number }
type EditableRegion = { start: number; end: number; setOptions: (options: { start: number; end: number }) => void }

const PRODUCT_NAME = 'Trimline'
const NUDGE_STEP = 0.1
const DOT_COUNT = 40
const KOFI_URL = 'https://ko-fi.com/hiabhishek'
const RAZORPAY_URL = 'https://razorpay.me/@hi_abhishek'

const EXPORT_OPTIONS = [
  { value: 'same', label: 'Same as source' },
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'm4a', label: 'M4A' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
]

function App() {
  const waveformRef = useRef<HTMLDivElement | null>(null)
  const waveSurferRef = useRef<WaveSurfer | null>(null)
  const regionRef = useRef<EditableRegion | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null)
  const scrubbingRef = useRef(false)
  const previewTimerRef = useRef<number | null>(null)
  const previewTargetRef = useRef<number | null>(null)

  const [inputPath, setInputPath] = useState('')
  const [probe, setProbe] = useState<AudioProbe | null>(null)
  const [startSec, setStartSec] = useState(0)
  const [endSec, setEndSec] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [exportFormat, setExportFormat] = useState('same')
  const [outputName, setOutputName] = useState('')
  const [status, setStatus] = useState('Import a file to begin.')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        const dep = await invoke<DependencyStatus>('check_dependencies')
        if (!dep.ffmpeg || !dep.ffprobe) {
          setError('Missing dependency: install FFmpeg so ffmpeg + ffprobe are available on PATH.')
          setStatus('Dependency check failed.')
        }
      } catch {
        setError('Could not verify FFmpeg dependencies at startup.')
      }
    }
    void check()
  }, [])

  const canExport = useMemo(() => {
    if (!probe || !inputPath || isBusy) return false
    return isValidTrimRange(startSec, endSec, probe.duration)
  }, [probe, inputPath, isBusy, startSec, endSec])

  const timelineTicks = useMemo(() => {
    const duration = probe?.duration ?? 0
    if (duration <= 0) return { major: [] as number[], minor: [] as number[] }

    const wholeSeconds = Math.floor(duration)
    if (wholeSeconds <= 0) return { major: [] as number[], minor: [] as number[] }
    const minorStep = wholeSeconds <= 120 ? 1 : Math.max(1, Math.ceil(wholeSeconds / DOT_COUNT))
    const minor: number[] = []

    for (let i = 0; i <= wholeSeconds; i += minorStep) {
      minor.push(i)
    }

    const major: number[] = []
    const labelStep = minor.length > 30 ? 3 : 2
    for (let i = 1; i < minor.length - 1; i += labelStep) {
      major.push(minor[i])
    }

    return { major, minor }
  }, [probe])

  const tickLeft = useCallback((tick: number, duration: number) => {
    const percent = (tick / duration) * 100
    return percent >= 99.8 ? 'calc(100% - 2px)' : `${percent}%`
  }, [])

  const setPlayhead = useCallback(
    (next: number) => {
      const ws = waveSurferRef.current
      if (!ws || !probe) return
      const clamped = clamp(next, 0, probe.duration)
      ws.setTime(clamped)
      setCurrentTime(clamped)
    },
    [probe],
  )

  const previewAt = useCallback(
    (next: number) => {
      const ws = waveSurferRef.current
      if (!ws || !probe) return
      const clamped = clamp(next, 0, probe.duration)
      setPlayhead(clamped)

      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)

      ws.pause()
      previewTargetRef.current = clamped
      ws.play(clamped, Math.min(clamped + 0.16, probe.duration))
      previewTimerRef.current = window.setTimeout(() => {
        ws.pause()
        ws.setTime(clamped)
        setCurrentTime(clamped)
        previewTargetRef.current = null
        previewTimerRef.current = null
      }, 180)
    },
    [probe, setPlayhead],
  )

  const previewThenStay = (next: number) => {
    previewAt(next)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLInputElement | null
      const tag = target?.tagName?.toLowerCase()
      const isRange = tag === 'input' && target?.type === 'range'
      const inInput = (tag === 'input' || tag === 'textarea' || tag === 'select') && !isRange
      if (inInput) return

      const ws = waveSurferRef.current
      if (!ws || !probe) return

      if (event.code === 'Space') {
        event.preventDefault()
        if (ws.isPlaying()) ws.pause()
        else ws.play()
      }

      if (event.key === '[' && regionRef.current) {
        const current = clamp(ws.getCurrentTime(), 0, probe.duration)
        if (current < endSec) {
          setStartSec(current)
          regionRef.current.setOptions({ start: current, end: endSec })
        }
      }

      if (event.key === ']' && regionRef.current) {
        const current = clamp(ws.getCurrentTime(), 0, probe.duration)
        if (current > startSec) {
          setEndSec(current)
          regionRef.current.setOptions({ start: startSec, end: current })
        }
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        previewAt((previewTargetRef.current ?? currentTime) + NUDGE_STEP)
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previewAt((previewTargetRef.current ?? currentTime) - NUDGE_STEP)
      }

      const canExportNow = !isBusy && isValidTrimRange(startSec, endSec, probe.duration)
      if (event.key === 'Enter' && canExportNow) {
        event.preventDefault()
        exportButtonRef.current?.click()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [probe, startSec, endSec, currentTime, isBusy, previewAt])

  useEffect(() => {
    return () => {
      waveSurferRef.current?.destroy()
      waveSurferRef.current = null
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const setupWaveform = async (filePath: string, duration: number) => {
    if (!waveformRef.current) return

    waveSurferRef.current?.destroy()
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)

    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#9a9a9a',
      progressColor: '#9a9a9a',
      cursorColor: '#e11d48',
      cursorWidth: 3,
      height: 136,
      normalize: true,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      plugins: [regions],
    })

    waveSurferRef.current = ws

    ws.on('ready', () => {
      const region = regions.addRegion({
        start: 0,
        end: Math.max(0.2, Math.min(duration, Math.max(duration * 0.25, 4))),
        color: 'rgba(255, 90, 43, 0.35)',
        drag: true,
        resize: true,
      })
      regionRef.current = region
      setStartSec(region.start)
      setEndSec(region.end)
      setCurrentTime(0)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => setIsPlaying(false))
    ws.on('timeupdate', (time) => {
      if (previewTargetRef.current !== null) return
      setCurrentTime(time)
    })
    ws.on('interaction', (time) => setCurrentTime(time))

    regions.on('region-updated', (region: EditableRegion) => {
      regionRef.current = region
      setStartSec(region.start)
      setEndSec(region.end)
    })

    const bytes = await readFile(filePath)
    const objectUrl = URL.createObjectURL(new Blob([bytes]))
    objectUrlRef.current = objectUrl
    await ws.load(objectUrl)
  }

  const importFile = async () => {
    try {
      setError('')
      const selected = await open({
        title: 'Choose audio file',
        multiple: false,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }],
      })
      if (!selected || Array.isArray(selected)) return

      setIsBusy(true)
      setStatus('Analyzing audio...')
      const filePath = selected
      const metadata = await invoke<AudioProbe>('probe_audio', { path: filePath })
      const base = filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '') || 'trimmed_audio'

      setInputPath(filePath)
      setProbe(metadata)
      setExportFormat('same')
      setOutputName(`${base}_clip`)
      await setupWaveform(filePath, metadata.duration)
      setStatus('Audio loaded. Refine selection and export.')
    } catch (err) {
      setError(String(err))
      setStatus('Import failed.')
    } finally {
      setIsBusy(false)
    }
  }

  const syncRegionFromInputs = () => {
    if (!probe || !regionRef.current) return
    const clampedStart = clamp(startSec, 0, probe.duration)
    const clampedEnd = clamp(endSec, 0, probe.duration)
    if (clampedEnd <= clampedStart) return
    regionRef.current.setOptions({ start: clampedStart, end: clampedEnd })
  }

  const playPause = () => {
    const ws = waveSurferRef.current
    if (!ws) return
    if (ws.isPlaying()) ws.pause()
    else ws.play()
  }

  const finishScrub = () => {
    scrubbingRef.current = false
    const ws = waveSurferRef.current
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    if (ws) {
      ws.pause()
      if (previewTargetRef.current !== null) {
        ws.setTime(previewTargetRef.current)
        setCurrentTime(previewTargetRef.current)
      }
    }
    previewTargetRef.current = null
  }

  const scrubTimeFromClientX = (clientX: number) => {
    if (!probe || !scrubberTrackRef.current) return null
    const rect = scrubberTrackRef.current.getBoundingClientRect()
    const percent = clamp((clientX - rect.left) / rect.width, 0, 1)
    return percent * probe.duration
  }

  const scrubToClientX = (clientX: number, shouldPreview: boolean) => {
    const next = scrubTimeFromClientX(clientX)
    if (next === null) return
    setPlayhead(next)
    if (!shouldPreview) {
      previewTargetRef.current = next
      return
    }
    previewAt(next)
  }

  const onScrubberPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubbingRef.current = true
    scrubToClientX(event.clientX, false)
  }

  const onScrubberPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    scrubToClientX(event.clientX, true)
  }

  const onScrubberPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    scrubToClientX(event.clientX, false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    finishScrub()
  }

  const currentPercent = probe ? (currentTime / probe.duration) * 100 : 0

  const exportTrim = async () => {
    if (!probe || !inputPath) return
    if (!isValidTrimRange(startSec, endSec, probe.duration)) {
      setError('Invalid range. Start must be lower than End and inside duration.')
      return
    }
    try {
      setError('')
      setIsBusy(true)
      setStatus('Preparing export...')
      const outPath = await invoke<OutputPathResponse>('generate_output_path', {
        payload: { inputPath, outputFormat: exportFormat, outputName },
      })
      setStatus('Exporting trimmed audio...')
      const result = await invoke<TrimAudioResponse>('trim_audio', {
        payload: {
          inputPath,
          outputPath: outPath.outputPath,
          startSec,
          endSec,
          outputFormat: exportFormat,
        },
      })
      setStatus(`Export complete: ${result.outputPath}`)
    } catch (err) {
      setError(String(err))
      setStatus('Export failed.')
    } finally {
      setIsBusy(false)
    }
  }

  const sourceName = inputPath.split(/[/\\]/).pop() || 'No file selected'

  const openSupportLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <main className="app-shell">
        <header className="hero panel merged-top">
          <div className="brand vertical-center">
            <img src={appLogo} alt="Trimline logo" />
            <h1>{PRODUCT_NAME}</h1>
            <aside className="feature-inline" aria-label="Trimline features">
              <span>
                <svg viewBox="0 0 20 20" className="tick-icon" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                Instant stereo export
              </span>
              <span className="sep">|</span>
              <span>
                <svg viewBox="0 0 20 20" className="tick-icon" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                Timeline drag + exact time inputs
              </span>
              <span className="sep">|</span>
              <span>
                <svg viewBox="0 0 20 20" className="tick-icon" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                Export in different formats
              </span>
            </aside>
          </div>
        </header>

        <section className="panel timeline-panel">
          <div className="import-row">
            <button className="import-chip" onClick={importFile} disabled={isBusy}>
              <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
                <path d="M12 3v11" />
                <path d="M7 9l5 5 5-5" />
                <path d="M4 19h16" />
              </svg>
              <span className="import-copy">Import Audio</span>
            </button>
            <div className="file-label">{sourceName}</div>
          </div>

          <div className="timeline-stack">
            <div className="wave-wrap" ref={waveformRef} />

            {probe ? (
              <div
                ref={scrubberTrackRef}
                className="playhead-track"
                onPointerDown={onScrubberPointerDown}
                onPointerMove={onScrubberPointerMove}
                onPointerUp={onScrubberPointerUp}
                onPointerCancel={finishScrub}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={probe.duration}
                aria-valuenow={currentTime}
                tabIndex={-1}
              >
                <div className="playhead-fill" style={{ width: `${currentPercent}%` }} />
                <div className="playhead-thumb" style={{ left: `${currentPercent}%` }} />
              </div>
            ) : null}

            <div className="timeline-ruler">
              {probe ? (
                <div className="cursor-tooltip" style={{ left: tickLeft(currentTime, probe.duration) }}>
                  {formatTime(currentTime)}
                </div>
              ) : null}
              <div className="minor-ticks">
                {probe
                  ? timelineTicks.minor.map((tick) => (
                      <button
                        key={`m-${tick}`}
                        className={`minor-dot ${Math.abs(tick - currentTime) <= probe.duration / DOT_COUNT / 2 ? 'active' : ''}`}
                        style={{ left: tickLeft(tick, probe.duration) }}
                        title={formatTime(tick)}
                        type="button"
                        onClick={() => previewThenStay(tick)}
                      />
                    ))
                  : null}
              </div>
              <div className="major-ticks">
                {probe
                  ? timelineTicks.major.map((tick) => (
                      <span key={`j-${tick}`} className="major-label" style={{ left: tickLeft(tick, probe.duration) }}>
                        {formatTime(tick).slice(0, 5)}
                      </span>
                    ))
                  : null}
              </div>
            </div>
          </div>

          <div className="control-row">
            <button
              className="round-play"
              onClick={playPause}
              disabled={!probe || isBusy}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
                  <path d="M8 5l11 7-11 7z" />
                </svg>
              )}
            </button>

            <label className="small-field start-field">
              Start
              <input
                type="number"
                min={0}
                step={0.01}
                value={startSec.toFixed(2)}
                onChange={(event) => setStartSec(parseSeconds(event.target.value))}
                onBlur={syncRegionFromInputs}
              />
            </label>

            <label className="small-field end-field">
              End
              <input
                type="number"
                min={0}
                step={0.01}
                value={endSec.toFixed(2)}
                onChange={(event) => setEndSec(parseSeconds(event.target.value))}
                onBlur={syncRegionFromInputs}
              />
            </label>

            <label className="wide-field output-field">
              Output Name
              <input
                type="text"
                value={outputName}
                onChange={(event) => setOutputName(event.target.value)}
                placeholder="my_audio_clip"
                disabled={!probe || isBusy}
              />
            </label>

            <label className="format-field">
              Export Format
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value)}
                disabled={isBusy}
                className="export-select"
              >
                {EXPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              ref={exportButtonRef}
              className="primary export-button"
              onClick={exportTrim}
              disabled={!canExport}
            >
              <svg viewBox="0 0 24 24" className="ui-icon" aria-hidden="true">
                <path d="M12 21V10" />
                <path d="M7 15l5-5 5 5" />
                <path d="M5 5h14" />
              </svg>
              {isBusy ? 'Exporting...' : 'Export Audio'}
            </button>
          </div>

          <div className="meta-row status-row">
            <span>
              From <strong>{formatTime(startSec)}</strong>
            </span>
            <span>
              To <strong>{formatTime(endSec)}</strong>
            </span>
            <span>
              Selected <strong>{formatTime(Math.max(0, endSec - startSec))}</strong>
            </span>
            <span>
              Total <strong>{probe ? formatTime(probe.duration) : '--:--.--'}</strong>
            </span>
            <span className="inline-status">{status}</span>
          </div>

          <div className="shortcut-box">
            <span>
              <strong>Space</strong> Play/Pause
            </span>
            <span className="sep">|</span>
            <span>
              <strong>[</strong> Set Start
            </span>
            <span className="sep">|</span>
            <span>
              <strong>]</strong> Set End
            </span>
            <span className="sep">|</span>
            <span>
              <strong>Left/Right</strong> Nudge 0.1s
            </span>
            <span className="sep">|</span>
            <span>
              <strong>Enter</strong> Export
            </span>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel support-panel">
          <div className="support-copy">
            <h2>
              Made with love
              <span className="support-heart" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 20s-6.5-4.3-8.8-8.1C1.5 9 2.1 5.8 5 4.6c2.1-.9 4.1.1 5.2 1.7 1.1-1.6 3.1-2.6 5.2-1.7 2.9 1.2 3.5 4.4 1.8 7.3C18.5 15.7 12 20 12 20Z" />
                </svg>
              </span>
            </h2>
            <p>
              Trimline is free and always will be. If it helped you
              <br />
              save time or hassle, please show your appreciation.
            </p>
          </div>
          <div className="support-actions-row">
            <button type="button" className="support-action" onClick={() => openSupportLink(KOFI_URL)}>
              Show Appreciation (Ko-fi)
            </button>
            <button type="button" className="support-action wide" onClick={() => openSupportLink(RAZORPAY_URL)}>
              Show Appreciation (Razorpay)
            </button>
          </div>
        </section>
    </main>
  )
}

export default App
