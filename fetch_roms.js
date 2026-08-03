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

const FEED_DIR = path.join(__dirname, 'feed');

if (!fs.existsSync(FEED_DIR)) {
  fs.mkdirSync(FEED_DIR, { recursive: true });
}

const SOURCES = [
  {
    name: 'Oppo USB Driver',
    slug: 'oppo-usb-driver',
    type: 'rss',
    feedUrl: 'https://oppousbdriver.com/feed/',
    pageUrl: 'https://oppousbdriver.com/',
    directLink: 'https://oppousbdriver.com/wp-content/uploads/Oppo-USB-Driver-Setup-V4.0.1.6.zip',
    description: 'Official Oppo USB Driver for Windows - Direct Download',
  },
  {
    name: 'Xiaomi Engineer Rom',
    slug: 'xiaomi-engineer-rom',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-engineer-rom/',
    description: 'Xiaomi Engineer Rom (ENG Rom) - Direct Download Links',
    linkSelector: 'table a[href*="/download/"]',
  },
  {
    name: 'Huawei Firmware',
    slug: 'huawei-firmware',
    type: 'rss',
    feedUrl: 'https://firmwarefile.com/category/huawei/feed/',
    pageUrl: 'https://firmwarefile.com/category/huawei',
    description: 'Huawei Stock Firmware ROM (Flash File) - Direct Download Links',
  },
  {
    name: 'SP Flash Tool',
    slug: 'sp-flash-tool',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/sp-flash-tool/',
    description: 'SP Flash Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/sp-flash-tool"]',
  },
  {
    name: 'Anakart Devre Semalari',
    slug: 'anakart-devre-semalari',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-anakart-devre-semalari/',
    description: 'Xiaomi Anakart Devre Semalari - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'Xiaomi Recovery',
    slug: 'xiaomi-recovery',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-recovery/',
    description: 'Xiaomi Recovery (TWRP) - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'SP Maui Meta Tool',
    slug: 'sp-maui-meta-tool',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/sp-maui-meta-tool/',
    description: 'SP Maui Meta Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/mauimeta"]',
  },
  {
    name: 'Anakart Direnc Degerleri',
    slug: 'anakart-direnc-degerleri',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/xiaomi-anakart-direnc-degerleri-ve-yerleri/',
    description: 'Xiaomi Anakart Direnc Degerleri ve Yerleri - Direct Download Links',
    linkSelector: 'a[href*="/download/"]',
  },
  {
    name: 'ModemMeta Tool',
    slug: 'modemmeta-tool',
    type: 'page-scraper',
    pageUrl: 'https://xiaomitools.com/modemmeta-tool-all-versions/',
    description: 'ModemMeta Tool All Versions - Direct Download Links',
    linkSelector: 'a[href*="/download/modemmeta"]',
  },
  {
    name: 'Redmi POCO EDL Noktalari',
    slug: 'redmi-poco-edl-noktalari',
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

async function resolveDirectDownload(pageUrl) {
  try {
    const html = await fetchWithRetry(pageUrl);
    const $ = cheerio.load(html);

    // WordPress Download Manager plugin: ?wpdmdl=XXXX
    const wpdmdlLink = $('a[href*="?wpdmdl="]').first().attr('href');
    if (wpdmdlLink) {
      return wpdmdlLink.replace(/&amp;/g, '&');
    }

    // Direct .zip/.rar links
    const directFile = $('a[href$=".zip"], a[href$=".rar"]').first().attr('href');
    if (directFile) {
      return directFile.replace(/&amp;/g, '&');
    }

    // Google Drive links
    const gdriveLink = $('a[href*="drive.google.com"]').first().attr('href');
    if (gdriveLink) {
      return gdriveLink.replace(/&amp;/g, '&');
    }

    // FirmwareDrive links
    const firmwareLink = $('a[href*="firmwaredrive.com"]').first().attr('href');
    if (firmwareLink) {
      return firmwareLink.replace(/&amp;/g, '&');
    }

    return null;
  } catch (error) {
    console.error(`  Failed to resolve direct download from ${pageUrl}: ${error.message}`);
    return null;
  }
}

async function resolveFirmwareFileDirectDownload(pageUrl) {
  try {
    const html = await fetchWithRetry(pageUrl);
    const $ = cheerio.load(html);

    // Google Drive links
    const gdriveLink = $('a[href*="drive.google.com"]').first().attr('href');
    if (gdriveLink) {
      return gdriveLink.replace(/&amp;/g, '&');
    }

    // FirmwareDrive links
    const firmwareLink = $('a[href*="firmwaredrive.com"]').first().attr('href');
    if (firmwareLink) {
      return firmwareLink.replace(/&amp;/g, '&');
    }

    // Direct .zip links
    const directFile = $('a[href$=".zip"], a[href$=".rar"]').first().attr('href');
    if (directFile) {
      return directFile.replace(/&amp;/g, '&');
    }

    return null;
  } catch (error) {
    console.error(`  Failed to resolve direct download from ${pageUrl}: ${error.message}`);
    return null;
  }
}

async function scrapeRssSource(source) {
  console.log(`\n[${source.name}] Fetching RSS feed: ${source.feedUrl}`);
  const items = [];

  try {
    const feed = await parser.parseURL(source.feedUrl);

    if (!feed.items || feed.items.length === 0) {
      // Fallback: use direct link if available
      if (source.directLink) {
        items.push({
          title: source.name,
          link: source.directLink,
          directLink: source.directLink,
          pubDate: new Date().toUTCString(),
          description: source.description,
        });
      }
      return items;
    }

    for (const item of feed.items.slice(0, 50)) {
      let directLink = null;

      if (source.directLink && feed.items.length === 1) {
        directLink = source.directLink;
      } else if (source.slug === 'huawei-firmware') {
        directLink = await resolveFirmwareFileDirectDownload(item.link);
      } else if (source.directLink) {
        directLink = source.directLink;
      } else {
        directLink = await resolveDirectDownload(item.link);
      }

      items.push({
        title: item.title || source.name,
        link: item.link,
        directLink: directLink || item.link,
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        description: item.contentSnippet || item.content || item.title || source.description,
      });
    }
  } catch (error) {
    console.error(`  RSS fetch failed: ${error.message}`);
    // Fallback to direct link
    if (source.directLink) {
      items.push({
        title: source.name,
        link: source.directLink,
        directLink: source.directLink,
        pubDate: new Date().toUTCString(),
        description: source.description,
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

    // Find all download links on the page
    const downloadLinks = new Set();
    $('a[href*="/download/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('huiye-download-tool') && !href.includes('#')) {
        // Clean up href - remove trailing rel= or other attributes that got concatenated
        const cleanHref = href.split(' rel=')[0].split(" rel='")[0].split(' class=')[0].trim();
        if (cleanHref) downloadLinks.add(cleanHref);
      }
    });

    // Also check for specific selector
    if (source.linkSelector) {
      $(source.linkSelector).each((i, el) => {
        const href = $(el).attr('href');
        if (href && !href.includes('huiye-download-tool') && !href.includes('#')) {
          const cleanHref = href.split(' rel=')[0].split(" rel='")[0].split(' class=')[0].trim();
          if (cleanHref) downloadLinks.add(cleanHref);
        }
      });
    }

    // Also find direct file links (images for schematics/EDL/resistors)
    if (source.slug === 'anakart-devre-semalari' || source.slug === 'anakart-direnc-degerleri' || source.slug === 'redmi-poco-edl-noktalari') {
      $('img').each((i, el) => {
        let src = $(el).attr('src') || '';
        // Also check data-src for lazy-loaded images
        const dataSrc = $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
        if (dataSrc) src = dataSrc;
        
        if (src && src.includes('wp-content/uploads') && 
            !src.includes('cropped-unlock') && 
            !src.includes('favicon') && 
            !src.includes('logo') &&
            !src.includes('screenshot-300x') &&
            !src.includes('download.png')) {
          // Convert thumbnail to full-size by removing -WIDTHxHEIGHT suffix
          let fullSrc = src.replace(/-\d+x\d+\./, '.');
          // Remove -1 suffix if it's a duplicate
          fullSrc = fullSrc.replace(/-1\.(png|jpg|jpeg|webp)$/i, '.$1');
          downloadLinks.add(fullSrc);
        }
      });
      
      // Also check for links to images (href to .png/.jpg/.jpeg files)
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
      if (count >= 50) break;

      let title = '';
      let directLink = null;

      if (dlPageUrl.includes('/download/')) {
        // This is a download page - need to resolve the direct link
        const fullUrl = dlPageUrl.startsWith('http') ? dlPageUrl : `https://xiaomitools.com${dlPageUrl}`;
        
        // Extract title from URL
        const slug = fullUrl.split('/download/')[1]?.replace(/\/$/, '') || '';
        title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        directLink = await resolveDirectDownload(fullUrl);
        
        if (directLink) {
          items.push({
            title: title || source.name,
            link: fullUrl,
            directLink: directLink,
            pubDate: new Date().toUTCString(),
            description: `${title} - Direct Download from ${source.name}`,
          });
          count++;
        }
      } else if (dlPageUrl.includes('wp-content/uploads')) {
        // Direct image/file link
        const fullUrl = dlPageUrl.startsWith('http') ? dlPageUrl : `https://xiaomitools.com${dlPageUrl}`;
        const filename = fullUrl.split('/').pop().split('-').slice(0, -1).join('-') || fullUrl.split('/').pop();
        title = filename.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '').replace(/-/g, ' ');

        items.push({
          title: title || source.name,
          link: fullUrl,
          directLink: fullUrl,
          pubDate: new Date().toUTCString(),
          description: `${title} - Direct Download from ${source.name}`,
        });
        count++;
      }

      // Small delay to avoid overwhelming the server
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
    // First, get the direct download link from the main page
    const html = await fetchWithRetry(source.pageUrl);
    const $ = cheerio.load(html);

    // Find the latest direct download link from the main page
    let zipLink = $('a[href$=".zip"]').first().attr('href');
    // Also search in any element's href or src attribute
    if (!zipLink) {
      zipLink = $('[href$=".zip"]').first().attr('href');
    }
    // Search in page text/HTML for .zip URLs
    if (!zipLink) {
      const htmlStr = $.html();
      const zipMatch = htmlStr.match(/https?:\/\/[^\s"'<>]+\.zip/i);
      if (zipMatch) zipLink = zipMatch[0];
    }
    // Use known direct link as fallback
    if (!zipLink && source.directLink) {
      zipLink = source.directLink;
    }
    if (zipLink) {
      const versionMatch = zipLink.match(/V([\d.]+)/);
      const version = versionMatch ? `v${versionMatch[1]}` : 'Latest';
      items.push({
        title: `Oppo USB Driver ${version}`,
        link: zipLink,
        directLink: zipLink,
        pubDate: new Date().toUTCString(),
        description: `${source.description} - Version ${version}`,
      });
    }

    // Also check RSS feed for individual driver posts
    try {
      const feed = await parser.parseURL(source.feedUrl);
      for (const item of feed.items.slice(0, 20)) {
        // Try to find direct download link from the item page
        try {
          const itemHtml = await fetchWithRetry(item.link);
          const $item = cheerio.load(itemHtml);
          let directZip = $item('a[href$=".zip"]').first().attr('href');
          // Also search in any element
          if (!directZip) directZip = $item('[href$=".zip"]').first().attr('href');
          // Search in page HTML
          if (!directZip) {
            const itemHtmlStr = $item.html();
            const zipMatch = itemHtmlStr.match(/https?:\/\/[^\s"'<>]+\.zip/i);
            if (zipMatch) directZip = zipMatch[0];
          }
          
          items.push({
            title: item.title || source.name,
            link: item.link,
            directLink: directZip || source.directLink || item.link,
            pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
            description: item.contentSnippet || item.title || source.description,
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
    // Fallback to known direct link
    if (source.directLink) {
      items.push({
        title: source.name,
        link: source.directLink,
        directLink: source.directLink,
        pubDate: new Date().toUTCString(),
        description: source.description,
      });
    }
  }

  return items;
}

function generateFeedXml(source, items) {
  const now = new Date().toUTCString();
  
  let itemsXml = '';
  for (const item of items) {
    const downloadLink = item.directLink || item.link;
    const description = `${escapeXml(item.description || '')}<br/><br/><strong>Direct Download:</strong> <a href="${escapeXml(downloadLink)}">${escapeXml(downloadLink)}</a>`;
    
    itemsXml += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description><![CDATA[${description}]]></description>
      <guid isPermaLink="false">${escapeXml(item.link)}</guid>
      <pubDate>${formatDate(item.pubDate)}</pubDate>
      <category>${escapeXml(source.name)}</category>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(source.name)}</title>
  <atom:link href="${escapeXml(source.pageUrl || source.feedUrl)}/feed.xml" rel="self" type="application/rss+xml" />
  <link>${escapeXml(source.pageUrl || source.feedUrl)}</link>
  <description>${escapeXml(source.description)}</description>
  <language>tr</language>
  <lastBuildDate>${now}</lastBuildDate>
  <generator>analiz-main scraper</generator>${itemsXml}
</channel>
</rss>`;
}

function generateCombinedFeedXml(allItems) {
  const now = new Date().toUTCString();
  
  let itemsXml = '';
  for (const item of allItems) {
    const downloadLink = item.directLink || item.link;
    const description = `${escapeXml(item.description || '')}<br/><br/><strong>Direct Download:</strong> <a href="${escapeXml(downloadLink)}">${escapeXml(downloadLink)}</a>`;
    
    itemsXml += `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <description><![CDATA[${description}]]></description>
      <guid isPermaLink="false">${escapeXml(item.link)}</guid>
      <pubDate>${formatDate(item.pubDate)}</pubDate>
      <category>${escapeXml(item.source)}</category>
    </item>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Firmware & Tools Direct Download Feed</title>
  <atom:link href="https://example.com/feed/all-feed.xml" rel="self" type="application/rss+xml" />
  <link>https://example.com</link>
  <description>Combined RSS feed with direct download links for firmware, tools, and schematics</description>
  <language>tr</language>
  <lastBuildDate>${now}</lastBuildDate>
  <generator>analiz-main scraper</generator>${itemsXml}
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

      // Add source name to each item for combined feed
      items.forEach(item => {
        item.source = source.name;
      });

      allItems.push(...items);

      // Generate individual feed
      const feedXml = generateFeedXml(source, items);
      const feedPath = path.join(FEED_DIR, `${source.slug}.xml`);
      fs.writeFileSync(feedPath, feedXml, 'utf-8');
      console.log(`  -> Saved: ${feedPath}`);
    } catch (error) {
      console.error(`  -> ERROR for ${source.name}: ${error.message}`);
      // Still generate empty feed
      const feedXml = generateFeedXml(source, []);
      const feedPath = path.join(FEED_DIR, `${source.slug}.xml`);
      fs.writeFileSync(feedPath, feedXml, 'utf-8');
    }
  }

  // Generate combined feed
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
