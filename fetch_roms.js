const axios = require('axios');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
});

const args = process.argv.slice(2);
let MAX_ITEMS = 50;
let FEED_DIR = path.join(__dirname, 'feed');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--depth' && args[i + 1]) {
    MAX_ITEMS = parseInt(args[i + 1], 10) || 50;
    i++;
  }
  if (args[i] === '--out-dir' && args[i + 1]) {
    FEED_DIR = path.resolve(args[i + 1]);
    i++;
  }
}

if (!fs.existsSync(FEED_DIR)) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
}

const SOURCES = [
  {
    name: 'Oppo USB Driver',
    slug: 'oppo-usb-driver',
    brand: 'Oppo',
    type: 'rss',
    feedUrl: 'https://oppousbdriver.com/feed/',
    pageUrl: 'https://oppousbdriver.com/',
    directLink: 'https://oppousbdriver.com/wp-content/uploads/Oppo-USB-Driver-Setup-V4.0.1.6.zip',
    description: 'Official Oppo USB Driver for Windows - Direct Download',
  },
  {
    name: 'Xiaomi Engineer Rom',
    slug: 'xiaomi-engineer-rom',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-engineer-rom/',
    description: 'Xiaomi Engineer Rom (ENG Rom) - Direct Download Links',
    linkSelector: 'table a[href*="/download/"]',
  },
  {
    name: 'Huawei Firmware',
    slug: 'huawei-firmware',
    brand: 'Huawei',
    type: 'rss',
    feedUrl: 'https://firmwarefile.com/category/huawei/feed/',
    pageUrl: 'https://firmwarefile.com/category/huawei',
    description: 'Huawei Stock Firmware ROM (Flash File) - Direct Download Links',
  },
  {
    name: 'SP Flash Tool',
    slug: 'sp-flash-tool',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/sp-flash-tool/',
    description: 'SP Flash Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/sp-flash-tool"]',
  },
  {
    name: 'Anakart Devre Semalari',
    slug: 'anakart-devre-semalari',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-anakart-devre-semalari/',
    description: 'Xiaomi Anakart Devre Semalari - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'Xiaomi Recovery',
    slug: 'xiaomi-recovery',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-recovery/',
    description: 'Xiaomi Recovery (TWRP) - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'SP Maui Meta Tool',
    slug: 'sp-maui-meta-tool',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/sp-maui-meta-tool/',
    description: 'SP Maui Meta Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/mauimeta"]',
  },
  {
    name: 'Anakart Direnc Degerleri',
    slug: 'anakart-direnc-degerleri',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-anakart-direnc-degerleri-ve-yerleri/',
    description: 'Xiaomi Anakart Direnc Degerleri ve Yerleri - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'ModemMeta Tool',
    slug: 'modemmeta-tool',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/modemmeta-tool-all-versions/',
    description: 'ModemMeta Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/modemmeta"]',
  },
  {
    name: 'Redmi POCO EDL Noktalari',
    slug: 'redmi-poco-edl-noktalari',
    brand: 'Xiaomi',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/tum-xiaomi-mi-redmi-poco-edl-noktalari/',
    description: 'Tum Xiaomi Mi Redmi POCO EDL Noktalari - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
];

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(date) {
  if (!date) return new Date().toUTCString();
  try {
    return new Date(date).toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

function makeGuid(brand, title) {
  const slug = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${brand}-${slug}`;
}

function convertGdriveLink(url) {
  if (!url) return null;
  // Convert https://drive.google.com/file/d/XXX/view?usp=sharing
  // to https://drive.usercontent.google.com/download?id=XXX&export=download&confirm=t
  const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&confirm=t`;
  }
  return url;
}

function extractGdriveId(url) {
  if (!url) return null;
  const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 5,
      });
      return response.data;
    } catch (error) {
      console.error(`  Attempt ${i + 1}/${retries} failed for ${url}: ${error.message}`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

function extractMetadata($, source) {
  const meta = { size: '', version: '', date: '', brand: source.brand || '' };

  // Try table rows
  $('table tr').each((i, row) => {
    const cells = $(row).find('td, th').map((j, c) => $(c).text().trim()).get();
    if (cells.length >= 2) {
      const key = cells[0].toLowerCase();
      const val = cells[1];
      if (key.includes('size')) meta.size = val;
      if (key.includes('version')) meta.version = val;
      if (key.includes('date')) meta.date = val;
      if (key.includes('brand') || key.includes('developer')) meta.brand = val;
    }
  });

  // Try paragraph/strong/b elements that look like "Size: 6.86 GB"
  if (!meta.size) {
    $('p, strong, b, li, td, th').each((i, el) => {
      const text = $(el).text().trim();
      const m = text.match(/(?:Size|File Size)\s*:?\s*([\d.]+\s*(?:GB|MB|KB))/i);
      if (m) { meta.size = m[1].trim(); return false; }
    });
  }
  if (!meta.version) {
    $('p, strong, b, li, td, th').each((i, el) => {
      const text = $(el).text().trim();
      const m = text.match(/Version\s*:?\s*([A-Za-z0-9._-]+)/i);
      if (m && !m[1].match(/^\d+\.\d+\.\d+\.\d+\.\d+\.\d+/)) { meta.version = m[1].trim(); return false; }
    });
  }

  return meta;
}

async function resolveDirectDownload(pageUrl, source) {
  try {
    const html = await fetchWithRetry(pageUrl);
    const $ = cheerio.load(html);
    const meta = extractMetadata($, source);

    // WordPress Download Manager plugin: ?wpdmdl=XXXX
    const wpdmdlLink = $('a[href*="?wpdmdl="]').first().attr('href');
    if (wpdmdlLink) {
      return { directLink: wpdmdlLink.replace(/&amp;/g, '&'), openLink: null, meta };
    }

    // Google Drive links (convert to direct download)
    const gdriveLink = $('a[href*="drive.google.com"]').first().attr('href');
    if (gdriveLink) {
      const gdriveId = extractGdriveId(gdriveLink);
      const directLink = convertGdriveLink(gdriveLink);
      return { directLink, openLink: gdriveLink.replace(/&amp;/g, '&'), meta, gdriveId };
    }

    // Direct .zip/.rar links
    const directFile = $('a[href$=".zip"], a[href$=".rar"]').first().attr('href');
    if (directFile) {
      return { directLink: directFile.replace(/&amp;/g, '&'), openLink: null, meta };
    }

    // FirmwareDrive links
    const firmwareLink = $('a[href*="firmwaredrive.com"]').first().attr('href');
    if (firmwareLink) {
      return { directLink: firmwareLink.replace(/&amp;/g, '&'), openLink: null, meta };
    }

    return { directLink: null, openLink: null, meta };
  } catch (error) {
    console.error(`  Failed to resolve direct download from ${pageUrl}: ${error.message}`);
    return { directLink: null, openLink: null, meta: {} };
  }
}

async function resolveFirmwareFileDirectDownload(pageUrl, source) {
  try {
    const html = await fetchWithRetry(pageUrl);
    const $ = cheerio.load(html);
    const meta = extractMetadata($, source);

    // Google Drive links - class "zip-one" is the free mirror
    const gdriveLink = $('a.zip-one[href*="drive.google.com"]').first().attr('href') ||
                       $('a[href*="drive.google.com"]').first().attr('href');
    if (gdriveLink) {
      const gdriveId = extractGdriveId(gdriveLink);
      const directLink = convertGdriveLink(gdriveLink);
      return { directLink, openLink: gdriveLink.replace(/&amp;/g, '&'), meta, gdriveId };
    }

    // FirmwareDrive links
    const firmwareLink = $('a[href*="firmwaredrive.com"]').first().attr('href');
    if (firmwareLink) {
      return { directLink: firmwareLink.replace(/&amp;/g, '&'), openLink: null, meta };
    }

    // Direct .zip links
    const directFile = $('a[href$=".zip"], a[href$=".rar"]').first().attr('href');
    if (directFile) {
      return { directLink: directFile.replace(/&amp;/g, '&'), openLink: null, meta };
    }

    return { directLink: null, openLink: null, meta };
  } catch (error) {
    console.error(`  Failed to resolve direct download from ${pageUrl}: ${error.message}`);
    return { directLink: null, openLink: null, meta: {} };
  }
}

async function scrapeRssSource(source) {
  console.log(`\n[${source.name}] Fetching RSS feed: ${source.feedUrl}`);
  const items = [];

  try {
    const feed = await parser.parseURL(source.feedUrl);

    if (!feed.items || feed.items.length === 0) {
      if (source.directLink) {
        items.push({
          title: source.name,
          sourceUrl: source.directLink,
          directLink: source.directLink,
          openLink: null,
          pubDate: new Date().toUTCString(),
          description: source.description,
          meta: { brand: source.brand || '' },
        });
      }
      return items;
    }

    for (const item of feed.items.slice(0, MAX_ITEMS)) {
      let result = { directLink: null, openLink: null, meta: {} };

      if (source.slug === 'huawei-firmware') {
        result = await resolveFirmwareFileDirectDownload(item.link, source);
      } else if (source.directLink && feed.items.length === 1) {
        result.directLink = source.directLink;
      } else if (source.directLink) {
        result.directLink = source.directLink;
      } else {
        result = await resolveDirectDownload(item.link, source);
      }

      items.push({
        title: item.title || source.name,
        sourceUrl: item.link,
        directLink: result.directLink || item.link,
        openLink: result.openLink,
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        description: item.contentSnippet || item.title || source.description,
        meta: result.meta || {},
      });
    }
  } catch (error) {
    console.error(`  RSS fetch failed: ${error.message}`);
    if (source.directLink) {
      items.push({
        title: source.name,
        sourceUrl: source.directLink,
        directLink: source.directLink,
        openLink: null,
        pubDate: new Date().toUTCString(),
        description: source.description,
        meta: { brand: source.brand || '' },
      });
    }
  }

  return items;
}

async function scrapePageSource(source) {
  console.log(`\n[${source.name}] Scraping page: ${source.pageUrl}`);
  const items = [];

  try {
    const html = await fetchWithRetry(source.pageUrl);
    const $ = cheerio.load(html);

    const downloadLinks = new Set();
    $('a[href*="/download/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('huiye-download-tool') && !href.includes('#')) {
        const cleanHref = href.split(' rel=')[0].split(" rel='")[0].split(' class=')[0].trim();
        if (cleanHref) downloadLinks.add(cleanHref);
      }
    });

    if (source.linkSelector) {
      $(source.linkSelector).each((i, el) => {
        const href = $(el).attr('href');
        if (href && !href.includes('huiye-download-tool') && !href.includes('#')) {
          const cleanHref = href.split(' rel=')[0].split(" rel='")[0].split(' class=')[0].trim();
          if (cleanHref) downloadLinks.add(cleanHref);
        }
      });
    }

    // Image-based pages (schematics, EDL points, resistor values)
    if (source.slug === 'anakart-devre-semalari' || source.slug === 'anakart-direnc-degerleri' || source.slug === 'redmi-poco-edl-noktalari') {
      $('img').each((i, el) => {
        let src = $(el).attr('src') || '';
        const dataSrc = $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
        if (dataSrc) src = dataSrc;
        if (src && src.includes('wp-content/uploads') &&
            !src.includes('cropped-unlock') &&
            !src.includes('favicon') &&
            !src.includes('logo') &&
            !src.includes('screenshot-300x') &&
            !src.includes('download.png')) {
          let fullSrc = src.replace(/-\d+x\d+\./, '.');
          fullSrc = fullSrc.replace(/-1\.(png|jpg|jpeg|webp)$/i, '.$1');
          downloadLinks.add(fullSrc);
        }
      });
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.match(/\.(png|jpg|jpeg|webp|gif)$/i) &&
            href.includes('wp-content/uploads') &&
            !href.includes('cropped-unlock')) {
          downloadLinks.add(href);
        }
      });
    }

    console.log(`  Found ${downloadLinks.size} download links`);

    let count = 0;
    for (const dlPageUrl of downloadLinks) {
      if (count >= MAX_ITEMS) break;

      let title = '';
      let directLink = null;
      let openLink = null;
      let meta = {};
      let sourceUrl = '';

      if (dlPageUrl.includes('/download/')) {
        const fullUrl = dlPageUrl.startsWith('http') ? dlPageUrl : `https://xiaomitools.com${dlPageUrl}`;
        sourceUrl = fullUrl;
        const slug = fullUrl.split('/download/')[1]?.replace(/\/$/, '') || '';
        title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        const result = await resolveDirectDownload(fullUrl, source);
        directLink = result.directLink;
        openLink = result.openLink;
        meta = result.meta;

        if (directLink) {
          items.push({ title, sourceUrl, directLink, openLink, pubDate: new Date().toUTCString(), description: `${title} - Direct Download`, meta });
          count++;
        }
      } else if (dlPageUrl.includes('wp-content/uploads')) {
        const fullUrl = dlPageUrl.startsWith('http') ? dlPageUrl : `https://xiaomitools.com${dlPageUrl}`;
        sourceUrl = fullUrl;
        directLink = fullUrl;
        const filename = fullUrl.split('/').pop().split('-').slice(0, -1).join('-') || fullUrl.split('/').pop();
        title = filename.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '').replace(/-/g, ' ');

        items.push({ title, sourceUrl, directLink, openLink: null, pubDate: new Date().toUTCString(), description: `${title} - Direct Download`, meta: { brand: source.brand || '' } });
        count++;
      }

      if (count % 5 === 0 && count > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error(`  Page scrape failed: ${error.message}`);
  }

  return items;
}

async function scrapeOppoDriver(source) {
  console.log(`\n[${source.name}] Fetching from: ${source.pageUrl}`);
  const items = [];

  try {
    const html = await fetchWithRetry(source.pageUrl);
    const $ = cheerio.load(html);
    const meta = extractMetadata($, source);

    let zipLink = $('a[href$=".zip"]').first().attr('href');
    if (!zipLink) zipLink = $('[href$=".zip"]').first().attr('href');
    if (!zipLink) {
      const htmlStr = $.html();
      const zipMatch = htmlStr.match(/https?:\/\/[^\s"'<>]+\.zip/i);
      if (zipMatch) zipLink = zipMatch[0];
    }
    if (!zipLink && source.directLink) zipLink = source.directLink;

    if (zipLink) {
      const versionMatch = zipLink.match(/V([\d.]+)/);
      const version = versionMatch ? versionMatch[1] : '';
      items.push({
        title: `Oppo USB Driver ${version ? 'V' + version : 'Latest'}`,
        sourceUrl: source.pageUrl,
        directLink: zipLink,
        openLink: null,
        pubDate: new Date().toUTCString(),
        description: source.description,
        meta: { ...meta, brand: 'Oppo', version },
      });
    }

    try {
      const feed = await parser.parseURL(source.feedUrl);
      for (const item of feed.items.slice(0, 20)) {
        try {
          const itemHtml = await fetchWithRetry(item.link);
          const $item = cheerio.load(itemHtml);
          const itemMeta = extractMetadata($item, source);
          let directZip = $item('a[href$=".zip"]').first().attr('href');
          if (!directZip) directZip = $item('[href$=".zip"]').first().attr('href');
          if (!directZip) {
            const itemHtmlStr = $item.html();
            const zipMatch = itemHtmlStr.match(/https?:\/\/[^\s"'<>]+\.zip/i);
            if (zipMatch) directZip = zipMatch[0];
          }

          items.push({
            title: item.title || source.name,
            sourceUrl: item.link,
            directLink: directZip || source.directLink || item.link,
            openLink: null,
            pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
            description: item.contentSnippet || item.title || source.description,
            meta: itemMeta,
          });
        } catch (itemError) {
          console.error(`  Failed to fetch item page ${item.link}: ${itemError.message}`);
        }
      }
    } catch (feedError) {
      console.error(`  RSS feed fetch failed: ${feedError.message}`);
    }
  } catch (error) {
    console.error(`  Oppo driver fetch failed: ${error.message}`);
    if (source.directLink) {
      items.push({
        title: source.name,
        sourceUrl: source.pageUrl,
        directLink: source.directLink,
        openLink: null,
        pubDate: new Date().toUTCString(),
        description: source.description,
        meta: { brand: 'Oppo' },
      });
    }
  }

  return items;
}

function buildDescription(item, source) {
  const m = item.meta || {};
  const lines = [];
  lines.push(`Device: ${item.title}`);
  if (m.brand) lines.push(`Brand: ${m.brand}`);
  if (m.size) lines.push(`Size: ${m.size}`);
  if (m.date) lines.push(`Date: ${m.date}`);
  if (m.version) lines.push(`Version: ${m.version}`);

  const dl = item.directLink || item.sourceUrl;
  const isGdrive = dl.includes('drive.usercontent.google.com') || dl.includes('drive.google.com');
  lines.push(`<a href="${escapeXml(dl)}">Direct Download (${isGdrive ? 'Google Drive' : 'Link'})</a>`);

  if (item.openLink) {
    lines.push(`<a href="${escapeXml(item.openLink)}">Open in Google Drive</a>`);
  } else if (isGdrive) {
    const gdriveId = extractGdriveId(dl);
    if (gdriveId) {
      lines.push(`<a href="https://drive.google.com/file/d/${gdriveId}/view?usp=sharing">Open in Google Drive</a>`);
    }
  }

  if (item.sourceUrl && item.sourceUrl !== dl) {
    lines.push(`<a href="${escapeXml(item.sourceUrl)}">Source Page</a>`);
  }

  return lines.join('<br/>');
}

function generateFeedXml(source, items) {
  const now = new Date().toUTCString();

  let itemsXml = '';
  for (const item of items) {
    const dl = item.directLink || item.sourceUrl;
    const desc = buildDescription(item, source);
    const guid = makeGuid(source.brand, item.title);
    const enclosureType = dl.match(/\.(zip|rar)$/i) ? 'application/zip' : 'application/octet-stream';

    itemsXml += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(dl)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${formatDate(item.pubDate)}</pubDate>
      <description><![CDATA[
        ${desc}
      ]]></description>
      <enclosure url="${escapeXml(dl)}" type="${enclosureType}" />
    </item>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${escapeXml(source.pageUrl || source.feedUrl)}" rel="self" type="application/rss+xml"/>
    <generator>fetch_roms.js</generator>
    <title>${escapeXml(source.name)} - Direct Downloads</title>
    <link>${escapeXml(source.pageUrl || source.feedUrl)}</link>
    <description>${escapeXml(source.description)}</description>
    <language>tr</language>
    <lastBuildDate>${now}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;
}

function generateCombinedFeedXml(allItems) {
  const now = new Date().toUTCString();

  let itemsXml = '';
  for (const item of allItems) {
    const dl = item.directLink || item.sourceUrl;
    const source = { name: item.sourceName, brand: item.brand };
    const desc = buildDescription(item, source);
    const guid = makeGuid(item.brand || item.sourceName, item.title);
    const enclosureType = dl.match(/\.(zip|rar)$/i) ? 'application/zip' : 'application/octet-stream';

    itemsXml += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(dl)}</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${formatDate(item.pubDate)}</pubDate>
      <description><![CDATA[
        ${desc}
      ]]></description>
      <enclosure url="${escapeXml(dl)}" type="${enclosureType}" />
    </item>`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="https://example.com/feed/all-feed.xml" rel="self" type="application/rss+xml"/>
    <generator>fetch_roms.js</generator>
    <title>Firmware & Tools - Direct Downloads</title>
    <link>https://example.com</link>
    <description>Combined RSS feed with direct download links for firmware, tools, and schematics</description>
    <language>tr</language>
    <lastBuildDate>${now}</lastBuildDate>${itemsXml}
  </channel>
</rss>`;
}

async function main() {
  console.log('=== Analiz Main Scraper ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Sources: ${SOURCES.length}\n`);

  const allItems = [];

  for (const source of SOURCES) {
    let items = [];

    try {
      if (source.slug === 'oppo-usb-driver') {
        items = await scrapeOppoDriver(source);
      } else if (source.type === 'rss') {
        items = await scrapeRssSource(source);
      } else if (source.type === 'page-scraper') {
        items = await scrapePageSource(source);
      }

      console.log(`  -> Got ${items.length} items`);

      items.forEach(item => {
        item.sourceName = source.name;
        item.brand = item.meta?.brand || source.brand || source.name;
      });

      allItems.push(...items);

      const feedXml = generateFeedXml(source, items);
      const feedPath = path.join(FEED_DIR, `${source.slug}.xml`);
      fs.writeFileSync(feedPath, feedXml, 'utf-8');
      console.log(`  -> Saved: ${feedPath}`);
    } catch (error) {
      console.error(`  -> ERROR for ${source.name}: ${error.message}`);
      const feedXml = generateFeedXml(source, []);
      const feedPath = path.join(FEED_DIR, `${source.slug}.xml`);
      fs.writeFileSync(feedPath, feedXml, 'utf-8');
    }
  }

  console.log(`\n=== Generating combined feed with ${allItems.length} items ===`);
  const combinedXml = generateCombinedFeedXml(allItems);
  const combinedPath = path.join(FEED_DIR, 'all-feed.xml');
  fs.writeFileSync(combinedPath, combinedXml, 'utf-8');
  console.log(`Saved: ${combinedPath}`);

  console.log(`\n=== Done! ===`);
  console.log(`Total items: ${allItems.length}`);
  console.log(`Finished at: ${new Date().toISOString()}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
