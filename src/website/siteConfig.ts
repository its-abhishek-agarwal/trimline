const repoFromEnv = import.meta.env.VITE_GITHUB_REPO?.trim()
const releaseBaseUrl = repoFromEnv
  ? `https://github.com/${repoFromEnv}/releases/latest/download`
  : ''

const fallbackExe = releaseBaseUrl
  ? `${releaseBaseUrl}/Trimline-Windows-Setup.exe`
  : '#download-exe'
const fallbackMsi = releaseBaseUrl
  ? `${releaseBaseUrl}/Trimline-Windows-Installer.msi`
  : '#download-msi'

export const WEBSITE_CONFIG = {
  exeDownloadUrl: import.meta.env.VITE_EXE_DOWNLOAD_URL?.trim() || fallbackExe,
  msiDownloadUrl: import.meta.env.VITE_MSI_DOWNLOAD_URL?.trim() || fallbackMsi,
  kofiUrl: import.meta.env.VITE_KOFI_URL?.trim() || '#ko-fi',
  razorpayUrl: import.meta.env.VITE_RAZORPAY_URL?.trim() || '#razorpay',
} as const
