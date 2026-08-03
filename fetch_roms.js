#!/usr/bin/env node
/**
 * fetch_roms.js
 *
 * Multi-site firmware scraper. Scrapes firmware download sites for
 * Oppo, Vivo, Realme, Infinix, Tecno, OnePlus, General Mobile, and Casper.
 * Finds direct download links (Google Drive) for each firmware file and
 * generates per-brand RSS feeds with direct download enclosures.
 *
 * Usage:
 *   node fetch_roms.js                      # scrape all brands
 *   node fetch_roms.js oppo                 # scrape single brand
 *   node fetch_roms.js oppo vivo            # scrape specific brands
 *   node fetch_roms.js --depth 1            # limit pagination depth
 *   node fetch_roms.js --out-dir ./feeds    # output directory
 *
 * Output:
 *   roms_<brand>.json  - structured metadata per brand
 *   rss_<brand>.xml    - RSS feed with direct download links per brand
 *   roms_all.json      - combined metadata
 *   rss_all.xml         - combined RSS feed
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Brand configurations
// ---------------------------------------------------------------------------
const BRANDS = {
  oppo: {
    name: "Oppo",
    site: "oppostockrom.com",
    listUrl: "https://oppostockrom.com",
    listSelector: "device",
    type: "androidmtk-style",
  },
  vivo: {
    name: "Vivo",
    site: "vivofirmware.com",
    listUrl: "https://vivofirmware.com",
    listSelector: "device",
    type: "androidmtk-style",
  },
  realme: {
    name: "Realme",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/realme",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  infinix: {
    name: "Infinix",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/infinix",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tecno: {
    name: "Tecno",
    site: "naijarom.com",
    listUrl: "https://naijarom.com/category/tecno",
    listSelector: "category",
    type: "naijarom-style",
  },
  oneplus: {
    name: "OnePlus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/oneplus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  casper: {
    name: "Casper",
    site: "naijarom.com",
    listUrl: "https://naijarom.com/category/casper",
    listSelector: "category",
    type: "naijarom-style",
  },
  "general-mobile": {
    name: "General Mobile",
    site: "needrom.com (via Wayback Machine)",
    listUrl: "https://web.archive.org/web/2024/https://www.needrom.com/category/others/e-f-g-h/brands-g/general-mobile/",
    listSelector: "category",
    type: "needrom-wayback-style",
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const RATE_LIMIT_MS = 200;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let brands = [];
  let maxDepth = Infinity;
  let outDir = ".";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--depth") {
      const d = parseInt(args[i + 1], 10);
      maxDepth = isNaN(d) ? Infinity : d;
      i++;
    } else if (args[i] === "--out-dir") {
      outDir = args[i + 1];
      i++;
    } else if (!args[i].startsWith("--")) {
      brands.push(args[i].toLowerCase());
    }
  }

  if (brands.length === 0) brands = Object.keys(BRANDS);
  return { brands, maxDepth, outDir };
}

// ---------------------------------------------------------------------------
// HTTP fetch with gzip support and redirect following
// ---------------------------------------------------------------------------
function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 10) {
      return reject(new Error(`Too many redirects: ${url}`));
    }
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
        },
        timeout: 30000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          return resolve(fetchText(next, redirectCount + 1));
        }

        const chunks = [];
        const encoding = res.headers["content-encoding"];
        let stream = res;

        if (encoding === "gzip") {
          const zlib = require("zlib");
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === "deflate") {
          const zlib = require("zlib");
          stream = res.pipe(zlib.createInflate());
        }

        stream.on("data", (c) => chunks.push(c));
        stream.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve({ body, statusCode: res.statusCode, headers: res.headers });
        });
        stream.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Google Drive direct download URL builder
// ---------------------------------------------------------------------------
function buildGDriveDirectUrl(viewUrl) {
  const match = viewUrl.match(/\/file\/d\/([^/]+)/);
  if (match) {
    const fileId = match[1];
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  }
  return viewUrl;
}

// ---------------------------------------------------------------------------
// HTML parsers per site type
// ---------------------------------------------------------------------------

// androidmtk-style: oppostockrom.com, vivofirmware.com
// These sites list devices on a single page, each linking to a device page
function parseAndroidMtkStyleList(html, baseUrl) {
  const devices = [];
  const seen = new Set();

  // Find device links in table rows - these sites use tables with device name + firmware link
  const rowRegex = /<tr[^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>[\s\S]*?<\/tr>/g;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const url = m[1];
    const name = m[2].trim();
    if (name && url && !url.includes("stock-rom") && !url.includes("usb-driver") && !seen.has(url)) {
      seen.add(url);
      devices.push({ url, name });
    }
  }

  // Also try finding links by pattern (device pages on these specific sites)
  const siteDomain = new URL(baseUrl).hostname;
  const linkRegex = new RegExp(
    `href=["'](https?://${siteDomain.replace(/\./g, "\\.")}/(?!category|page|wp-|privacy|refer|favicon|apple-touch|site\\.webmanifest)[^"']+)["']`,
    "g"
  );
  while ((m = linkRegex.exec(html)) !== null) {
    const slug = m[1].split("/").pop();
    // Skip non-device URLs (icons, manifests, etc.)
    if (slug.includes(".") || slug.length < 3) continue;
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      devices.push({ url: m[1], name: slug.replace(/-/g, " ") });
    }
  }

  return devices;
}

// firmwarefile-style: firmwarefile.com
// Lists devices on category pages with pagination
function parseFirmwareFileStyleList(html, baseUrl) {
  const devices = [];
  const seen = new Set();

  const linkRegex = /href=["'](https?:\/\/firmwarefile\.com\/(?!category|page|wp-|privacy|refer|favicon|apple-touch|site\.webmanifest|category-list)[^"'#]+)["']/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      devices.push({ url: m[1], name: m[1].split("/").pop().replace(/-/g, " ") });
    }
  }

  return devices;
}

// naijarom-style: naijarom.com
// Lists devices on category pages
function parseNaijaromStyleList(html, baseUrl) {
  const devices = [];
  const seen = new Set();

  const linkRegex = /href=["'](https?:\/\/naijarom\.com\/(?!category|page|wp-|privacy|refer|favicon|apple-touch|site\.webmanifest|advance-search)[^"'#]+)["']/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      devices.push({ url: m[1], name: m[1].split("/").pop().replace(/-/g, " ") });
    }
  }

  return devices;
}

// needrom-style: needrom.com
function parseNeedromStyleList(html, baseUrl) {
  const devices = [];
  const seen = new Set();

  const linkRegex = /href=["'](https?:\/\/www\.needrom\.com\/download\/[^"']+)["']/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const url = m[1].replace(/\/$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      devices.push({ url, name: url.split("/").pop().replace(/-/g, " ") });
    }
  }

  return devices;
}

// needrom-wayback-style: needrom.com via Wayback Machine (Cloudflare blocks direct access)
function parseNeedromWaybackStyleList(html, baseUrl) {
  const devices = [];
  const seen = new Set();

  // Wayback Machine wraps needrom URLs - extract the original needrom download URLs
  const linkRegex = /https?:\/\/web\.archive\.org\/web\/\d+\/(https?:\/\/www\.needrom\.com\/download\/[^"'\s<>]+)/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const originalUrl = m[1].replace(/\/$/, "");
    if (!seen.has(originalUrl)) {
      seen.add(originalUrl);
      devices.push({ url: originalUrl, name: originalUrl.split("/").pop().replace(/-/g, " ") });
    }
  }

  return devices;
}

// Parse device page for download links (common across all sites)
function parseDevicePage(html, deviceUrl) {
  const result = {
    name: "",
    googleDriveUrl: "",
    directDownloadUrl: "",
    fileSize: "",
    date: "",
    firmwareVersion: "",
    description: "",
  };

  // Extract title/name
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    result.name = titleMatch[1]
      .replace(/\s*[|\-–]\s*(Firmware|Stock ROM|Flash File|Firmware File|Naija ROM|FirmwareFile|Vivo Firmware|Oppo Stock ROM).*$/i, "")
      .replace(/\s*Download\s*/i, "")
      .trim();
  }

  // Extract Google Drive link (Mirror 1 - Free)
  const gdriveMatch = html.match(
    /https?:\/\/drive\.google\.com\/(?:file\/d\/[^"'\s<>]+|uc\?[^"'\s<>]+)/
  );
  if (gdriveMatch) {
    result.googleDriveUrl = gdriveMatch[0];
    result.directDownloadUrl = buildGDriveDirectUrl(gdriveMatch[0]);
  }

  // Extract file size - look for patterns like "3.82 GB" or "927.10 MB" near "size" label
  const sizeMatch = html.match(/(?:File\s*Size|Filesize)\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB))/i);
  if (sizeMatch) result.fileSize = sizeMatch[1].trim();
  if (!result.fileSize) {
    const sizeMatch2 = html.match(/(\d+(?:\.\d+)?\s*(?:KB|MB|GB|TB))/i);
    if (sizeMatch2) result.fileSize = sizeMatch2[1].trim();
  }

  // Extract date
  const dateMatch = html.match(
    /(?:Date|Published|Updated|Posted)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}[^<\n]*)/i
  );
  if (dateMatch) result.date = dateMatch[1].trim();

  // Extract description (meta description)
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (descMatch) result.description = descMatch[1].trim();

  // Extract firmware version from page content
  const versionMatch = html.match(/(?:Version|Build)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9._\-]{3,30})/);
  if (versionMatch) result.firmwareVersion = versionMatch[1].trim();

  // Fallback: some sites (e.g. oppostockrom.com) never print an explicit
  // "Version"/"Build" label — the version is only embedded inside the
  // firmware "File Name" line, e.g.
  //   File Name: Oppo_A5x_PKW110_MT6835_Domestic_11_15.0.1.701CN01_250806_MXML.zip
  // Pull the dotted version-like token (3+ numeric groups, optional
  // alphanumeric suffix) out of that line instead.
  if (!result.firmwareVersion) {
    const fileNameLineMatch = html.match(/File\s*Name[^:]*:\s*([^\n<]+)/i);
    if (fileNameLineMatch) {
      const verFromFileName = fileNameLineMatch[1].match(/(?:^|[_\s])(\d+(?:\.\d+){2,}[A-Za-z0-9]*)(?:[_\s]|$)/);
      if (verFromFileName) result.firmwareVersion = verFromFileName[1].trim();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Scraper engine
// ---------------------------------------------------------------------------
async function scrapeBrand(brandKey, maxDepth) {
  const brand = BRANDS[brandKey];
  console.log(`\n${"=".repeat(60)}`);
  console.log(` Scraping: ${brand.name} (${brand.site})`);
  console.log(`${"=".repeat(60)}`);

  const allDevices = [];
  const allFiles = [];

  try {
    // Step 1: Fetch device list
    console.log(`Fetching device list from ${brand.listUrl}...`);
    const { body } = await fetchText(brand.listUrl);
    await sleep(RATE_LIMIT_MS);

    let devices = [];
    switch (brand.type) {
      case "androidmtk-style":
        devices = parseAndroidMtkStyleList(body, brand.listUrl);
        break;
      case "firmwarefile-style":
        devices = parseFirmwareFileStyleList(body, brand.listUrl);
        break;
      case "naijarom-style":
        devices = parseNaijaromStyleList(body, brand.listUrl);
        break;
      case "needrom-style":
        devices = parseNeedromStyleList(body, brand.listUrl);
        break;
      case "needrom-wayback-style":
        devices = parseNeedromWaybackStyleList(body, brand.listUrl);
        break;
    }

    console.log(`Found ${devices.length} devices`);

    // Handle pagination for firmwarefile and naijarom
    if (brand.type === "firmwarefile-style" || brand.type === "naijarom-style") {
      const pageMatch = body.match(/href=["']([^"']*\/page\/2[^"']*)["']/);
      if (pageMatch && maxDepth > 1) {
        let pageUrl = pageMatch[1];
        let pageNum = 2;
        while (pageUrl && pageNum <= maxDepth) {
          console.log(`  Fetching page ${pageNum}...`);
          try {
            const { body: pageBody } = await fetchText(pageUrl);
            await sleep(RATE_LIMIT_MS);
            let pageDevices = [];
            if (brand.type === "firmwarefile-style") {
              pageDevices = parseFirmwareFileStyleList(pageBody, pageUrl);
            } else {
              pageDevices = parseNaijaromStyleList(pageBody, pageUrl);
            }
            if (pageDevices.length === 0) break;
            devices.push(...pageDevices);
            console.log(`    +${pageDevices.length} devices (total: ${devices.length})`);
            const nextMatch = pageBody.match(/href=["']([^"']*\/page\/(\d+)[^"']*)["']/g);
            pageUrl = null;
            if (nextMatch) {
              for (const nm of nextMatch) {
                const pm = nm.match(/\/page\/(\d+)/);
                if (pm && parseInt(pm[1]) === pageNum + 1) {
                  const urlMatch = nm.match(/href=["']([^"']+)["']/);
                  if (urlMatch) pageUrl = urlMatch[1];
                }
              }
            }
            pageNum++;
          } catch (e) {
            console.log(`    Page ${pageNum} failed: ${e.message}`);
            break;
          }
        }
      }
    }

    // Step 2: Visit each device page and extract download links
    const limit = maxDepth === Infinity ? devices.length : Math.min(devices.length, maxDepth);
    console.log(`Scraping ${limit} device pages...`);

    for (let i = 0; i < limit; i++) {
      const device = devices[i];
      process.stdout.write(`  [${i + 1}/${limit}] ${device.name}... `);

      try {
        // For needrom-wayback-style, fetch device pages via Wayback Machine (Cloudflare blocks direct access)
        const fetchUrl = brand.type === "needrom-wayback-style"
          ? `https://web.archive.org/web/2024/${device.url}`
          : device.url;
        const { body: deviceHtml } = await fetchText(fetchUrl);
        await sleep(RATE_LIMIT_MS);

        const info = parseDevicePage(deviceHtml, device.url);
        if (info.directDownloadUrl) {
          allFiles.push({
            brand: brand.name,
            deviceName: info.name || device.name,
            deviceUrl: device.url,
            googleDriveUrl: info.googleDriveUrl,
            directDownloadUrl: info.directDownloadUrl,
            fileSize: info.fileSize || "Unknown",
            date: info.date || "Unknown",
            firmwareVersion: info.firmwareVersion || "",
            description: info.description || "",
          });
          console.log(`OK - ${info.directDownloadUrl.substring(0, 80)}...`);
        } else if (brand.type === "needrom-wayback-style") {
          // Needrom requires login - use the device page URL as the link
          allFiles.push({
            brand: brand.name,
            deviceName: info.name || device.name,
            deviceUrl: device.url,
            googleDriveUrl: "",
            directDownloadUrl: device.url,
            fileSize: info.fileSize || "Unknown",
            date: info.date || "Unknown",
            firmwareVersion: info.firmwareVersion || "",
            description: info.description || "Requires needrom.com login to download",
          });
          console.log(`OK (needrom login required) - ${device.url.substring(0, 80)}...`);
        } else {
          console.log("NO DOWNLOAD LINK");
        }
      } catch (e) {
        console.log(`ERROR: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`Failed to scrape ${brand.name}: ${e.message}`);
  }

  console.log(`\n${brand.name}: ${allFiles.length} files with direct download links`);
  return { brand: brandKey, brandName: brand.name, files: allFiles };
}

// ---------------------------------------------------------------------------
// RSS generator
// ---------------------------------------------------------------------------
function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateRss(brandName, files) {
  const now = new Date().toUTCString();
  let items = "";

  for (const f of files) {
    const pubDate =
      f.date && f.date !== "Unknown" ? new Date(f.date).toUTCString() : now;

    items += `    <item>
      <title>${escapeXml(f.deviceName)}</title>
      <link>${escapeXml(f.directDownloadUrl)}</link>
      <guid isPermaLink="false">${escapeXml(f.brand)}-${escapeXml(f.deviceUrl.split("/").pop())}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[
        Device: ${escapeXml(f.deviceName)}<br/>
        Brand: ${escapeXml(f.brand)}<br/>
        Size: ${escapeXml(f.fileSize)}<br/>
        Date: ${escapeXml(f.date)}<br/>
        ${f.firmwareVersion ? "Version: " + escapeXml(f.firmwareVersion) + "<br/>" : ""}
        <a href="${escapeXml(f.directDownloadUrl)}">Direct Download (Google Drive)</a><br/>
        ${f.googleDriveUrl ? `<a href="${escapeXml(f.googleDriveUrl)}">Open in Google Drive</a><br/>` : ""}
        <a href="${escapeXml(f.deviceUrl)}">Source Page</a>
      ]]></description>
      <enclosure url="${escapeXml(f.directDownloadUrl)}" type="application/zip" />
    </item>\n`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="firmwaredrive.com" rel="self" type="application/rss+xml"/>
    <generator>fetch_roms.js</generator>
    <title>${escapeXml(brandName)} Firmware - Direct Downloads</title>
    <link>https://firmwaredrive.com</link>
    <description>Direct download links for ${escapeXml(brandName)} firmware files. Click any link to download directly without visiting the site.</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}  </channel>
</rss>
`;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { brands, maxDepth, outDir } = parseArgs();

  console.log(`\n${"=".repeat(60)}`);
  console.log(` Multi-Site Firmware Scraper`);
  console.log(`${"=".repeat(60)}`);
  console.log(` Brands: ${brands.join(", ")}`);
  console.log(` Max depth: ${maxDepth === Infinity ? "unlimited" : maxDepth}`);
  console.log(` Output dir: ${outDir}`);
  console.log(`${"=".repeat(60)}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const allResults = [];

  for (const brandKey of brands) {
    if (!BRANDS[brandKey]) {
      console.log(`Unknown brand: ${brandKey}`);
      console.log(`Available: ${Object.keys(BRANDS).join(", ")}`);
      continue;
    }

    const result = await scrapeBrand(brandKey, maxDepth);
    allResults.push(result);

    // Write per-brand JSON
    const jsonPath = path.join(outDir, `roms_${brandKey}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    console.log(`Written: ${jsonPath}`);

    // Write per-brand RSS
    const rssXml = generateRss(result.brandName, result.files);
    const rssPath = path.join(outDir, `rss_${brandKey}.xml`);
    fs.writeFileSync(rssPath, rssXml);
    console.log(`Written: ${rssPath}`);
  }

  // Write combined JSON
  const combinedJson = path.join(outDir, "roms_all.json");
  fs.writeFileSync(combinedJson, JSON.stringify(allResults, null, 2));
  console.log(`\nWritten combined: ${combinedJson}`);

  // Write combined RSS
  const allFiles = allResults.flatMap((r) => r.files);
  const combinedRss = generateRss("All Brands", allFiles);
  const combinedRssPath = path.join(outDir, "rss_all.xml");
  fs.writeFileSync(combinedRssPath, combinedRss);
  console.log(`Written combined: ${combinedRssPath}`);

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(` Summary`);
  console.log(`${"=".repeat(60)}`);
  for (const r of allResults) {
    console.log(`  ${r.brandName.padEnd(20)} ${r.files.length} files`);
  }
  console.log(`  ${"Total".padEnd(20)} ${allFiles.length} files`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
