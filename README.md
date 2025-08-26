# Draw.io Diagram Workspace (ASP.NET Core MVC Proof of Concept)

![Demo Screenshot](/docs/screens/image.png)

## Overview
A lightweight proof‑of‑concept web workspace that embeds the official draw.io editor inside an ASP.NET Core 9 MVC application. It demonstrates clean layering (Controller + Storage Service), Alpine.js driven reactive UI, and a fully in-browser authoring workflow for `.drawio` files stored on the server.

## Key Goals
- Zero-build diagramming workspace your users can open in a browser.
- Server‑side persistence for native `.drawio` sources (not just exported PNG/SVG).
- Smooth UX: instant load, autosave, explicit Save & Exit, welcome screen.
- Clean, modular architecture ready to extend (rename/delete/versioning, auth, etc.).

## Core Features
| Feature | Description |
|---------|-------------|
| List Diagrams | Left navigation enumerates `.drawio` files under `wwwroot/testDiagrams` via `IDiagramStorage`. |
| Create Diagram | Modal prompts for a name; server creates a blank draw.io XML and immediately loads it. |
| Embedded Editor | `iframe` to `https://embed.diagrams.net` using JSON postMessage protocol (init, load, autosave, save, export, exit, fit). |
| Autosave | Debounced persistence on `autosave` events (only writes when content hash changes). |
| Save & Exit | Uses draw.io's native Save / Exit buttons; performs reliable export → save → acknowledge → return to welcome. |
| Welcome Screen | Friendly landing panel until a diagram is opened or created. |
| Navigation Reliability | Click delegation + queued loads before editor `init` ensures first click always works. |
| Center / Normalize | Multi-pass `fit` + optional normalization of geometry to keep content near origin. |
| Toast Feedback | Lightweight success/error toasts (Alpine.js) for create & normalization actions. |
| Service Layer | `IDiagramStorage` / `DiagramStorageService` encapsulate filename sanitization and file IO. |
| Static Files Setup | Custom MIME mapping so `.drawio` served correctly (XML) + cache busting disabled for live edits. |
| Modular JS | Large inline script refactored into `wwwroot/js/drawio-embed.js` Alpine component (`drawioComponent`). |

## Architecture
```
DrawIoController
  ├─ Lists diagrams (GET /DrawIo/Embedded)
  ├─ Create (POST /DrawIo/Create)
  └─ Save (POST /DrawIo/Save)

DiagramStorageService (IDiagramStorage)
  ├─ ListDiagrams() -> IEnumerable<DiagramInfo>
  ├─ CreateAsync(name)
  └─ SaveAsync(fileName, xml)

Views
  ├─ _Layout.cshtml (base)
  ├─ _Layout.DrawIo.cshtml (adds sidebar)
  └─ DrawIo/DrawIOEmbeded.cshtml (workspace shell)

Client (Alpine + draw.io iframe)
  ├─ drawioComponent(): state, messaging, autosave, load queue
  └─ Toast + Modal UI
```

## Message Flow (Simplified)
1. User clicks diagram link.
2. Component fetches `.drawio` XML.
3. If editor not initialized yet, request queued; else `postMessage { action: 'load' }`.
4. draw.io iframe emits:
   - `init` (we may feed a starter blank)
   - `load` (we trigger multi-pass `fit`)
   - `autosave` (debounced save)
   - `save` (user Save / Save & Exit) → request `export`
   - `export` (XML) → immediate save & `saved` ack
   - `exit` (return to welcome if not waiting on save)

## Normalization / Centering
Some legacy or imported diagrams can have content positioned far from (0,0). The component:
- Detects min shape coordinates on load.
- Shifts all geometry so minimum X/Y ≈ 40 (margin) when outside a 0–40 window.
- Persists the normalized XML automatically.
- Runs several delayed `fit` calls (50ms → 3s) for reliable centering even on large diagrams.

## Folder & File Layout (Excerpt)
```
/wwwroot
  /js
    drawio-embed.js      # Alpine component + message handling
  /testDiagrams          # Native .drawio sources
/Views/DrawIo
  DrawIOEmbeded.cshtml   # Workspace view
/Services
  IDiagramStorage.cs
  DiagramStorageService.cs
/Models
  DiagramInfo.cs
Program.cs               # DI + static files + pipeline
```

## How To Run
1. Install .NET 9 SDK.
2. Restore & build:
   ```bash
   dotnet build
   ```
3. Run:
   ```bash
   dotnet run --project drawiomvc
   ```
4. Navigate to the root (configured to redirect to the embedded workspace). Create or open diagrams from the sidebar.

## Extensibility Ideas
- Rename & Delete operations (UI + service methods).
- Diagram version history (store timestamped snapshots).
- Authentication / per-user diagram folders.
- Export helpers (PNG/SVG/PDF) with server cache.
- Collaborative presence (broadcast selected diagram, lock). 

## Security Notes
- Only JSON messages from the trusted draw.io origin are processed.
- Filenames sanitized (whitelist of characters + enforced `.drawio` extension).
- Service uses a lock to avoid concurrent write collisions.

## Limitations (Current PoC)
- No auth / multi-tenant isolation.
- No rename/delete UI.
- No server-side validation of diagram content beyond basic size/format checks.
- Single-user editing (last write wins).

## Credits
- draw.io (diagrams.net) for the embed editor.
- Alpine.js for minimal reactive UI.
- ASP.NET Core team for the framework.
- [jbs.dev](https://jbs.dev) for the original proof-of-concept initiative and integration direction. 
- Sample diagram inspirations from the open collection at [jgraph/drawio-diagrams](https://github.com/jgraph/drawio-diagrams).

## Author
Created & maintained by [Ryan Mann](https://www.linkedin.com/in/ryan-mann-a372a336/) · [jbs.dev](https://jbs.dev)

## License
Released under the MIT License. See [LICENSE](/LICENSE) for details.

---
This proof of concept is intentionally lean but demonstrates a production-ready direction for integrating rich diagram editing directly into an ASP.NET Core application.
