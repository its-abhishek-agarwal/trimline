import { useEffect, useState, type CSSProperties } from 'react'
import appLogo from '../assets/trimline-primary-logo.svg'
import audioFileIcon from '../assets/ph-file-audio.svg'
import scissorsIcon from '../assets/solar-scissors-linear.svg'
import trimlineUiImage from '../assets/trimline-ui.png'
import { WEBSITE_CONFIG } from './siteConfig'

const { exeDownloadUrl: EXE_DOWNLOAD_URL, msiDownloadUrl: MSI_DOWNLOAD_URL, kofiUrl: KOFI_URL, razorpayUrl: RAZORPAY_URL } =
  WEBSITE_CONFIG

const features = [
  {
    title: 'Local processing',
    detail: 'Audio never leaves your machine while Trimline trims and exports beside the source file.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="2.8" />
        <path d="M8.5 19h7" />
        <path d="M12 16v3" />
      </svg>
    ),
  },
  {
    title: 'Precise waveform trim',
    detail: 'Use handles, exact time inputs, and keyboard nudging to land on the clip you actually want.',
    icon: <img src={scissorsIcon} alt="" aria-hidden="true" />,
  },
  {
    title: 'Common export formats',
    detail: 'MP3, WAV, M4A, FLAC, OGG, or same as source, all with stereo output built in.',
    icon: <img src={audioFileIcon} alt="" aria-hidden="true" />,
  },
  {
    title: 'Simple output naming',
    detail: 'Rename the clip before export and let Trimline handle collisions cleanly for repeated saves.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.75h7.2L19.75 9.3v10.2A2.25 2.25 0 0 1 17.5 21.75h-10A2.25 2.25 0 0 1 5.25 19.5v-13A2.75 2.75 0 0 1 8 3.75Z" />
        <path d="M14 3.75v5.5h5.75" />
        <path d="M8.5 14.25h7" />
        <path d="M8.5 17.25h5" />
      </svg>
    ),
  },
]

const installNotes = [
  {
    label: 'Installation warning',
    detail:
      'If Windows blocks install, right-click the downloaded file -> Properties -> check Unblock -> Apply -> then run installer again.',
  },
  {
    label: 'FFmpeg bundled',
    detail: 'FFmpeg and FFprobe ship inside the installer, so you do not need separate audio tools.',
  },
  {
    label: 'WebView2 runtime',
    detail: 'If WebView2 is missing, setup can fetch it once during installation.',
  },
  {
    label: 'Windows 10 / 11',
    detail: 'Built for Windows 10 and Windows 11 desktop systems.',
  },
]

const lineColumns = Array.from({ length: 52 }, (_, index) => {
  const scales = [0.48, 0.72, 0.58, 0.86, 0.54, 0.94, 0.64, 1, 0.6, 0.9, 0.56, 0.82]
  const opacities = [0.36, 0.5, 0.42, 0.6, 0.38, 0.66, 0.44, 0.7, 0.4, 0.58, 0.37, 0.54]
  const durations = [5.2, 4.6, 5.8, 4.3, 5.4, 4.1, 5.1, 4.5]

  return {
    scale: scales[index % scales.length],
    opacity: opacities[index % opacities.length],
    duration: durations[index % durations.length],
  }
})

export function WebsiteApp() {
  const [headerProgress, setHeaderProgress] = useState(0)
  const [activeInstallNote, setActiveInstallNote] = useState(installNotes[0].label)

  useEffect(() => {
    const updateHeader = () => {
      const progress = Math.min(1, Math.max(0, window.scrollY / Math.max(window.innerHeight * 0.32, 220)))
      setHeaderProgress(progress)
    }

    updateHeader()
    window.addEventListener('scroll', updateHeader, { passive: true })
    window.addEventListener('resize', updateHeader)

    return () => {
      window.removeEventListener('scroll', updateHeader)
      window.removeEventListener('resize', updateHeader)
    }
  }, [])

  const activeNote = installNotes.find((note) => note.label === activeInstallNote) ?? installNotes[0]

  return (
    <main className="site-shell">
      <header
        className="site-header"
        style={{
          backgroundColor: `rgba(244, 241, 236, ${0.02 + headerProgress * 0.92})`,
          borderBottomColor: `rgba(210, 210, 210, ${0.08 + headerProgress * 0.76})`,
          boxShadow: 'none',
          backdropFilter: `blur(${4 + headerProgress * 10}px)`,
        }}
      >
        <div className="site-header-inner">
          <a className="brand-lockup" href="#top" aria-label="Trimline home">
            <img src={appLogo} alt="Trimline logo" />
          </a>
          <a className="header-cta" href="#top">
            Download
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-lines" aria-hidden="true">
          {lineColumns.map((column, index) => (
            <span
              key={`${column.scale}-${index}`}
              style={
                {
                  '--line-scale': String(column.scale),
                  '--line-opacity': String(column.opacity),
                  animationDelay: `${index * 90}ms`,
                  animationDuration: `${column.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="hero-grid">
          <div className="hero-copy-column">
            <div className="hero-copy-frame">
              <p className="eyebrow">FREE AUDIO TRIMMER FOR WINDOWS</p>
              <h1>Trimline</h1>
              <p className="hero-copy">
                Import audio, set the exact range on the waveform, name the output,
                <br />
                and export the clip instantly beside the source file.
              </p>

              <div className="hero-actions" id="download-actions">
                <a className="download-button" href={EXE_DOWNLOAD_URL}>
                  <span className="download-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 4v10" />
                      <path d="M7.5 10.5 12 15l4.5-4.5" />
                      <path d="M5 19h14" />
                    </svg>
                  </span>
                  <span className="download-button-copy">
                    <strong>Download .exe</strong>
                    <small>Best for most Windows users</small>
                  </span>
                </a>
                <a className="download-button" href={MSI_DOWNLOAD_URL}>
                  <span className="download-button-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="m5 8 7-4 7 4-7 4Z" />
                      <path d="M5 8v8l7 4 7-4V8" />
                      <path d="M12 12v8" />
                    </svg>
                  </span>
                  <span className="download-button-copy">
                    <strong>Download .msi</strong>
                    <small>Useful for managed installs</small>
                  </span>
                </a>
              </div>
            </div>
          </div>

          <div className="hero-preview-column">
            <img src={trimlineUiImage} alt="Trimline app interface preview" className="hero-preview-image" />
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading">
          <h2>Everything for quick clips</h2>
          <p>Focused on the clipping workflow instead of a full editor.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-icon" aria-hidden="true">
                {feature.icon}
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="install-notes">
        <div className="section-heading">
          <h2>Before you install</h2>
        </div>
        <div className="note-row" role="tablist" aria-label="Installation notes">
          {installNotes.map((note) => (
            <button
              key={note.label}
              type="button"
              className={`note-pill ${note.label === activeInstallNote ? 'active' : ''}`}
              onClick={() => setActiveInstallNote(note.label)}
            >
              {note.label}
            </button>
          ))}
        </div>
        <p className="note-explainer">{activeNote.detail}</p>
      </section>

      <section className="support-section">
        <h2>{'Made with love \u2764\uFE0F'}</h2>
        <p>
          Trimline is free and always will be. Support helps me keep polishing the app,
          <br />
          and if this tool saved you time or hassle, consider showing some appreciation.
        </p>
        <div className="support-actions">
          <a href={KOFI_URL} target="_blank" rel="noreferrer">Show Appreciation (Ko-fi)</a>
          <a href={RAZORPAY_URL} target="_blank" rel="noreferrer">Show Appreciation (Razorpay)</a>
        </div>
      </section>

      <footer className="site-footer">
        <span>Trimline</span>
        <span>Precision audio trimming for Windows</span>
        <a href="#top">Download</a>
      </footer>
    </main>
  )
}
