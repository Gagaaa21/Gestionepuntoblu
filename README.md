# Patient Care Vault

App full-stack (TanStack Start + React 19 + Supabase) originariamente creata
con Lovable. Questo repository è stato reso indipendente da Lovable per
poter essere ospitato su **GitHub** e distribuito su **Vercel**.

## Cosa è cambiato rispetto alla versione Lovable

- `vite.config.ts` non dipende più dal pacchetto `@lovable.dev/vite-tanstack-config`:
  la configurazione (TanStack Start, React, Tailwind v4, alias `@/*`, preset
  di build Nitro) è ora esplicita nel repo.
- Le funzioni AI (lettura PDF trasporti, insight mensili, previsione
  affluenza, traduzione questionari) non chiamano più il gateway AI privato
  di Lovable (`ai.gateway.lovable.dev`). Ora usano un endpoint configurabile
  via variabili d'ambiente, con **OpenRouter** come default.
- Rimossi i riferimenti al dominio `*.lovable.app`, all'editor Lovable
  (auth brokerata via `postMessage`, error reporting verso
  `window.__lovableEvents`) e ai metadati dell'editor (`.lovable/`).
- Aggiunti `vercel.json`, `.env.example` e questo README.

## Cosa devi ancora fare tu

1. **Logo**: il file `logo-sogit.jpg` non era incluso nell'export del
   progetto (era ospitato sui server di Lovable, referenziato con un
   percorso interno `/__l5e/...` che fuori da Lovable non esiste). Carica
   il tuo logo come `public/logo-sogit.jpg` (il codice lo referenzia già
   come `/logo-sogit.jpg`).
2. **Dominio nei tag SEO**: ho sostituito ogni occorrenza di
   `https://gestionepuntoblu.lovable.app` con il placeholder
   `https://your-domain.example` (tag `og:url`, `canonical`,
   `sitemap.xml`, `robots.txt`). Una volta che conosci il dominio Vercel
   definitivo, fai una sostituzione globale di quel placeholder.
3. **Immagine social (`og:image`)**: attualmente punta a `/icon-512.png`
   come segnaposto. Sostituiscila con un'immagine 1200×630 dedicata se
   vuoi un'anteprima social curata.

## Requisiti

- Node.js 20+
- Un progetto Supabase (già esistente, vedi `supabase/config.toml` e
  `supabase/migrations/`)
- (Opzionale) una chiave API di un provider AI compatibile OpenAI, per le
  funzioni intelligenti

## Variabili d'ambiente

Copia `.env.example` in `.env` e compila i valori. Riepilogo:

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Sì | URL del progetto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Sì | Chiave anon/pubblica |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | Sì | Ref del progetto |
| `SUPABASE_SERVICE_ROLE_KEY` | Sì (per le funzioni admin lato server) | Chiave service_role, **mai** esposta al client |
| `AI_GATEWAY_API_KEY` | No | Abilita le funzioni AI. Se assente, l'app funziona comunque: le funzioni AI mostrano un messaggio "non disponibile" invece di rompersi |
| `AI_GATEWAY_URL` | No | Endpoint chat/completions compatibile OpenAI. Default: OpenRouter |
| `AI_GATEWAY_AUTH_HEADER` | No | Nome dell'header di autenticazione. Default: `Authorization` (Bearer) |

Le chiavi Supabase si trovano in **Project Settings → API** nella dashboard
Supabase. Il progetto attuale è collegato a `hboeowanewcsbqsuhoby`
(vedi `supabase/config.toml`); se vuoi usare un progetto Supabase diverso,
aggiorna sia `.env` sia `supabase/config.toml` e applica le migration in
`supabase/migrations/` con `supabase db push` (richiede la Supabase CLI).

### Provider AI

Di default il codice punta a OpenRouter (`https://openrouter.ai/api/v1/chat/completions`)
usando gli stessi id modello già presenti nel codice (es.
`google/gemini-2.5-flash`). Per usare un provider diverso:

- imposta `AI_GATEWAY_URL` sull'endpoint chat/completions di quel provider;
- se il provider richiede modelli con id diversi, aggiornali nei file
  `src/lib/api/ai-gateway.server.ts`, `src/lib/api/transports-ai.server.ts`,
  `src/lib/api/transports.functions.ts` e `src/lib/api/survey-translate.functions.ts`
  (cerca la costante `MODEL`/`MODELS`).

## Sviluppo locale

```bash
npm install
npm run dev
```

L'app parte su `http://localhost:8080`.

## Build di produzione

```bash
npm run build
npm run preview
```

Verifica sempre che `npm run build` completi senza errori **prima** di
collegare il repo a Vercel.

## Deploy su GitHub + Vercel

1. Inizializza il repo e pubblicalo su GitHub:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<tuo-utente>/<tuo-repo>.git
   git push -u origin main
   ```

   Il file `.env` **non** viene incluso (è in `.gitignore`): le variabili
   vanno configurate direttamente su Vercel.

2. Su [vercel.com](https://vercel.com), importa il repository GitHub.

3. Vercel dovrebbe rilevare automaticamente `npm run build` come comando di
   build grazie a `vercel.json` (che disabilita il rilevamento automatico
   del framework "Vite", altrimenti Vercel proverebbe a servire `dist/`
   come sito statico invece di usare l'output SSR generato da Nitro in
   `.vercel/output`).

4. In **Project Settings → Environment Variables**, aggiungi tutte le
   variabili elencate sopra (usa i valori reali, non quelli di esempio).
   Ricorda: `SUPABASE_SERVICE_ROLE_KEY` va aggiunta **solo** come variabile
   server-side su Vercel, mai committata nel repo.

5. Fai il deploy. Se la build fallisce con un errore legato al preset
   Nitro/Vercel, apri `vite.config.ts` e verifica la sezione
   `tanstackStart({ server: { preset: "vercel" } })`: è il punto in cui è
   impostato il target di build per Vercel.

## Macro aree del sito

La sezione "Gestione" (`/gestione`, `/gestione/$areaId`) e il relativo pannello
admin (`AreasAdminPanel`, dentro `/admin`) **sono presenti nel codice** — non
sono stati toccati durante la rimozione delle dipendenze Lovable. Sono però
**guidati dai dati**: le macro aree vivono nella tabella `areas` del tuo
progetto Supabase (stesso progetto già collegato in `.env`), non nel codice.

Se una macro area non compare:

- **Utenti con ruolo `developer`** vedono automaticamente *tutte* le macro
  aree esistenti (bypassano l'assegnazione), oltre alla sezione
  `/security` riservata.
- Gli altri utenti vedono solo le aree a cui sono stati esplicitamente
  assegnati da un admin, in **Admin → Gestisci aree, utenti e permessi**.
- Se il progetto Supabase non ha ancora nessuna riga in `areas`, la lista è
  semplicemente vuota finché un admin non ne crea almeno una dal pannello.

## Utente amministratore/programmatore: Gabriele.Simonovich

È stata aggiunta la migration
`supabase/migrations/20260831120000_grant_gabriele_simonovich_admin_developer.sql`,
che assegna all'utente con username `Gabriele.Simonovich` (case-insensitive)
il livello di permessi più alto previsto dall'app:

- ruolo `admin` **e** ruolo `developer` (il `developer` è il livello
  superiore: sblocca `/security`, la visibilità di tutte le macro aree senza
  assegnazione esplicita, e bypassa le route nascoste);
- tutti i permessi granulari attivi in `user_permissions`, incluse le
  sezioni "Trasporti secondari" e "Servizi sportivi" (che richiedono un
  flag esplicito anche per un admin);
- rimozione di un'eventuale sospensione sull'account.

Per applicarla al tuo progetto Supabase:

```bash
supabase db push
```

oppure, se preferisci non usare la CLI, apri la dashboard Supabase del
progetto → **SQL Editor**, incolla il contenuto del file e premi *Run*.

⚠️ La migration richiede che l'utente `Gabriele.Simonovich` esista già in
`public.profiles` (si sia cioè già registrato o sia già stato creato da un
admin in **Admin → Utenti**). Se non esiste ancora, la migration stampa un
avviso e non applica nulla: crea prima l'utente, poi rilanciala.



- `src/routes/` — pagine e API route (TanStack Router file-based routing)
- `src/lib/api/` — server functions (incluse le funzioni AI)
- `src/integrations/supabase/` — client Supabase (browser e server)
- `supabase/migrations/` — schema del database

## Note

- Il service worker (`public/sw.js`) e il manifest PWA
  (`public/manifest.webmanifest`) non dipendevano da Lovable e sono rimasti
  invariati.
- `bun.lock` è presente perché il progetto è stato sviluppato con Bun; puoi
  continuare a usare `bun install` / `bun run dev`, oppure passare a
  `npm`/`pnpm` cancellando `bun.lock` e generando il lockfile del tuo
  package manager preferito.
