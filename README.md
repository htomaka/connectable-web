# connectable-web

Petits outils web déployés sur [www.connectable-web.com](https://www.connectable-web.com/).

## Outils

| URL | Source | Description |
| --- | --- | --- |
| [`/tools/velocity-calculator/`](https://www.connectable-web.com/tools/velocity-calculator/) | [`src/`](./src) | Calculateur de capacité de sprint agile (Vite + Tailwind) |
| [`/tools/interval-timer/`](https://www.connectable-web.com/tools/interval-timer/) | [`public/tools/interval-timer/`](./public/tools/interval-timer) | Timer d'intervalles pour entraînements (HTML/JS vanilla, PWA) |

## Structure

```
.
├── src/                          # Velocity calculator (build Vite)
├── public/                       # Assets servis tels quels par Vite
│   └── tools/
│       └── interval-timer/       # Outils statiques, copiés vers dist/tools/<name>/
├── vite.config.js
├── vercel.json                   # Rewrites + redirects + headers
└── package.json
```

## Développement

```bash
npm install
npm run dev      # vite, serveur sur http://localhost:3000
npm run build    # produit dist/
```

## Déploiement

Push sur `master` → déploiement automatique sur Vercel (projet branché sur `connectable-web.com`).

## Licence

MIT
