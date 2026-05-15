# Trimline

Trimline is a local-first Windows audio trimmer built with Tauri + React.

## Local development

```bash
npm ci
npm run dev
```

Website preview:

```bash
npm run web:dev
```

## Build

Frontend + website:

```bash
npm run build
```

Windows app installer:

```bash
npx tauri build --bundles nsis,msi
```

## Website + downloads + donations (live setup)

Deployment instructions are in:

- [`DEPLOYMENT.md`](./DEPLOYMENT.md)

This includes:
- GitHub Pages hosting,
- automatic Windows release assets (`.exe` + `.msi`),
- Ko-fi and Razorpay button wiring.
