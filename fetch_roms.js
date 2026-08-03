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
 *   node fetch_roms.js --discover-brands    # crawl firmwarefile.com's own
 *                                            # page-1..N brand index first,
 *                                            # auto-add any brand not yet in
 *                                            # BRANDS, then scrape everything
 *   node fetch_roms.js --discover-brands --discover-pages 30
 *                                            # same, but crawl up to 30 pages
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
  samsung: {
    name: "Samsung",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/samsung",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  huawei: {
    name: "Huawei",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/huawei",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  lenovo: {
    name: "Lenovo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/lenovo",
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

  // ---------------------------------------------------------------------
  // Additional firmwarefile.com brands (same firmwarefile-style parser
  // as realme/infinix/oneplus/samsung/huawei/lenovo above).
  // This is the full brand/category list from firmwarefile.com's own
  // pagination (confirmed by the user directly from the live site,
  // page-9), so slugs below are the real "/category/<slug>" paths.
  // ---------------------------------------------------------------------
  acer: {
    name: "Acer",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/acer",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  advan: {
    name: "Advan",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/advan",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  agm: {
    name: "AGM",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/agm",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  alcatel: {
    name: "Alcatel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/alcatel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  allview: {
    name: "Allview",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/allview",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  alps: {
    name: "Alps",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/alps",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  amazon: {
    name: "Amazon",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/amazon",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  amoi: {
    name: "Amoi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/amoi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  aoson: {
    name: "Aoson",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/aoson",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  apple: {
    name: "Apple",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/apple",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  archos: {
    name: "Archos",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/archos",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  asus: {
    name: "Asus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/asus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  att: {
    name: "ATT",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/att",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  avvio: {
    name: "Avvio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/avvio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  axe: {
    name: "AXE",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/axe",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  azumi: {
    name: "Azumi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/azumi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "b-mobile": {
    name: "B-Mobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/b-mobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "barnes-noble": {
    name: "Barnes & Noble",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/barnes-noble",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  base: {
    name: "Base",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/base",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  beeline: {
    name: "Beeline",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/beeline",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  benq: {
    name: "Benq",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/benq",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  beyond: {
    name: "Beyond",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/beyond",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  bigfish: {
    name: "Bigfish",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/bigfish",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  blackview: {
    name: "Blackview",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/blackview",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  blu: {
    name: "BLU",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/blu",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  bq: {
    name: "BQ",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/bq",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "bq-aquaris": {
    name: "BQ Aquaris",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/bq-aquaris",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  brondi: {
    name: "Brondi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/brondi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  captiva: {
    name: "Captiva",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/captiva",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  carrier: {
    name: "Carrier",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/carrier",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  casio: {
    name: "Casio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/casio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  cat: {
    name: "CAT",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cat",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  celkon: {
    name: "Celkon",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/celkon",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  centric: {
    name: "Centric",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/centric",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "cherry-mobile": {
    name: "Cherry Mobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cherry-mobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "china-tablet": {
    name: "China Tablet",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/china-tablet",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  chuwi: {
    name: "Chuwi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/chuwi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  cingular: {
    name: "Cingular",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cingular",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  cloudfone: {
    name: "Cloudfone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cloudfone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  covia: {
    name: "Covia",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/covia",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  coolpad: {
    name: "Coolpad",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/coolpad",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  cubot: {
    name: "Cubot",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cubot",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  cynus: {
    name: "Cynus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/cynus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  dakele: {
    name: "Dakele",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/dakele",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  datsun: {
    name: "Datsun",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/datsun",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  daxian: {
    name: "Daxian",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/daxian",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  datawind: {
    name: "Datawind",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/datawind",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  dell: {
    name: "Dell",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/dell",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  dewalt: {
    name: "Dewalt",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/dewalt",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  digma: {
    name: "Digma",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/digma",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  doogee: {
    name: "Doogee",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/doogee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  doro: {
    name: "Doro",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/doro",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "e-ceros": {
    name: "E-Ceros",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/e-ceros",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  echo: {
    name: "Echo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/echo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  echophone: {
    name: "Echophone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/echophone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ee: {
    name: "EE",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  elephone: {
    name: "Elephone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/elephone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "energy-sistem": {
    name: "Energy Sistem",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/energy-sistem",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  engmall: {
    name: "Engmall",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/engmall",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  eny: {
    name: "ENY",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/eny",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  epic: {
    name: "Epic",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/epic",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  epson: {
    name: "Epson",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/epson",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ericsson: {
    name: "Ericsson",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ericsson",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  essential: {
    name: "Essential",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/essential",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  evercoss: {
    name: "Evercoss",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/evercoss",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  evolio: {
    name: "Evolio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/evolio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  explay: {
    name: "Explay",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/explay",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ezio: {
    name: "Ezio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ezio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  fairphone: {
    name: "Fairphone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/fairphone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  faea: {
    name: "Faea",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/faea",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  fero: {
    name: "Fero",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/fero",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  freetel: {
    name: "Freetel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/freetel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  fly: {
    name: "FLY",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/fly",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  funker: {
    name: "Funker",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/funker",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  fusion5: {
    name: "Fusion5",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/fusion5",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  gionee: {
    name: "Gionee",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/gionee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  gigabyte: {
    name: "Gigabyte",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/gigabyte",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  gigaset: {
    name: "Gigaset",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/gigaset",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  goophone: {
    name: "Goophone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/goophone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  google: {
    name: "Google",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/google",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  haier: {
    name: "Haier",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/haier",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  hasee: {
    name: "Hasee",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/hasee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  hisense: {
    name: "Hisense",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/hisense",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  hitech: {
    name: "Hitech",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/hitech",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  honor: {
    name: "Honor",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/honor",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  htc: {
    name: "HTC",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/htc",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  hyve: {
    name: "Hyve",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/hyve",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "i-mate": {
    name: "i-mate",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/i-mate",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "i-mobile": {
    name: "i-mobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/i-mobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  iball: {
    name: "iBall",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/iball",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  iberry: {
    name: "Iberry",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/iberry",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  icemobile: {
    name: "Icemobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/icemobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ilife: {
    name: "iLife",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ilife",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  inq: {
    name: "INQ",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/inq",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  infocus: {
    name: "Infocus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/infocus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  innjoo: {
    name: "Innjoo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/innjoo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  innostream: {
    name: "Innostream",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/innostream",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  intex: {
    name: "Intex",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/intex",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ioutdoor: {
    name: "Ioutdoor",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ioutdoor",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  iq: {
    name: "IQ",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/iq",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  irbis: {
    name: "Irbis",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/irbis",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  isocell: {
    name: "Isocell",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/isocell",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  itel: {
    name: "Itel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/itel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  jinga: {
    name: "Jinga",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/jinga",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  jiayu: {
    name: "Jiayu",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/jiayu",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  jio: {
    name: "Jio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/jio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  jolla: {
    name: "Jolla",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/jolla",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  karbonn: {
    name: "Karbonn",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/karbonn",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  kenxinda: {
    name: "Kenxinda",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/kenxinda",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "k-touch": {
    name: "K-Touch",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/k-touch",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  kodak: {
    name: "Kodak",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/kodak",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  koolnee: {
    name: "Koolnee",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/koolnee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  krio: {
    name: "Krio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/krio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "kt-tech": {
    name: "KT-Tech",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/kt-tech",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  kyocera: {
    name: "Kyocera",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/kyocera",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  lava: {
    name: "Lava",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/lava",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  leeco: {
    name: "LeEco",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/leeco",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  lg: {
    name: "LG",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/lg",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  leagoo: {
    name: "Leagoo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/leagoo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  limi: {
    name: "Limi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/limi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  lyf: {
    name: "LYF",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/lyf",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "m-tech": {
    name: "M-Tech",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/m-tech",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  maistouch: {
    name: "Maistouch",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/maistouch",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mann: {
    name: "Mann",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mann",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  manta: {
    name: "Manta",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/manta",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  marshall: {
    name: "Marshall",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/marshall",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  maxwest: {
    name: "Maxwest",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/maxwest",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  maze: {
    name: "Maze",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/maze",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mecool: {
    name: "Mecool",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mecool",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mediatek: {
    name: "Mediatek",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mediatek",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  meizu: {
    name: "Meizu",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/meizu",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "meig-smart": {
    name: "Meig Smart",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/meig-smart",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  memory: {
    name: "Memory",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/memory",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  micromax: {
    name: "Micromax",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/micromax",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  microsoft: {
    name: "Microsoft",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/microsoft",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mio: {
    name: "MIO",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mlais: {
    name: "Mlais",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mlais",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mobiistar: {
    name: "Mobiistar",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mobiistar",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mofut: {
    name: "Mofut",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mofut",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  moleskine: {
    name: "Moleskine",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/moleskine",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  momodesign: {
    name: "Momodesign",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/momodesign",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  monorail: {
    name: "Monorail",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/monorail",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  motorola: {
    name: "Motorola",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/motorola",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "move-tab": {
    name: "Move Tab",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/move-tab",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mpie: {
    name: "Mpie",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mpie",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  msi: {
    name: "MSI",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/msi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mtk: {
    name: "MTK",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mtk",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  mymaga: {
    name: "Mymaga",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/mymaga",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  myphone: {
    name: "Myphone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/myphone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nabi: {
    name: "Nabi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nabi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nec: {
    name: "NEC",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nec",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  neo: {
    name: "NEO",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/neo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nextbook: {
    name: "Nextbook",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nextbook",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nokia: {
    name: "Nokia",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nokia",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "no-1": {
    name: "No.1",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/no-1",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nubia: {
    name: "Nubia",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nubia",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "nuu-mobile": {
    name: "NUU Mobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nuu-mobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  nvidia: {
    name: "NVIDIA",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/nvidia",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  o2: {
    name: "O2",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/o2",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  oasys: {
    name: "Oasys",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/oasys",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  oplus: {
    name: "Oplus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/oplus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  oaxis: {
    name: "Oaxis",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/oaxis",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  okwap: {
    name: "Okwap",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/okwap",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  onda: {
    name: "Onda",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/onda",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  orange: {
    name: "Orange",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/orange",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  oukitel: {
    name: "Oukitel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/oukitel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  outfone: {
    name: "Outfone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/outfone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pantech: {
    name: "Pantech",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pantech",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  palm: {
    name: "Palm",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/palm",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  panasonic: {
    name: "Panasonic",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/panasonic",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pardus: {
    name: "Pardus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pardus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  patech: {
    name: "Patech",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/patech",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pcd: {
    name: "PCD",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pcd",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  peaq: {
    name: "Peaq",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/peaq",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  philips: {
    name: "Philips",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/philips",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  phicomm: {
    name: "Phicomm",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/phicomm",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pilot: {
    name: "Pilot",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pilot",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pioneer: {
    name: "Pioneer",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pioneer",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pixus: {
    name: "Pixus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pixus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  plume: {
    name: "Plume",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/plume",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  polaroid: {
    name: "Polaroid",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/polaroid",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  polytron: {
    name: "Polytron",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/polytron",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  posh: {
    name: "Posh",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/posh",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  positivo: {
    name: "Positivo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/positivo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pptv: {
    name: "PPTV",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pptv",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  prestigio: {
    name: "Prestigio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/prestigio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  prime: {
    name: "Prime",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/prime",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  proscan: {
    name: "Proscan",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/proscan",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  pulsion: {
    name: "Pulsion",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/pulsion",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "q-touch": {
    name: "Q-Touch",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/q-touch",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  qmobile: {
    name: "Qmobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/qmobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  qtek: {
    name: "Qtek",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/qtek",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  quantum: {
    name: "Quantum",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/quantum",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  quechua: {
    name: "Quechua",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/quechua",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ramos: {
    name: "Ramos",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ramos",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  razer: {
    name: "Razer",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/razer",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  rca: {
    name: "RCA",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/rca",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  redmi: {
    name: "Redmi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/redmi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  revo: {
    name: "Revo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/revo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  rikomagic: {
    name: "Rikomagic",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/rikomagic",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ritzviva: {
    name: "Ritzviva",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ritzviva",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  roku: {
    name: "Roku",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/roku",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  rolsen: {
    name: "Rolsen",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/rolsen",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  roverpad: {
    name: "Roverpad",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/roverpad",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ruggear: {
    name: "Ruggear",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ruggear",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  runbo: {
    name: "Runbo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/runbo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sagem: {
    name: "Sagem",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sagem",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sansui: {
    name: "Sansui",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sansui",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sanyo: {
    name: "Sanyo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sanyo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  savio: {
    name: "Savio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/savio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  saygus: {
    name: "Saygus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/saygus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sencor: {
    name: "Sencor",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sencor",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sendtel: {
    name: "Sendtel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sendtel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  seuic: {
    name: "Seuic",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/seuic",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sendo: {
    name: "Sendo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sendo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sequans: {
    name: "Sequans",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sequans",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sharp: {
    name: "Sharp",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sharp",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  shift: {
    name: "Shift",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/shift",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  shoxs: {
    name: "Shoxs",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/shoxs",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  siemens: {
    name: "Siemens",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/siemens",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sigma: {
    name: "Sigma",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sigma",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "silent-circle": {
    name: "Silent Circle",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/silent-circle",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  siragon: {
    name: "Siragon",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/siragon",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  smartfren: {
    name: "Smartfren",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/smartfren",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  smartisan: {
    name: "Smartisan",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/smartisan",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  smarter: {
    name: "Smarter",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/smarter",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  smile: {
    name: "Smile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/smile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sony: {
    name: "Sony",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sony",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "sony-ericsson": {
    name: "Sony Ericsson",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sony-ericsson",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  soul: {
    name: "Soul",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/soul",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  source: {
    name: "Source",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/source",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  spark: {
    name: "Spark",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/spark",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  spectralink: {
    name: "Spectralink",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/spectralink",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  spectra: {
    name: "Spectra",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/spectra",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  spice: {
    name: "Spice",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/spice",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sprint: {
    name: "Sprint",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sprint",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  starmobile: {
    name: "Starmobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/starmobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  starlight: {
    name: "Starlight",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/starlight",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  steinberg: {
    name: "Steinberg",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/steinberg",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  stonex: {
    name: "Stonex",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/stonex",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  storm: {
    name: "Storm",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/storm",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  strong: {
    name: "Strong",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/strong",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  stylus: {
    name: "Stylus",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/stylus",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sumvision: {
    name: "Sumvision",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sumvision",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  sunvan: {
    name: "Sunvan",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/sunvan",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  supreme: {
    name: "Supreme",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/supreme",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  symphony: {
    name: "Symphony",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/symphony",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  synappx: {
    name: "Synappx",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/synappx",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  syscom: {
    name: "Syscom",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/syscom",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "t-mobile": {
    name: "T-Mobile",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/t-mobile",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tagital: {
    name: "Tagital",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tagital",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  takata: {
    name: "Takata",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/takata",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  talas: {
    name: "Talas",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/talas",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tanix: {
    name: "Tanix",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tanix",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tatung: {
    name: "Tatung",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tatung",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tcl: {
    name: "TCL",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tcl",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  teclast: {
    name: "Teclast",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/teclast",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  telit: {
    name: "Telit",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/telit",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tesla: {
    name: "Tesla",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tesla",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  thl: {
    name: "THL",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/thl",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "t-smart": {
    name: "T-Smart",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/t-smart",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tooky: {
    name: "Tooky",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tooky",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tophouse: {
    name: "Tophouse",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tophouse",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  toshiba: {
    name: "Toshiba",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/toshiba",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  touchmate: {
    name: "Touchmate",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/touchmate",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tracer: {
    name: "Tracer",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tracer",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  trekstor: {
    name: "Trekstor",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/trekstor",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  trio: {
    name: "Trio",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/trio",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  tronsmart: {
    name: "Tronsmart",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/tronsmart",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  truconnect: {
    name: "Truconnect",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/truconnect",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  turing: {
    name: "Turing",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/turing",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  ulefone: {
    name: "Ulefone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/ulefone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  umax: {
    name: "Umax",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/umax",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  umidigi: {
    name: "Umidigi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/umidigi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  unonu: {
    name: "Unonu",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/unonu",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  unowhy: {
    name: "Unowhy",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/unowhy",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  utstarcom: {
    name: "Utstarcom",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/utstarcom",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vastking: {
    name: "Vastking",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vastking",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vchok: {
    name: "Vchok",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vchok",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vector: {
    name: "Vector",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vector",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vega: {
    name: "Vega",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vega",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  velox: {
    name: "Velox",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/velox",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  venturer: {
    name: "Venturer",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/venturer",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vernee: {
    name: "Vernee",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vernee",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vertu: {
    name: "Vertu",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vertu",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  verykool: {
    name: "Verykool",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/verykool",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vestel: {
    name: "Vestel",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vestel",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vido: {
    name: "Vido",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vido",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  viewsonic: {
    name: "Viewsonic",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/viewsonic",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vins: {
    name: "Vins",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vins",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  visture: {
    name: "Visture",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/visture",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vkworld: {
    name: "Vkworld",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vkworld",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vodafone: {
    name: "Vodafone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vodafone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vortex: {
    name: "Vortex",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vortex",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  vsun: {
    name: "Vsun",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/vsun",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wacom: {
    name: "Wacom",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wacom",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  walton: {
    name: "Walton",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/walton",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wiko: {
    name: "Wiko",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wiko",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wileyfox: {
    name: "Wileyfox",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wileyfox",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wintouch: {
    name: "Wintouch",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wintouch",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wolder: {
    name: "Wolder",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wolder",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wolfgang: {
    name: "Wolfgang",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wolfgang",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wooky: {
    name: "Wooky",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wooky",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  wooloo: {
    name: "Wooloo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/wooloo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  woxter: {
    name: "Woxter",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/woxter",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  "x-view": {
    name: "X-View",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/x-view",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  xbo: {
    name: "XBO",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/xbo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  xiaomi: {
    name: "Xiaomi",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/xiaomi",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  xido: {
    name: "Xido",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/xido",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  xion: {
    name: "Xion",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/xion",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  xolo: {
    name: "Xolo",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/xolo",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  yezz: {
    name: "Yezz",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/yezz",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  yotaphone: {
    name: "Yotaphone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/yotaphone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  yuntab: {
    name: "Yuntab",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/yuntab",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zebra: {
    name: "Zebra",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zebra",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zen: {
    name: "ZEN",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zen",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zenfone: {
    name: "Zenfone",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zenfone",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zte: {
    name: "ZTE",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zte",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zuk: {
    name: "ZUK",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zuk",
    listSelector: "category",
    type: "firmwarefile-style",
  },
  zuum: {
    name: "Zuum",
    site: "firmwarefile.com",
    listUrl: "https://firmwarefile.com/category/zuum",
    listSelector: "category",
    type: "firmwarefile-style",
  },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const RATE_LIMIT_MS = 200;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Brand discovery ("keşif modu")
// ---------------------------------------------------------------------------
// Optional, additive feature: crawls firmwarefile.com's own paginated brand
// index (page-1, page-2, ... page-N) and auto-discovers any /category/<slug>
// links that aren't already in the static BRANDS map above, adding them the
// same "firmwarefile-style" way. If the site's Cloudflare JS-challenge blocks
// the crawl (or nothing new is found), it just logs a warning and the script
// falls back to the existing static BRANDS list untouched — this never
// removes or overrides anything already configured.
const NAME_OVERRIDES = {
  lg: "LG", htc: "HTC", zte: "ZTE", tcl: "TCL", blu: "BLU", bq: "BQ", att: "ATT",
  ee: "EE", o2: "O2", nec: "NEC", msi: "MSI", mtk: "MTK", rca: "RCA", lyf: "LYF",
  thl: "THL", leeco: "LeEco", iball: "iBall", ilife: "iLife", inq: "INQ", jio: "Jio",
  "bq-aquaris": "BQ Aquaris", "k-touch": "K-Touch", "kt-tech": "KT-Tech",
  "q-touch": "Q-Touch", "t-mobile": "T-Mobile", "t-smart": "T-Smart", "no-1": "No.1",
  "i-mate": "i-mate", "i-mobile": "i-mobile", "nuu-mobile": "NUU Mobile",
  "sony-ericsson": "Sony Ericsson", "x-view": "X-View", "e-ceros": "E-Ceros",
  "b-mobile": "B-Mobile", "barnes-noble": "Barnes & Noble",
  "silent-circle": "Silent Circle", "china-tablet": "China Tablet",
  "move-tab": "Move Tab", "m-tech": "M-Tech", xolo: "Xolo", pptv: "PPTV",
  nvidia: "NVIDIA",
};

function slugToName(slug) {
  if (NAME_OVERRIDES[slug]) return NAME_OVERRIDES[slug];
  return slug
    .split("-")
    .map((w) =>
      NAME_OVERRIDES[w] ||
      (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
    )
    .join(" ");
}

async function discoverFirmwareFileBrands(maxPages = 20) {
  console.log(`\nKeşif modu: firmwarefile.com marka listesi taranıyor (max ${maxPages} sayfa)...`);
  const found = new Map(); // slug -> name
  let pagesWithNoNew = 0;

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? "https://firmwarefile.com/" : `https://firmwarefile.com/page-${page}`;
    try {
      const { body } = await fetchText(url);
      await sleep(RATE_LIMIT_MS);
      const matches = body.matchAll(/\/category\/([a-z0-9-]+)/gi);
      let newOnThisPage = 0;
      for (const m of matches) {
        const slug = m[1].toLowerCase();
        if (!found.has(slug) && !BRANDS[slug]) {
          found.set(slug, slugToName(slug));
          newOnThisPage++;
        }
      }
      console.log(`  page-${page}: +${newOnThisPage} yeni marka`);
      if (newOnThisPage === 0) {
        pagesWithNoNew++;
        if (pagesWithNoNew >= 2) break; // iki sayfa üst üste yeni marka yoksa dur
      } else {
        pagesWithNoNew = 0;
      }
    } catch (e) {
      console.log(`  page-${page}: erişilemedi (${e.message})`);
      break;
    }
  }

  if (found.size === 0) {
    console.log("Keşif modu: yeni marka bulunamadı (site JS doğrulaması engelliyor olabilir). Statik BRANDS listesiyle devam ediliyor.\n");
    return;
  }

  for (const [slug, name] of found) {
    BRANDS[slug] = {
      name,
      site: "firmwarefile.com",
      listUrl: `https://firmwarefile.com/category/${slug}`,
      listSelector: "category",
      type: "firmwarefile-style",
    };
  }
  console.log(`Keşif modu: ${found.size} yeni marka BRANDS listesine eklendi.\n`);
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let brands = [];
  let maxDepth = Infinity;
  let outDir = ".";
  let discover = false;
  let discoverPages = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--depth") {
      const d = parseInt(args[i + 1], 10);
      maxDepth = isNaN(d) ? Infinity : d;
      i++;
    } else if (args[i] === "--out-dir") {
      outDir = args[i + 1];
      i++;
    } else if (args[i] === "--discover-brands") {
      discover = true;
    } else if (args[i] === "--discover-pages") {
      const d = parseInt(args[i + 1], 10);
      discoverPages = isNaN(d) ? 20 : d;
      i++;
    } else if (!args[i].startsWith("--")) {
      brands.push(args[i].toLowerCase());
    }
  }

  const explicitBrands = brands.length > 0;
  if (!explicitBrands) brands = Object.keys(BRANDS);
  return { brands, maxDepth, outDir, discover, discoverPages, explicitBrands };
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

  // Fallback: many of these WordPress sites don't print a visible "Date:"
  // label, but they do include the publish date in a meta tag, e.g.
  //   <meta property="article:published_time" content="2026-07-17T12:15:50+00:00" />
  if (!result.date) {
    const metaTagMatch = html.match(/<meta[^>]*article:published_time[^>]*>/i);
    if (metaTagMatch) {
      const contentMatch = metaTagMatch[0].match(/content=["']([^"']+)["']/i);
      if (contentMatch) result.date = contentMatch[1].trim().split("T")[0];
    }
  }

  // Extract description (meta description)
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  if (descMatch) result.description = descMatch[1].trim();

  // Extract firmware version from page content
  const versionMatch = html.match(/(?:Version|Build)\s*[:\-]?\s*([A-Z0-9][A-Za-z0-9._\-]{3,30})/);
  if (versionMatch) result.firmwareVersion = versionMatch[1].trim();

  // Fallback: some sites (e.g. oppostockrom.com, vivofirmware.com) never
  // print an explicit "Version"/"Build" label — the version is only
  // embedded inside the firmware "File Name" line, e.g.
  //   File Name: Oppo_A5x_PKW110_MT6835_Domestic_11_15.0.1.701CN01_250806_MXML.zip
  //   File Name: Vivo_PD2171_A_12.0.18.7.W10.V000L1_OTA.zip
  // Pull the dotted version-like token (3+ dot-separated groups, which may
  // mix digits and letters, e.g. "701CN01" or "W10") out of that line.
  if (!result.firmwareVersion) {
    const fileNameLineMatch = html.match(/File\s*Name[^:]*:\s*([^\n<]+)/i);
    if (fileNameLineMatch) {
      const verFromFileName = fileNameLineMatch[1].match(/(?:^|[_\s])(\d+(?:\.[A-Za-z0-9]+){2,})(?:[_\s]|$)/);
      if (verFromFileName) {
        // Guard against swallowing the file extension (e.g. "...4.1.2.zip")
        result.firmwareVersion = verFromFileName[1]
          .replace(/\.(zip|rar|7z|tar|gz)$/i, "")
          .trim();
      }
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
        Device: ${escapeXml(f.deviceName)}
        <br/>Brand: ${escapeXml(f.brand)}
        <br/>Size: ${escapeXml(f.fileSize)}
        <br/>Date: ${escapeXml(f.date)}
        ${f.firmwareVersion ? "<br/>Version: " + escapeXml(f.firmwareVersion) : ""}
        <br/><a href="${escapeXml(f.directDownloadUrl)}">Direct Download (Google Drive)</a>
        ${f.googleDriveUrl ? `<br/><a href="${escapeXml(f.googleDriveUrl)}">Open in Google Drive</a>` : ""}
        <br/><a href="${escapeXml(f.deviceUrl)}">Source Page</a>
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
  let { brands, maxDepth, outDir, discover, discoverPages, explicitBrands } = parseArgs();

  if (discover) {
    await discoverFirmwareFileBrands(discoverPages);
    // If the user didn't name specific brands, re-expand the run list to
    // include anything newly discovered. If they did name brands, leave
    // their selection as-is (discovery just makes those keys valid too).
    if (!explicitBrands) brands = Object.keys(BRANDS);
  }

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
