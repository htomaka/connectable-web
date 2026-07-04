# connectable-web

Petits outils web déployés sur [www.connectable-web.com](https://www.connectable-web.com/).

## Outils

| URL | Source | Description |
| --- | --- | --- |
| [`/tools/velocity-calculator/`](https://www.connectable-web.com/tools/velocity-calculator/) | [`tools/velocity-calculator/`](./tools/velocity-calculator) | Calculateur de capacité de sprint agile (Vite + Tailwind) |
| [`/tools/interval-timer/`](https://www.connectable-web.com/tools/interval-timer/) | [`tools/interval-timer/`](./tools/interval-timer) | Timer d'intervalles pour entraînements (HTML/JS vanilla, PWA) |
| [`/tools/cadence/`](https://www.connectable-web.com/tools/cadence/) | [`tools/cadence/`](./tools/cadence) | Métronome de course : cadence (pas/min), battement sans dérive, hors-ligne (HTML/JS vanilla, PWA installable) |

## Structure

```
.
├── home/
│   └── index.html                # Landing page minimaliste (copiée vers dist/index.html)
├── tools/
│   ├── velocity-calculator/      # App Vite + Tailwind (buildée vers dist/tools/velocity-calculator/)
│   ├── interval-timer/           # App statique HTML/JS/PWA (copiée vers dist/tools/interval-timer/)
│   └── cadence/                  # Métronome de course, PWA statique (copiée vers dist/tools/cadence/)
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

## Cadence — packaging Play Store (suivi)

`tools/cadence/` est une PWA « TWA-ready » (manifest complet, icônes maskables, `display:standalone`, offline).
Pour la publier sur le Play Store, l'empaqueter en TWA (étape ultérieure, hors de ce repo) :

1. Générer le projet Android avec [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) :
   `bubblewrap init --manifest https://www.connectable-web.com/tools/cadence/manifest.webmanifest`
2. Publier `.well-known/assetlinks.json` (Digital Asset Links) avec l'empreinte SHA-256 de la clé de signature
   Android — indisponible côté web, à générer au moment du build de l'app.
3. `bubblewrap build` → AAB à téléverser sur la Play Console.

## Licence

MIT
