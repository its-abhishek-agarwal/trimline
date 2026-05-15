# Trimline Website + Downloads Deployment

This setup makes your landing page live and keeps download links current from GitHub Releases.

## 1) Push the project to GitHub

1. Create a GitHub repo.
2. Push this project to `main`.

## 2) Enable GitHub Pages (website hosting)

1. Open GitHub repo `Settings -> Pages`.
2. Under `Build and deployment`, set `Source` to `GitHub Actions`.
3. Commit already includes workflow: `.github/workflows/deploy-website.yml`.

After every push to `main`, the website is rebuilt and deployed automatically.

## 3) Add donation links

In GitHub repo `Settings -> Secrets and variables -> Actions -> Variables`, add:

- `VITE_KOFI_URL` = your Ko-fi link
- `VITE_RAZORPAY_URL` = your Razorpay link

Optional:
- `VITE_BASE_PATH` = `/` if you use a custom root domain.
  - If omitted, workflow defaults to `/<repo-name>/` for standard GitHub Pages.

## 4) Publish downloadable installers (.exe + .msi)

Workflow included: `.github/workflows/release-windows.yml`.

When you push a tag like `v0.1.11`, it will:
- build Windows NSIS and MSI installers,
- upload release assets with stable names:
  - `Trimline-Windows-Setup.exe`
  - `Trimline-Windows-Installer.msi`

Commands:

```bash
git tag v0.1.11
git push origin v0.1.11
```

## 5) How website download links work

By default, website buttons point to:

- `https://github.com/<owner>/<repo>/releases/latest/download/Trimline-Windows-Setup.exe`
- `https://github.com/<owner>/<repo>/releases/latest/download/Trimline-Windows-Installer.msi`

This means visitors always get the latest release files.

## 6) Local env override (optional)

Copy `.env.example` to `.env` and customize if needed:

```bash
VITE_GITHUB_REPO=your-github-username/your-repo-name
VITE_EXE_DOWNLOAD_URL=
VITE_MSI_DOWNLOAD_URL=
VITE_KOFI_URL=https://ko-fi.com/yourname
VITE_RAZORPAY_URL=https://pages.razorpay.com/your-page
```

If `VITE_EXE_DOWNLOAD_URL` / `VITE_MSI_DOWNLOAD_URL` are blank, app auto-uses the GitHub Releases `latest/download` links.
