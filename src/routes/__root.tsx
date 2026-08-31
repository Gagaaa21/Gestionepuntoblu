import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";
import { initOfflineSync } from "../lib/offline-queue";
import { OfflineBanner } from "../components/OfflineBanner";
import { SiteEditorProvider } from "../lib/site-editor/context";

import { AutoSignOutOnDelete } from "../components/AutoSignOutOnDelete";
import { ThemeProvider } from "../lib/theme";
import { JobTitlesProvider } from "../lib/job-titles";
import { AnnouncementModal } from "../components/AnnouncementModal";
import { CommandPaletteLoader } from "../components/CommandPaletteLoader";
import { InstallAppPrompt } from "../components/InstallAppPrompt";
import { DemoModeProvider } from "../lib/demo-mode";
import { DemoModeBanner } from "../components/DemoModeBanner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Archivio clinico Punto Blu" },
      { name: "description", content: "Archivio clinico Punto Blu: gestione sicura dei pazienti, degli interventi e delle relative date con accesso autenticato." },
      { name: "author", content: "Punto Blu" },
      { property: "og:title", content: "Archivio clinico Punto Blu" },
      { property: "og:description", content: "Archivio clinico Punto Blu: gestione sicura dei pazienti, degli interventi e delle relative date con accesso autenticato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#12294d" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "S.O.G.IT." },

      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Archivio clinico Punto Blu" },
      { name: "twitter:description", content: "Archivio clinico Punto Blu: gestione sicura dei pazienti, degli interventi e delle relative date con accesso autenticato." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ddfbe438-b9f7-475b-baf8-7929b8cb20aa/id-preview-8fa9241c--28e52715-9f31-40fc-adb1-cfad2108499f.lovable.app-1781009394640.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ddfbe438-b9f7-475b-baf8-7929b8cb20aa/id-preview-8fa9241c--28e52715-9f31-40fc-adb1-cfad2108499f.lovable.app-1781009394640.png" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/__l5e/assets-v1/2c04b97e-de66-4754-bbc0-d93d3a67f2ce/logo-sogit.jpg" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },

      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => { initOfflineSync(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <JobTitlesProvider>
          <SiteEditorProvider>
            <DemoModeProvider>
            <DemoModeBanner />
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            <OfflineBanner />
            <AutoSignOutOnDelete />
            
            <AnnouncementModal />
            <Toaster position="top-center" richColors closeButton expand />
            <CommandPaletteLoader />
            <InstallAppPrompt />
            </DemoModeProvider>
          </SiteEditorProvider>
        </JobTitlesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
