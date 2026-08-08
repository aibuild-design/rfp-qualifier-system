/**
 * Guard for URLs this system will hand to a fetcher.
 *
 * The dashboard's "add a solicitation" form takes a link to a document and
 * passes it to n8n, which fetches it. Without a guard that is a server-side
 * request forgery primitive: point it at http://169.254.169.254/ and n8n
 * retrieves the cloud metadata service — including, on most providers, the
 * credentials attached to the instance. Private ranges, loopback and .internal
 * names are all reachable from wherever the fetcher runs, and none of them can
 * ever hold a public agency's solicitation.
 *
 * SECURITY.md listed this as a known open item. This closes the direct case.
 *
 * What it does NOT close: the hostname is checked here, but the fetch happens
 * in n8n moments later, so a name that resolves publicly now and privately then
 * (DNS rebinding) still gets through. Closing that needs the fetcher to pin the
 * resolved address, which is n8n's side of the wire, not ours. Treat this as
 * raising the bar against a careless or opportunistic URL, not as a proof.
 */

/** Hostnames that are never a public agency's document server. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** Suffixes that only ever name something inside a private network. */
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

type Ipv4 = [number, number, number, number];

function parseIpv4(host: string): Ipv4 | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums as Ipv4;
}

/**
 * Ranges that are not routable on the public internet. Note that the WHATWG URL
 * parser already normalises the obfuscated spellings of an address —
 * http://2130706433/ and http://0x7f.1/ both arrive here as 127.0.0.1 — so this
 * only has to understand dotted decimal.
 */
function isPrivateIpv4([a, b]: Ipv4): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIpv6(host: string): boolean {
  // URL hostnames keep IPv6 literals in brackets.
  const addr = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (addr === "::1" || addr === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true; // fe80::/10 link-local

  // An IPv4 address wearing an IPv6 costume. Both spellings have to be handled:
  // a caller may hand us ::ffff:127.0.0.1 directly, but the URL parser
  // normalises that to the hextet form ::ffff:7f00:1 before we ever see it.
  const dotted = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const v4 = parseIpv4(dotted[1]);
    return v4 ? isPrivateIpv4(v4) : true;
  }
  const hextets = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hextets) {
    const hi = parseInt(hextets[1], 16);
    const lo = parseInt(hextets[2], 16);
    return isPrivateIpv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  }
  return false;
}

/** True when the host is one this system must refuse to fetch. Exported for
 *  the DNS-resolution check, which re-runs it against each resolved address. */
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, ""); // trailing dot = same name
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (h.startsWith("[")) return isPrivateIpv6(h);
  const v4 = parseIpv4(h);
  if (v4) return isPrivateIpv4(v4);
  return false;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validate a user-supplied document link. Messages are written to be read by
 * whoever pasted the URL, not by a security engineer — the person hitting this
 * is almost always someone who pasted a portal login page, not an attacker.
 */
export function checkDocumentUrl(raw: string): UrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "No link given" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That is not a valid link" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The link must start with http:// or https://" };
  }

  // user:pass@host is a classic way to make a URL read as one host while
  // resolving to another, and no agency document link needs it.
  if (url.username || url.password) {
    return { ok: false, error: "Remove the username and password from the link" };
  }

  if (isBlockedHost(url.hostname)) {
    return {
      ok: false,
      error: "That link points inside a private network, so it cannot be fetched",
    };
  }

  return { ok: true, url: url.toString() };
}
