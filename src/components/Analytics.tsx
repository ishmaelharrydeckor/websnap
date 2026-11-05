import Script from "next/script";
import { analyticsConfig } from "@/lib/analytics/config";

/**
 * Loads the configured analytics script, unless the visitor has asked not to be tracked
 * (Do Not Track or Global Privacy Control). Renders nothing when analytics isn't configured.
 */
export function Analytics() {
  const config = analyticsConfig();
  if (!config) return null;
  // The config comes from server settings. Escaping "<" keeps the inline script safe even so.
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  const loader = `(function(c){var n=navigator;if(n.doNotTrack==="1"||window.doNotTrack==="1"||n.globalPrivacyControl)return;var s=document.createElement("script");s.defer=true;s.src=c.src;for(var k in c.attrs)s.setAttribute(k,c.attrs[k]);document.head.appendChild(s);})(${json});`;
  return (
    <Script id="analytics-loader" strategy="afterInteractive">
      {loader}
    </Script>
  );
}
