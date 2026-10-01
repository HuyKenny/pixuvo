/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    adminEmail?: string;
    cfContext?: { waitUntil(p: Promise<unknown>): void };
  }
}
interface ImportMetaEnv {
  readonly PUBLIC_NOINDEX?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_CONSENT_CATEGORIES?: string;
  readonly PUBLIC_ANALYTICS_SRC?: string;
  readonly PUBLIC_ADS_PROVIDER?: string;
}
declare const __BUILD_ID__: string;
