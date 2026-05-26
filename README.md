# connectable-web

Petits outils web déployés sur [www.connectable-web.com](https://www.connectable-web.com/).

## Outils

| URL | Source | Description |
| --- | --- | --- |
| [`/tools/velocity-calculator/`](https://www.connectable-web.com/tools/velocity-calculator/) | [`tools/velocity-calculator/`](./tools/velocity-calculator) | Calculateur de capacité de sprint agile (Vite + Tailwind) |
| [`/tools/interval-timer/`](https://www.connectable-web.com/tools/interval-timer/) | [`tools/interval-timer/`](./tools/interval-timer) | Timer d'intervalles pour entraînements (HTML/JS vanilla, PWA) |

## Structure

```
.
├── home/
│   └── index.html                # Landing page minimaliste (copiée vers dist/index.html)
├── tools/
│   ├── velocity-calculator/      # App Vite + Tailwind (buildée vers dist/tools/velocity-calculator/)
│   └── interval-timer/           # App statique HTML/JS/PWA (copiée vers dist/tools/interval-timer/)
├── vite.config.js
├── vercel.json                   # Headers de sécurité + trailing slash
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
