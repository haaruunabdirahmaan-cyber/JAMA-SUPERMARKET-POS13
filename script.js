/* ====================================================================
   JAMA SUPERMARKET — PREMIUM POS PRO v7.1
   ==================================================================== */
'use strict';

const APP_VERSION = '7.1.0';
const WHATSAPP_NUMBER = '27629100421';
const CURRENCY = 'R';
const FREE_DELIVERY_THRESHOLD = 500;
const LOW_STOCK_THRESHOLD = 5;
const MAX_LEDGER_ENTRIES = 5000;
const PRICE_CACHE_MAX = 500;
const LOYALTY_THRESHOLD = 10;

const DELIVERY_ZONES = {
  local:   { label: 'Local (Etwatwa, Thembisile) — R30', fee: 30 },
  near:    { label: 'Nearby (15km) — R50',                fee: 50 },
  far:     { label: 'Far (30km) — R80',                   fee: 80 },
  collect: { label: 'Self-Collect — FREE',                 fee: 0  }
};

/* ============ ROLE SYSTEM ============ */
const ROLES = {
  owner:   { label:'OWNER',   perms:['*'] },
  manager: { label:'MANAGER', perms:['admin_orders','admin_pos','admin_products','admin_inventory','admin_ledger','admin_suppliers','admin_purchasing','admin_promotions','admin_shifts','admin_messages','admin_customers','admin_analytics'] },
  cashier: { label:'CASHIER', perms:['admin_pos','admin_shifts'] }
};

/* ============ STATE ============ */
let PRODUCTS = [];
let CART     = loadJSON('jama_cart_v7', []);
let SUPPLIERS = loadJSON('jama_suppliers_v7', []);
let PURCHASE_ORDERS = loadJSON('jama_purchase_orders_v7', []);
let PROMOTIONS = loadJSON('jama_promotions_v7', []);
let SHIFTS = loadJSON('jama_shifts_v7', []);
let CURRENT_SHIFT = loadJSON('jama_current_shift_v7', null);
let CURRENT_FILTER = { category: 'all', search: '', min: 0, max: Infinity, sort: 'name' };
let CURRENT_PRODUCT = null;
let USER = loadJSON('jama_user_v7', null);
let ADMIN_SUBTAB = { products: 'list', inventory: 'overview', ledger: 'all', suppliers: 'list', purchasing: 'orders', promotions: 'list', shifts: 'current' };
let ADMIN_TAB = 'orders';
let ADMIN_UNLOCKED = false;
let CURRENT_ROLE = 'owner';
let LOGO_CLICK_COUNT = 0;
let LOGO_CLICK_TIMER = null;
let LAST_ORDER_COUNT = 0;
let LAST_RECEIPT_HTML = null;
let PRICE_CACHE = new Map();

/* ============ STORAGE HELPERS ============ */
function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}

let lastStorageWarn = 0;
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (Date.now() - lastStorageWarn > 30000) {
      lastStorageWarn = Date.now();
      showToast('⚠️ Storage full — some data may not persist', 'error', 4000);
    }
    return false;
  }
}

/* ============ HASH ============ */
async function sha256(text) {
  if (window.crypto && window.crypto.subtle) {
    const buf = new TextEncoder().encode(text);
    const hash = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < text.length; i++) { h = ((h << 5) - h) + text.charCodeAt(i); h |= 0; }
  return 'weak_' + Math.abs(h).toString(16);
}

async function buildPasswordHashes() {
  const stored = loadJSON('jama_admin_hashes_v7', null);
  if (stored) return stored;
  const hashes = {
    owner:   await sha256('JamaOwner2025!'),
    manager: await sha256('JamaMgr2025!'),
    cashier: await sha256('JamaCash2025!')
  };
  saveJSON('jama_admin_hashes_v7', hashes);
  return hashes;
}

function hasPerm(perm) {
  const role = ROLES[CURRENT_ROLE];
  if (!role) return false;
  return role.perms.includes('*') || role.perms.includes(perm);
}

/* ============ SEED PRODUCTS ============ */
function getSeedProducts() {
  return [
  { id: 1, name: '1Quire', price: 19.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/1Quire_R19.jpg' },
  { id: 2, name: '2Quire', price: 25.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/2Quire_R25.jpg' },
  { id: 3, name: '3Quire', price: 35.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/3Quire_R35.jpg' },
  { id: 4, name: '7 Way Multi-Plug', price: 95.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/7 Way Multi-Plug_R95.jpg' },
  { id: 5, name: '9 Way Multi-Plug', price: 110.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/9 Way Multi-Plug_R110.jpg' },
  { id: 6, name: '11 Way Multi-Plug', price: 120.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/11 Way Multi-Plug_R120.jpg' },
  { id: 7, name: '30Dozen', price: 65.00, cost: 13.30, category: 'EGGS', stock: 50, image: './images/30Dozen_R65.jpg' },
  { id: 8, name: '60Dozen', price: 120.00, cost: 13.30, category: 'EGGS', stock: 50, image: './images/60Dozen_R120.jpg' },
  { id: 9, name: '72Page', price: 10.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/72Page_R10.jpg' },
  { id: 10, name: '72Pages', price: 10.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/72Pages_R10.jpg' },
  { id: 11, name: 'A1B3 Tissue', price: 25.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/AIB3 Tissue_R25.jpg' },
  { id: 12, name: 'Albany Brown', price: 19.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Albany Brown_R19.jpg' },
  { id: 13, name: 'Albany White', price: 21.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Albany White_R21.jpg' },
  { id: 14, name: 'All Gold 500ml', price: 28.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/All Gold500_R28.jpg' },
  { id: 15, name: 'All Gold 750ml', price: 38.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/All Gold 750ml_R38.jpg' },
  { id: 16, name: 'All Gold Tomato 50ml', price: 10.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/All Gold Tomato_R10.jpg' },
  { id: 17, name: 'All Gold Tomato 100ml', price: 15.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/All Gold Tomato_R15.jpg' },
  { id: 18, name: 'Amla Oil', price: 25.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Amla Oil_R25.jpg' },
  { id: 19, name: 'Apricot Jam', price: 45.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Apricot Jama_R45.jpg' },
  { id: 20, name: 'Aromat Chili Beef', price: 18.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Aromat Chili Beef_R18.jpg' },
  { id: 21, name: 'Aromat Original 100g', price: 12.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Aromat Original_R12.jpg' },
  { id: 22, name: 'Aromat Original 200g', price: 18.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Aromat Original_R18.jpg' },
  { id: 23, name: 'Atlanta Sugar 1kg', price: 25.00, cost: 14.30, category: 'SUGAR', stock: 50, image: './images/Atlanta Sugar_R25.jpg' },
  { id: 24, name: 'Atlanta Sugar 2kg', price: 46.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Atlanta Sugar_R43.jpg' },
  { id: 25, name: 'Atlanta Sugar 5kg', price: 105.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Atlanta Sugar_R105.jpg' },
  { id: 26, name: 'Atlanta Sugar 10kg', price: 205.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Atlanta Sugar_R200.jpg' },
  { id: 27, name: 'Baby Petroleum Jelly', price: 33.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Baby Petroleum Jelly_R33.jpg' },
  { id: 28, name: 'Baby Soft', price: 10.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Baby Soft_R10.jpg' },
  { id: 29, name: 'Bake Dream 12.5kg', price: 135.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Bake Dream 12.5kg_R135.jpg' },
  { id: 30, name: 'Baked Beans ', price: 12.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Baked Beans_R12.jpg' },
  { id: 31, name: 'Baked Beans ', price: 12.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Baked Beans_R13.jpg' },
  { id: 32, name: 'Baked Beans ', price: 15.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Baked Beans_R14.jpg' },
  { id: 33, name: 'Baked Beans ', price: 18.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Baked Beans_R17.jpg' },
  { id: 34, name: 'Baken mo Brown', price: 13.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Baken mo Brown_R13.jpg' },
  { id: 35, name: 'Baken Mo White', price: 13.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Baken Mo White_R13.jpg' },
  { id: 36, name: 'Baking Powder', price: 10.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Baking Powder_R10.jpg' },
  { id: 38, name: 'BBQ Sauce 5L', price: 125.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/BBQ Sauce_125.jpg' },
  { id: 39, name: 'BBQ Sauce 5L', price: 90.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/BBQ Sauce_R90.jpg' },
  { id: 40, name: 'Beef & Onion Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Beef & Onion_R6.jpg' },
  { id: 41, name: 'Beef & Vegetable Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Beef & Vegetable_R6.jpg' },
  { id: 42, name: 'Beetroot', price: 24.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/BeetRoot_R24.jpg' },
  { id: 43, name: 'Bela Spaghetti 400g', price: 15.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/BelaSpaghetti400g_R15.jpg' },
  { id: 44, name: 'Benny', price: 18.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Benny_R10.jpg' },
  { id: 45, name: 'Benylin Syrup', price: 45.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Benylin Syrup_R45.jpg' },
  { id: 46, name: 'Bicarbonate of Soda', price: 5.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Bicarbonate of soda_R5.jpg' },
  { id: 47, name: 'Bigbom', price: 45.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/bigbom_R45.jpg' },
  { id: 48, name: 'Biscuit 1.1kg', price: 35.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Biscuit 1.1kg_R35.jpg' },
  { id: 49, name: 'Biscuit 1.6kg', price: 45.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Biscuit 1.6kg_R45.jpg' },
  { id: 50, name: 'Biscuit 2.1kg', price: 55.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Biscuit 2.1kg_aR55.jpg' },
  { id: 51, name: 'Black Cat', price: 32.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Black Cat_R32.jpg' },
  { id: 52, name: 'Black Chic', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Black Chic_R35.jpg' },
  { id: 53, name: 'Black Pepper', price: 5.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Black Pepper_R5.jpg' },
  { id: 54, name: 'Blossoms', price: 5.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Blossoms_R5.jpg' },
  { id: 55, name: 'Blue Cheese', price: 39.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Blue Cheese_R39.jpg' },
  { id: 56, name: 'Blue Label', price: 25.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Blue Label_R20.jpg' },
  { id: 57, name: 'Bluedeath', price: 26.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Bluedeath_R26.jpg' },
  { id: 58, name: 'Blue Ribbon Brown', price: 19.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/BlueRibbon Brown_R19.jpg' },
  { id: 59, name: 'Blue Ribbon White', price: 21.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/BlueRibbon White_R21.jpg' },
  { id: 60, name: 'Bobtail', price: 200.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Bobtail_R200.jpg' },
  { id: 61, name: 'Borstol Syrup', price: 45.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Borstol Syrup_R45.jpg' },
  { id: 62, name: 'Bowl Small', price: 19.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/bowl_R19.jpg' },
  { id: 63, name: 'Bowl Medium', price: 22.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/bowl_R22.jpg' },
  { id: 64, name: 'Bowl Large', price: 25.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/bowl_R25.jpg' },
  { id: 65, name: 'Box Dewfresh', price: 110.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Box Dewfresh_R110.jpg' },
  { id: 66, name: 'Box Grand-Pa', price: 90.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Box Grand-Pa_R90.jpg' },
  { id: 67, name: 'Box Parmalat', price: 110.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Box Parmalat_R110.jpg' },
  { id: 68, name: 'Braa Grill', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Braa Grill_R25.jpg' },
  { id: 70, name: 'Brake Fluid', price: 35.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Break Fliud_R35.jpg' },
  { id: 71, name: 'Bucket 10L', price: 35.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Bucket 10L_R35.jpg' },
  { id: 72, name: 'Bucket 20L', price: 45.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Bucket 20L_R50.jpg' },
  { id: 73, name: 'Bucket Element 20L', price: 100.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Bucket Element20L_R100.jpg' },
  { id: 74, name: 'Bucket Element 10L', price: 85.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Bucket Element 10L_85.jpg' },
  { id: 75, name: 'Bull Brand Beef', price: 30.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Bull Brand Beef_R30.jpg' },
  { id: 76, name: 'C to C', price: 45.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/C to C_R45.jpg' },
  { id: 77, name: 'Calpol Syrup 50ml', price: 45.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Calpol Syrup_R45.jpg' },
  { id: 78, name: 'Calpol Syrup 100ml', price: 70.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Calpol Syrup_R70.jpg' },
  { id: 79, name: 'Candle Box', price: 30.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Candle Box_R30.jpg' },
  { id: 80, name: 'Cappuccino Sachet', price: 10.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Cappuccino_R10.jpg' },
  { id: 82, name: 'Catmor 4kg', price: 175.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Catmor4kg.jpg', note: 'PRICE MISSING' },
  { id: 83, name: 'Catmor', price: 90.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Catmor_R100.jpg' },
  { id: 84, name: 'Cerelos Salt 500g', price: 12.00, cost: 13.30, category: 'SALT', stock: 50, image: './images/Cerelos Salt_R12.jpg' },
  { id: 85, name: 'Cerelos Salt 1kg', price: 15.00, cost: 13.30, category: 'SALT', stock: 50, image: './images/Cerelos Salt_R15.jpg' },
  { id: 86, name: 'Cerebos Salt 1kg', price: 20.00, cost: 13.30, category: 'SALT', stock: 50, image: './images/Cerelos Salt_R20.jpg' },
  { id: 87, name: 'Chakalaka Hot & Spicy ', price: 19.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Chakalaka Hot&Spicy_R18.jpg' },
  { id: 88, name: 'Chakalaka Hot & Spicy ', price: 24.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Chakalaka hot&spicy_R22.jpg' },
  { id: 89, name: 'Chakalaka Hot', price: 12.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Chakalaka Hot_R12.jpg' },
  { id: 90, name: 'Chakalaka Sweetcorn', price: 24.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Chakalaka Sweetcon_R22.jpg' },
  { id: 91, name: 'Chappies', price: 0.50, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Chappies_R0.5.jpg' },
  { id: 92, name: 'Cheetos', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Cheetos_R5.jpg' },
  { id: 93, name: 'Chicken Spice', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Chicken Spice_R25.jpg' },
  { id: 94, name: 'Chip Sauce 5L', price: 125.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/ChipSauce5l.jpg', note: 'PRICE MISSING' },
  { id: 95, name: 'Choc Kits', price: 40.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Choc Kits_R39.jpg' },
  { id: 96, name: 'Choc Mint', price: 40.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Choc Mint_R45.jpg' },
  { id: 97, name: 'Choco Loco', price: 1.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Choco Loco_R1.jpg' },
  { id: 98, name: 'Choice Assorted', price: 40.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Choice Assorted_R40.jpg' },
  { id: 99, name: 'Chutney 375g', price: 32.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Chutney 375.jpg', note: 'PRICE MISSING' },
  { id: 100, name: 'Citro-Soda', price: 8.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Citro-Soda_R8.jpg' },
  { id: 101, name: 'Clere Berries Cream', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere BerriesCream_R35.jpg' },
  { id: 102, name: 'Clere Cocoa Butter ', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Cociabutter_R35.jpg' },
  { id: 103, name: 'Clere Cocoa Butter ', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Cocoabutter_R27.jpg' },
  { id: 104, name: 'Clere Fire', price: 40.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Fire_R40.jpg' },
  { id: 105, name: 'Clere Ice', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Ice_R27.jpg' },
  { id: 106, name: 'Clere Lanolin', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Lanolin_R27.jpg' },
  { id: 107, name: 'Clere Legend ', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Legend_R27.jpg' },
  { id: 108, name: 'Clere Legend ', price: 40.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Legend_R40.jpg' },
  { id: 109, name: 'Clere Nourishing', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Nourishing_R35.jpg' },
  { id: 110, name: 'Clere Repairing', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Repairing_R27.jpg' },
  { id: 111, name: 'Clere Smooth', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Smooth_R27.jpg' },
  { id: 112, name: 'Clere Storm', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere Storm_R27.jpg' },
  { id: 113, name: 'Clere Tissue Oil', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere TissueOil_R30.jpg' },
  { id: 114, name: 'Clere Vanilla Honey', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Clere VanillaHoney_R35.jpg' },
  { id: 115, name: 'Clover Milk ', price: 20.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Clover Milk_R20.jpg' },
  { id: 116, name: 'Clover Milk 1L', price: 38.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Clover Milk_R38.jpg' },
  { id: 117, name: 'Coca Cola 1L', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Coca Cola 1L_R20.jpg' },
  { id: 118, name: 'Coca Cola 2L', price: 27.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Coca Cola 2L_R27.jpg' },
  { id: 119, name: 'Cocoa 62.5g', price: 50.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Cocoa62.5g_R50.jpg' },
  { id: 120, name: 'Cocoa 62g', price: 55.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Cocoa62g_R55.jpg' },
  { id: 121, name: 'Cocoa Butter', price: 75.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Cocoa Butter_R70.jpg' },
  { id: 122, name: 'Comfitex Small', price: 25.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Comfitex_R25.jpg' },
  { id: 123, name: 'Comfitex Large', price: 40.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Comfitex_R40.jpg' },
  { id: 124, name: 'Compral', price: 3.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Compral_R3.jpg' },
  { id: 126, name: 'Condensed Milk', price: 38.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/CondensedMilk_R38.jpg' },
  { id: 127, name: 'Corn Flakes 750g', price: 65.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/Corn Flakes_R75.jpg' },
  { id: 128, name: 'Corn Flakes 500g', price: 55.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/CornFlakes1kg_R55.jpg' },
  { id: 129, name: 'Cranberry LiquiFruit 1L', price: 32.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Cranberry LiquiFruit_R32.jpg' },
  { id: 130, name: 'Cranberry LiquiFruit 2L', price: 55.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Cranberry LiquiFruit_R50.jpg' },
  { id: 131, name: 'Cream of Mushroom Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Cream of Mashroom_R6.jpg' },
  { id: 132, name: 'Cremora ', price: 58.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Cremora_R65.jpg' },
  { id: 133, name: 'Cremora Sachet ', price: 35.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/CremoraSachet500g_R35.jpg' },
  { id: 134, name: 'Crez Aloe Musk', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Crez AloeMusk_R16.jpg' },
  { id: 135, name: 'Crez Cocoa Butter', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Crez Cocoabutter_R16.jpg' },
  { id: 136, name: 'Crez Pure', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Crez Pure_R16.jpg' },
  { id: 137, name: "D'Lite 5L", price: 145.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite_R145.jpg' },
  { id: 138, name: "D'Lite 2L", price: 60.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-lite_R60.jpg' },
  { id: 139, name: 'D-Lite 500g', price: 25.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/D-Lite 500g.jpg', note: 'PRICE MISSING' },
  { id: 140, name: 'D-Lite 1kg', price: 40.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/D-Lite 1kg.jpg', note: 'PRICE MISSING' },
  { id: 141, name: 'D-Lite 375ml', price: 18.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite 375ml.jpg', note: 'PRICE MISSING' },
  { id: 143, name: 'D-Lite 500ml', price: 23.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite 500ml.jpg', note: 'PRICE MISSING' },
  { id: 144, name: 'D-Lite 750ml', price: 30.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite 750ml.jpg', note: 'PRICE MISSING' },
  { id: 145, name: 'D-Lite Box 2L', price: 720.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite Box 2L.jpg', note: 'PRICE MISSING' },
  { id: 146, name: 'D-Lite Box 5L', price: 580.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite Box 5L.jpg', note: 'PRICE MISSING' },
  { id: 147, name: 'D-Lite Box 375ml', price: 210.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite Box 375ml.jpg', note: 'PRICE MISSING' },
  { id: 148, name: 'D-Lite Box 750ml', price: 350.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/D-Lite Box 750ml.jpg', note: 'PRICE MISSING' },
  { id: 149, name: 'Dairy Milk', price: 23.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Dairy Milk_R23.jpg' },
  { id: 151, name: 'Dark Lovely ', price: 45.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dark Lovely_R45.jpg' },
  { id: 152, name: 'Dark Lovely ', price: 95.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dark Lovely_R95.jpg' },
  { id: 153, name: 'Dawn Firming', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dawn Firming_R27.jpg' },
  { id: 154, name: 'Dawn Moisture', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dawn Moisture_R27.jpg' },
  { id: 155, name: 'Dawn Refreshing', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dawn Refreshing_R27.jpg' },
  { id: 156, name: 'Dawn Soothing', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dawn Soothing_R27.jpg' },
  { id: 157, name: 'Dawn Sparkling', price: 30.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dawn Sparkling_R27.jpg' },
  { id: 158, name: 'Dettol Active', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Active_R17.jpg' },
  { id: 159, name: 'Dettol Charcoal', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Charcoal.jpg' },
  { id: 160, name: 'Dettol Cool', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Cool_R17.jpg' },
  { id: 161, name: 'Dettol Eventone', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Eventone_R17.jpg' },
  { id: 162, name: 'Dettol Fresh', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Fresh_R17.jpg' },
  { id: 163, name: 'Dettol Herbal', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Herbal_R17.jpg' },
  { id: 164, name: 'Dettol Liquid', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dettol Liquid_R20.jpg' },
  { id: 165, name: 'Dettol Original', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Original_R17.jpg' },
  { id: 166, name: 'Dettol Re-Energize', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Re-Energize_R17.jpg' },
  { id: 167, name: 'Dettol Sensitive', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Sensitive_R17.jpg' },
  { id: 168, name: 'Dettol Skincare', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Dettol Skincare_R17.jpg' },
  { id: 169, name: 'Dewfresh', price: 19.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Dewfresh_R19.jpg' },
  { id: 170, name: 'Diamond Tissue', price: 25.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Diamond Tissue_R25.jpg' },
  { id: 171, name: 'Diamond', price: 5.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Diamond_R5.jpg' },
  { id: 172, name: 'Diamond Stove', price: 250.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/DiamondStove_R250.jpg' },
  { id: 173, name: 'Disprin', price: 3.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Disprin_R3.jpg' },
  { id: 174, name: 'Dolly Varden 200g', price: 18.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dolly Verdan_R18.jpg' },
  { id: 175, name: 'Dolly Varden 100g', price: 14.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Dolly verden _R14.jpg' },
  { id: 176, name: 'Domestos', price: 38.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Domestos_R38.jpg' },
  { id: 177, name: 'Doom ', price: 45.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Doom_40.jpg' },
  { id: 178, name: 'Doom ', price: 20.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Doom_R20.jpg' },
  { id: 179, name: 'Doom ', price: 30.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Doom_R35.jpg' },
  { id: 180, name: 'Doritos BBQ', price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Doritos BBQ_R23.jpg' },
  { id: 181, name: 'Doritos Cheese', price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Doritos Cheese_R23.jpg' },
  { id: 182, name: 'Doritos Nacho Cheese', price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Doritos NachoCheese_R23.jpg' },
  { id: 183, name: 'Doritos Sour Cream', price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Doritos SourCream_R23.jpg' },
  { id: 184, name: 'Doritos Sweet Chilli', price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Doritos Sweet chill_R23.jpg' },
  { id: 185, name: 'Dragon', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Dragon_R10.jpg' },
  { id: 186, name: 'Drakensberg 1kg', price: 18.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Drakensberg1kg.jpg', note: 'PRICE MISSING' },
  { id: 187, name: 'Drakensberg 2kg', price: 28.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Drakensberg2kg.jpg', note: 'PRICE MISSING' },
  { id: 188, name: 'Drakensberg 5kg', price: 60.00, cost: 13.30, category: 'ANIMAL FOODS', stock: 50, image: './images/Drakensberg5kg.jpg', note: 'PRICE MISSING' },
  { id: 189, name: 'Dry Iron', price: 140.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Dry Iron.jpg', note: 'PRICE MISSING' },
  { id: 190, name: 'Dyroach', price: 55.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Dyroach_R50.jpg' },
  { id: 191, name: 'Easy Waves', price: 55.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Easy Waves_R55.jpg' },
  { id: 192, name: 'Easymix Vanilla', price: 38.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Easymix Vanilla_R37.jpg' },
  { id: 193, name: 'Econo 5kg', price: 60.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Econo5kg.jpg', note: 'PRICE MISSING' },
  { id: 194, name: 'Eet-Sum-Mor', price: 32.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Eet-Sum-Mor_R30.jpg' },
  { id: 195, name: 'Eggs 6PCS', price: 15.00, cost: 13.30, category: 'EGGS', stock: 50, image: './images/Eggs6.jpg', note: 'PRICE MISSING' },
  { id: 196, name: 'Eggs 30pcs', price: 55.00, cost: 13.30, category: 'EGGS', stock: 50, image: './images/Eggs 30pcs.jpg', note: 'PRICE MISSING' },
  { id: 197, name: 'Elite 2kg', price: 30.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Elite 2kg.jpg', note: 'PRICE MISSING' },
  { id: 198, name: 'Elite 5kg', price: 60.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Elite 5kg.jpg', note: 'PRICE MISSING' },
  { id: 199, name: 'Elite 10kg', price: 105.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Elite 10kg.jpg', note: 'PRICE MISSING' },
  { id: 200, name: 'Ellis Brown ', price: 58.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Ellis Brown_R60.jpg' },
  { id: 201, name: 'Ellis Brown 125g', price: 20.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/EllisBrown125.jpg', note: 'PRICE MISSING' },
  { id: 202, name: 'Engen Oil 500ml', price: 40.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Engen Oil500ml.jpg', note: 'PRICE MISSING' },
  { id: 203, name: 'English Blazer ', price: 40.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/English Blazer_R40.jpg' },
  { id: 204, name: 'English Blazer Black', price: 28.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/English BlazerBlack_R28.jpg' },
  { id: 205, name: 'English Blazer Green', price: 28.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/English BlazerGreen_R28.jpg' },
  { id: 206, name: 'Eno Powder', price: 6.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Eno Powder_R5.jpg' },
  { id: 207, name: 'Epsom Salt', price: 5.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Epson Salt_R5.jpg' },
  { id: 208, name: 'Essence Vanilla 50ml', price: 10.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Essence Vanilla_R10.jpg' },
  { id: 209, name: 'Essence Vanilla 100ml', price: 25.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Essence Vanilla_R25.jpg' },
  { id: 210, name: 'Essence Vanilla ', price: 13.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/EssenceVanilla_R13.jpg' },
  { id: 211, name: 'Excella 2kg', price: 35.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Excella 2kg_R35.jpg' },
  { id: 212, name: 'Excella 375ml', price: 20.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Excella 375ml.jpg', note: 'PRICE MISSING' },
  { id: 213, name: 'Excella 750ml', price: 33.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Excella_R33.jpg' },
  { id: 214, name: 'Excella 2L', price: 75.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Excella_R75.jpg' },
  { id: 215, name: 'Excella 5L', price: 175.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Excella_R175.jpg' },
  { id: 216, name: 'Excella Rice 10kg', price: 125.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/ExcellaRice10kg.jpg', note: 'PRICE MISSING' },
  { id: 217, name: 'Extension 3m', price: 35.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Extension 3m.jpg', note: 'PRICE MISSING' },
  { id: 218, name: 'Extension 5m', price: 435.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Extension 5m.jpg', note: 'PRICE MISSING' },
  { id: 219, name: 'Extension 10m', price: 65.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Extension 10m.jpg', note: 'PRICE MISSING' },
  { id: 220, name: 'Extension 15m', price: 75.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Extension 15m.jpg', note: 'PRICE MISSING' },
  { id: 221, name: 'Extension 20m', price: 85.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Extension 20m.jpg', note: 'PRICE MISSING' },
  { id: 222, name: 'Fanta Grape 2L', price: 25.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Fanta Grape_R25.jpg' },
  { id: 223, name: 'Fanta Orange 2L', price: 25.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Fanta Orange_R25.jpg' },
  { id: 225, name: 'Fattis & Monis 500g', price: 19.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/Fattis&monis500g_R19.jpg' },
  { id: 226, name: 'Festa Blue', price: 9.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Festa Blue_R9.jpg' },
  { id: 227, name: 'Festa Red', price: 9.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Festa Red_R9.jpg' },
  { id: 228, name: 'FG', price: 22.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/FG_R22.jpg' },
  { id: 229, name: 'Five Roses ', price: 10.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Five Roses_R10.jpg' },
  { id: 230, name: 'Five Roses ', price: 20.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Five Roses_R20.jpg' },
  { id: 231, name: 'Five Roses', price: 70.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Five Roses_R70.jpg' },
  { id: 232, name: 'Flyers', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Flyers_R5.jpg' },
  { id: 233, name: 'Freshen Powder', price: 5.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Freshen Powder_R5.jpg' },
  { id: 234, name: 'Freshley', price: 16.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Freshley_R16.jpg' },
  { id: 235, name: 'Freshpak ', price: 40.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Freshpak_R40.jpg' },
  { id: 236, name: 'Freshpak ', price: 60.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Freshpak_R60.jpg' },
  { id: 237, name: 'Freshpak', price: 100.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Freshpak_R100.jpg' },
  { id: 238, name: 'Fritos', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Fritos_R10.jpg' },
  { id: 239, name: 'Full-Charger', price: 65.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Full-Charger.jpg', note: 'PRICE MISSING' },
  { id: 240, name: 'Fusion Peach', price: 13.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Fusion Peach_R13.jpg' },
  { id: 241, name: 'Fusion Pineapple', price: 13.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Fusion Pineapple_R13.jpg' },
  { id: 242, name: 'Fusion Tropical', price: 13.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Fusion Tropical_R13.jpg' },
  { id: 243, name: 'G-Vita Cola', price: 2.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita Cola_R2.jpg' },
  { id: 244, name: 'G-Vita Fresh Orange Box', price: 75.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita FrshOrange_R75.jpg' },
  { id: 245, name: 'G-Vita Fruit Cocktail', price: 2.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita FruitCocktial_R2.jpg' },
  { id: 246, name: 'G-Vita Fruit Cocktail Box', price: 75.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita FruitCocktial_R75.jpg' },
  { id: 247, name: 'G-Vita Mango', price: 2.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita Mango_R2.jpg' },
  { id: 248, name: 'G-Vita Orange Box', price: 75.00, cost: 13.30, category: 'POWDER JUICE', stock: 50, image: './images/G-Vita Orange_R75.jpg' },
  { id: 249, name: 'Garlic Salt', price: 25.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Garlic Salt_R25.jpg' },
  { id: 250, name: 'Gaviscon Box', price: 120.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Gaviscon Box_R120.jpg' },
  { id: 251, name: 'Gaviscon', price: 12.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Gaviscon_R12.jpg' },
  { id: 252, name: 'Gillette Blue', price: 12.00, cost: 13.30, category: 'SHAVING', stock: 50, image: './images/Gillete Blue_R12.jpg' },
  { id: 253, name: 'Gillette Red', price: 8.00, cost: 13.30, category: 'SHAVING', stock: 50, image: './images/Gillete Red_R8.jpg' },
  { id: 254, name: 'Glass Small', price: 12.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Glass_R12.jpg' },
  { id: 255, name: 'Glass Large', price: 15.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Glass_R15.jpg' },
  { id: 256, name: 'Glen ', price: 18.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Glen_R17.jpg' },
  { id: 257, name: 'Glen ', price: 27.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Glen_R25.jpg' },
  { id: 258, name: 'Glen ', price: 35.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Glen_R35.jpg' },
  { id: 259, name: 'Glen', price: 45.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Glen_R50.jpg' },
  { id: 261, name: 'Globe 5W', price: 20.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Globe 5W_R20.jpg' },
  { id: 262, name: 'Globe 7W', price: 25.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Globe 7W_R25.jpg' },
  { id: 263, name: 'Globe 9W', price: 30.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Globe 9W_R30.jpg' },
  { id: 264, name: 'Globe 12W', price: 35.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Globe 12W_R35.jpg' },
  { id: 265, name: 'Glucose', price: 4.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Glucose_R4.jpg' },
  { id: 266, name: 'Glue Pot', price: 5.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Glue Pit_R5.jpg' },
  { id: 267, name: 'Glue Stick', price: 20.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/Glue Stick_R20.jpg' },
  { id: 268, name: 'Glycerine Small', price: 18.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Glycerine_R18.jpg' },
  { id: 269, name: 'Glycerine Large', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Glycerine_R20.jpg' },
  { id: 270, name: 'Go-Slos BBQ', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Go-Slos BBQ_R5.jpg' },
  { id: 271, name: 'Go-Slos Cheese & Onion', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Go-Slos Chees&Onion_R5.jpg' },
  { id: 272, name: 'Go-Slos Cheese', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Go-Slos Cheese_R5.jpg' },
  { id: 273, name: 'Go-Slos Chilli Cheese', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Go-Slos Chillicheese_R5.jpg' },
  { id: 274, name: 'Go-Slos Chutney', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Go-Slos Chutney_R5.jpg' },
  { id: 275, name: 'Grand-Pa', price: 3.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Grand-Pa_R3.jpg' },
  { id: 276, name: 'Grape LiquiFruit 1L', price: 32.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Grape LiquiFruit_R32.jpg' },
  { id: 277, name: 'Grape LiquiFruit 2L', price: 55.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Grape LiquiFruit_R50.jpg' },
  { id: 278, name: 'Gripe Water Syrup', price: 45.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/GripeWater Syrup_R45.jpg' },
  { id: 279, name: 'Ground Cinnamon', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Ground Cinnamon_R25.jpg' },
  { id: 280, name: 'Ground Ginger', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Ground Ginger_R25.jpg' },
  { id: 281, name: 'H & I Brown', price: 14.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/H & I Brown_R14.jpg' },
  { id: 282, name: 'H & I White', price: 14.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/H & I White_R14.jpg' },
  { id: 283, name: 'Haarlemensis Syrup', price: 35.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Haarlemmensis Syrup_R35.jpg' },
  { id: 284, name: 'Hair Food', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Hair Food_R35.jpg' },
  { id: 285, name: 'Halls Black', price: 25.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Halls Black_R25.jpg' },
  { id: 286, name: 'Halls Blue', price: 25.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Halls Blue_R25.jpg' },
  { id: 287, name: 'Halls Red', price: 25.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Halls Red_R20.jpg' },
  { id: 288, name: 'Hamburger 5L', price: 70.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Hamburger 5L_R70.jpg' },
  { id: 289, name: 'Handle', price: 85.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Handle_R85.jpg' },
  { id: 290, name: 'Handy Andy', price: 35.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Handy Andy_R35.jpg' },
  { id: 291, name: 'Hind Chicken Spicy', price: 15.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Hind Chicken Spicy_R15.jpg' },
  { id: 292, name: 'Hinds Hot', price: 20.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Hinds Hot_R20.jpg' },
  { id: 293, name: 'Hinds Mild', price: 20.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Hinds Mild_R20.jpg' },
  { id: 294, name: 'Hinds Original', price: 20.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Hinds Original_R20.jpg' },
  { id: 295, name: 'Huggies 2', price: 165.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Huggies2_R165.jpg' },
  { id: 296, name: 'Huggies 3', price: 165.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Huggies3_R165.jpg' },
  { id: 297, name: 'Huggies 4', price: 165.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Huggies4_R165.jpg' },
  { id: 298, name: 'Huggies 5', price: 165.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Huggies5_R165.jpg' },
  { id: 299, name: 'Huggies Wipes', price: 30.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Huggies Wipe_R30.jpg' },
  { id: 300, name: 'Illovo Brown Sugar 1kg', price: 24.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/IllovoBrownSugar1kg_R24.jpg' },
  { id: 302, name: 'Infacare 1 (small)', price: 75.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare1_R75.jpg' },
  { id: 303, name: 'Infacare 1 (large)', price: 300.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare1_R300.jpg' },
  { id: 304, name: 'Infacare 2 (small)', price: 75.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare2_R75.jpg' },
  { id: 305, name: 'Infacare 2 (large)', price: 300.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare2_R300.jpg' },
  { id: 306, name: 'Infacare 3 (small)', price: 75.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare3_R75.jpg' },
  { id: 307, name: 'Infacare 3 (large)', price: 300.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Infacare3_R300.jpg' },
  { id: 308, name: 'Instant Chicken ', price: 5.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Instant Chicken.jpg', note: 'PRICE MISSING' },
  { id: 309, name: 'Instant Curry ', price: 5.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Instant Curry.jpg', note: 'PRICE MISSING' },
  { id: 310, name: 'Instant Durban Curry', price: 5.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Instant Durban Curry.jpg', note: 'PRICE MISSING' },
  { id: 311, name: 'Instant Hot & Spice ', price: 5.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Instant Hot & Spice.jpg', note: 'PRICE MISSING' },
  { id: 312, name: 'Instant Spicy Beef ', price: 5.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Instant Spicy Beef.jpg', note: 'PRICE MISSING' },
  { id: 313, name: 'iPhone', price: 35.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/iPhone.jpg', note: 'INVALID — remove from grocery store unless intentional' },
  { id: 314, name: 'Jacobs', price: 10.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Jacobs_R10.jpg' },
  { id: 315, name: 'Jamaica Ginger Syrup', price: 40.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/JamaikaGemmer Syrup_R40.jpg' },
  { id: 316, name: 'Jeyes Fluid ', price: 20.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jeyes Fluid_R20.jpg' },
  { id: 317, name: 'Jeyes Fluid ', price: 38.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jeyes Fluid_R38.jpg' },
  { id: 318, name: 'Jeyes Fluid ', price: 48.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jeyes Fluid_R48.jpg' },
  { id: 319, name: 'Jik 500ml', price: 25.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jik_20.jpg' },
  { id: 320, name: 'Jik 750ml', price: 30.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jik_R25.jpg' },
  { id: 321, name: 'Johnson Oil', price: 50.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Johnson Oil_R59.jpg' },
  { id: 322, name: 'Johnson Powder', price: 35.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Johnson Powder_R35.jpg' },
  { id: 323, name: 'Johnson Soap', price: 20.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Johnson Soap_R20.jpg' },
  { id: 324, name: 'Johnson 200ml', price: 45.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Johnson_R45.jpg' },
  { id: 325, name: 'Johnsons 500ml', price: 50.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Johnsons_R50.jpg' },
  { id: 326, name: 'Joko ', price: 10.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Joko_R10.jpg' },
  { id: 327, name: 'Joko ', price: 20.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Joko_R20.jpg' },
  { id: 328, name: 'Joko ', price: 60.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Joko_R60.jpg' },
  { id: 329, name: 'Jug', price: 35.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Jug.jpg', note: 'PRICE MISSING' },
  { id: 330, name: 'Jungle', price: 46.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/Jungle_R45.jpg' },
  { id: 331, name: 'Just For Kids', price: 33.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Just For kids_R17.jpg' },
  { id: 332, name: 'Kasi Magic', price: 30.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Kasi Magic_R30.jpg' },
  { id: 333, name: "Kellogg's Beef", price: 30.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Kellogg\'s Beef_R30.jpg' },
  { id: 334, name: "Kellogg's Cheese", price: 30.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Kellogg\'s Cheese_R30.jpg' },
  { id: 335, name: "Kellogg's Chicken", price: 30.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Kellogg\'s Chicken_R30.jpg' },
  { id: 336, name: "Kellogg's Durban Curry", price: 30.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Kellogg\'s Durban Curry_R30.jpg' },
  { id: 337, name: 'Kettle 1.8L', price: 95.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Kettle1.8l.jpg', note: 'PRICE MISSING' },
  { id: 338, name: 'Kettle 2L', price: 120.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Kettle2.jpg', note: 'PRICE MISSING' },
  { id: 340, name: 'KissKids L100', price: 170.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KIDS KIDS L100_R170.jpg' },
  { id: 341, name: 'KissKids M50', price: 100.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KIDS KIDS M50_R100.jpg' },
  { id: 342, name: 'Kitkat', price: 7.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Kikat_R7.jpg' },
  { id: 343, name: 'Kisskids L20', price: 45.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS L20_R45.jpg' },
  { id: 344, name: 'Kisskids M20', price: 45.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS M20_R45.jpg' },
  { id: 345, name: 'Kisskids M100', price: 170.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS M100_R170.jpg' },
  { id: 346, name: 'Kisskids S50', price: 100.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS S50_ R100.jpg' },
  { id: 347, name: 'Kisskids S100', price: 170.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS S100_R170.jpg' },
  { id: 348, name: 'Kisskids Wipes', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Kisskids Wipe_R25.jpg' },
  { id: 349, name: 'Kisskids XL20', price: 45.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS XL20_R45.jpg' },
  { id: 350, name: 'Kisskids XL50', price: 100.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS XL50_R100.jpg' },
  { id: 351, name: 'Kisskids XL100', price: 170.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/KISSKIDS XL100_R170.jpg' },
  { id: 352, name: 'Kisskids', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Kisskids_R25.jpg' },
  { id: 353, name: 'Klim 500g', price: 50.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Klim500_R50.jpg' },
  { id: 354, name: 'Klim 800g', price: 80.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Klim800_R80.jpg' },
  { id: 355, name: 'Knorrox Chicken 100g', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Knorrox Chicken_R20.jpg' },
  { id: 356, name: 'Knorrox Chilli Beef 50g', price: 10.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Knorrox Chilli Beef_R10.jpg' },
  { id: 357, name: 'Knorrox Chilli Beef 200g', price: 35.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Knorrox Chilli Beef_R35.jpg' },
  { id: 359, name: 'Kotex', price: 22.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Kotex_R22.jpg' },
  { id: 360, name: 'Lactogen 1 (small)', price: 85.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen1_R85.jpg' },
  { id: 361, name: 'Lactogen 1 (medium)', price: 200.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen1_R200.jpg' },
  { id: 362, name: 'Lactogen 1 (large)', price: 325.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen1_R325.jpg' },
  { id: 363, name: 'Lactogen 2 (small)', price: 85.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen2_R85.jpg' },
  { id: 364, name: 'Lactogen 2 (medium)', price: 200.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen2_R200.jpg' },
  { id: 365, name: 'Lactogen 2 (large)', price: 325.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen2_R325.jpg' },
  { id: 366, name: 'Lactogen 3 (medium)', price: 200.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen3_R200.jpg' },
  { id: 367, name: 'Lactogen 3 (large)', price: 325.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Lactogen3_R325.jpg' },
  { id: 368, name: "Lay's BBQ", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s BBQ_R23.jpg' },
  { id: 369, name: "Lay's Canadian", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Canadian_R23.jpg' },
  { id: 370, name: "Lay's Caribbean Onion", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Caribbean Onion_R23.jpg' },
  { id: 371, name: "Lay's Cheese & Onion", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Cheese&Onion_R23.jpg' },
  { id: 372, name: "Lay's Mango", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Mango_R22.jpg' },
  { id: 373, name: "Lay's Nashville", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Nashville_R23.jpg' },
  { id: 374, name: "Lay's Salted", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s saltedPotato_R23.jpg' },
  { id: 375, name: "Lay's Sour Cream", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s Sour Cream_R23.jpg' },
  { id: 376, name: "Lay's Sweet Chilli", price: 25.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Lay\'s SweetChilli_R23.jpg' },
  { id: 377, name: 'Lemon Cream', price: 10.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Lemon Cream_R10.jpg' },
  { id: 378, name: 'Lemon Juice', price: 20.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Lemon Juice_R20.jpg' },
  { id: 379, name: 'Lemon Twist', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Lemon Twist_R20.jpg' },
  { id: 380, name: 'Lemon Creams', price: 10.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/LemonCreams_R10.jpg' },
  { id: 381, name: 'Lifebuoy Charcoal', price: 22.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy Charcoal_R20.jpg' },
  { id: 382, name: 'Lifebuoy Herbal', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy Herbal_R17.jpg' },
  { id: 383, name: 'Lifebuoy Honey', price: 22.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy Honey_R17.jpg' },
  { id: 384, name: 'Lifebuoy Lemon', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy Lemon_R17.jpg' },
  { id: 385, name: 'Lifebuoy Mild Care', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy MildCare_R17.jpg' },
  { id: 386, name: 'Lifebuoy Original', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy Original_R17.jpg' },
  { id: 387, name: 'Lifebuoy Tea Tree Oil', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lifebuoy TeaTreeOil_R17.jpg' },
  { id: 389, name: 'Litlets', price: 15.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Litlets_R15.jpg' },
  { id: 390, name: 'Lock ', price: 25.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock 20.jpg', note: 'PRICE MISSING' },
  { id: 391, name: 'Lock ', price: 15.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock_R15.jpg' },
  { id: 392, name: 'Lock ', price: 45.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock_R45.jpg' },
  { id: 393, name: 'Lock ', price: 25.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock_R25.jpg' },
  { id: 394, name: 'Lock ', price: 35.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock_R35.jpg' },
  { id: 395, name: 'Lock ', price: 75.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/Lock_R75.jpg' },
  { id: 396, name: 'Lucky Star Chilli ', price: 18.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Lucky Star Chilli_R18.jpg' },
  { id: 397, name: 'Lucky Star Chilli ', price: 20.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Lucky Star Chilli_R20.jpg' },
  { id: 398, name: 'Lucky Star Chilli ', price: 40.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Lucky Star Chilli_R30.jpg' },
  { id: 399, name: 'Lucky Star Tomato', price: 20.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Lucky Star Tomato_R20.jpg' },
  { id: 400, name: 'Lunch Bar ', price: 17.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/LunchBar 44g_R17.jpg' },
  { id: 401, name: 'Lunch Bar ', price: 7.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/LunchBar_R7.jpg' },
  { id: 402, name: 'Lux Black Orchid', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lux BlackOrchid_R17.jpg' },
  { id: 403, name: 'Lux Egyptian', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lux Egyptian_R17.jpg' },
  { id: 404, name: 'Lux Mint Oil', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lux MintOil_R17.jpg' },
  { id: 405, name: 'Lux Soft Caress', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lux SoftCaress_R17.jpg' },
  { id: 406, name: 'Lux Soft Touch', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Lux SoftTouch_R17.jpg' },
  { id: 408, name: 'Luxury Tissue', price: 30.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Luxury Tissue_R30.jpg' },
  { id: 409, name: 'Mabela 1kg', price: 25.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mabela 1kg_25.jpg' },
  { id: 410, name: 'Mabela 2kg', price: 35.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mabela 2kg_R35.jpg' },
  { id: 411, name: 'Mabella 5kg', price: 85.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mabella 5kg_R85.jpg' },
  { id: 412, name: 'Macaroni', price: 19.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/Macaroni_R19.jpg' },
  { id: 413, name: 'Magazine', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Magazine_R20.jpg' },
  { id: 414, name: 'Maggi Beef', price: 8.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Beef_R8.jpg' },
  { id: 415, name: 'Maggi Beef', price: 35.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Beef_R35.jpg' },
  { id: 416, name: 'Maggi Cheese', price: 35.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Cheese_R35.jpg' },
  { id: 417, name: 'Maggi Chicken ', price: 8.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Chicken68g.jpg', note: 'PRICE MISSING' },
  { id: 418, name: 'Maggi Chicken ', price: 8.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Chicken_R8.jpg' },
  { id: 419, name: 'Maggi Chicken ', price: 35.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Chicken_R35.jpg' },
  { id: 420, name: 'Maggi Durban Curry', price: 8.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi Durban Curry_R8.jpg' },
  { id: 422, name: 'Maggi Durban Curry ', price: 35.00, cost: 13.30, category: 'NOODLES', stock: 50, image: './images/Maggi DurbanCurry_R35.jpg' },
  { id: 423, name: 'Mamas 750g', price: 28.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mamas750g_28.jpg' },
  { id: 424, name: 'Manzi 1.5L', price: 13.00, cost: 13.30, category: 'WATER', stock: 50, image: './images/Manzi 1.5L_R13.jpg' },
  { id: 425, name: 'Manzi 10L', price: 50.00, cost: 13.30, category: 'WATER', stock: 50, image: './images/Manzi 10L_R40.jpg' },
  { id: 426, name: 'Manzi 500ml', price: 6.00, cost: 13.30, category: 'WATER', stock: 50, image: './images/Manzi 500ML_R6.jpg' },
  { id: 427, name: 'Maputo 1kg', price: 22.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Maputo 1kg_R22.jpg' },
  { id: 428, name: 'Maputo 2kg', price: 40.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Maputo 2kg_R40.jpg' },
  { id: 429, name: 'Maputo 5kg', price: 85.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Maputo 5kg_R90.jpg' },
  { id: 430, name: 'Maputo 10kg', price: 160.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Maputo 10kg_R160.jpg' },
  { id: 431, name: 'Maputo 500g', price: 15.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Maputo 500g_R15.jpg' },
  { id: 432, name: 'MAQ Box 1kg', price: 560.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ BOX 1kg_R520.jpg' },
  { id: 433, name: 'MAQ Box 2kg', price: 560.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ BOX 2kg_R520.jpg' },
  { id: 434, name: 'MAQ Box 3kg', price: 560.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ BOX 3kg_R520.jpg' },
  { id: 435, name: 'MAQ Dishwash', price: 35.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Dishwash_R35.jpg' },
  { id: 436, name: 'MAQ Lavender ', price: 27.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Lavender_R27.jpg' },
  { id: 437, name: 'MAQ Lavender ', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Lavender_R32.jpg' },
  { id: 438, name: 'MAQ Silk ', price: 27.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Silk_R27.jpg' },
  { id: 439, name: 'MAQ Silk ', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Silk_R32.jpg' },
  { id: 440, name: 'MAQ Silk ', price: 40.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Silk_R40.jpg' },
  { id: 441, name: 'MAQ Washing Powder 500g', price: 27.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ Washing Powder_R27.jpg' },
  { id: 442, name: 'MAQ Washing Powder 2kg', price: 70.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ WashingPowder_R67.jpg' },
  { id: 443, name: 'MAQ Washing Powder 5kg', price: 115.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/MAQ WashingPowder_R110.jpg' },
  { id: 444, name: 'Maria', price: 10.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Maria_R10.jpg' },
  { id: 445, name: 'Mariana 500g', price: 15.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/Mariana500g_R15.jpg' },
  { id: 446, name: 'Masala', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Masala_R20.jpg' },
  { id: 447, name: 'Matches Lion', price: 1.50, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Matches Lion_R1.5.jpg' },
  { id: 448, name: 'Matches', price: 0.50, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Matches_R0.5.jpg' },
  { id: 449, name: 'Maynards', price: 15.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Maynards_R15.jpg' },
  { id: 450, name: 'Mayo 750g', price: 37.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayo 750g_R28.jpg' },
  { id: 451, name: 'Mayonnaise 250g', price: 28.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise 250g_R28.jpg' },
  { id: 452, name: 'Mayonnaise 500g', price: 32.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise 500g_R32.jpg' },
  { id: 453, name: 'Mayonnaise Excella', price: 37.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise Excella_R37.jpg' },
  { id: 454, name: 'Mayonnaise Original 750g', price: 44.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise Original_R43.jpg' },
  { id: 455, name: 'Mayonnaise Original 2L', price: 95.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise Original_R95.jpg' },
  { id: 456, name: 'Mayonnaise Original 5L', price: 175.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Mayonnaise Original_R175.jpg' },
  { id: 457, name: 'Mealie King 10kg', price: 85.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mealie king 10kg_R80.jpg' },
  { id: 458, name: 'Mealie King 12.5kg', price: 97.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mealie king 12.5kg_R95.jpg' },
  { id: 459, name: 'Mealie King 25kg', price: 190.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mealie king 25kg_R190.jpg' },
  { id: 460, name: 'Mealie King 50kg', price: 390.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Mealie king 50kg_R380.jpg' },
  { id: 461, name: 'Med-Lemon', price: 10.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Med-Lemon_R10.jpg' },
  { id: 462, name: 'Milk Clover 2L', price: 38.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Milk Clover_R38.jpg' },
  { id: 463, name: 'Minestrone Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Minestrone_R6.jpg' },
  { id: 464, name: 'Mixed Fruit', price: 40.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Mixed Fruit_R40.jpg' },
  { id: 465, name: 'Mixed Herbs', price: 25.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Mixed Herbs_R25.jpg' },
  { id: 466, name: 'Monster Original', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Monster Original_R20.jpg' },
  { id: 467, name: 'Monster The Doctor', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Monster TheDoctor_R20.jpg' },
  { id: 468, name: 'Monster Watermelon', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Monster Watermelon_R20.jpg' },
  { id: 469, name: 'Moreson', price: 65.00, cost: 13.30, category: 'EGGS', stock: 50, image: './images/Moreson_R65.jpg' },
  { id: 470, name: 'Morvite', price: 33.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Morvite_R30.jpg' },
  { id: 471, name: 'Mountain Honey 200g', price: 20.00, cost: 13.30, category: 'HONEY', stock: 50, image: './images/Mountain Honey 200g_R20.jpg' },
  { id: 472, name: 'Mountain Honey 300g', price: 28.00, cost: 13.30, category: 'HONEY', stock: 50, image: './images/Mountain Honey 300g_R28.jpg' },
  { id: 473, name: 'Mountain Honey 375g', price: 35.00, cost: 13.30, category: 'HONEY', stock: 50, image: './images/Mountain Honey 375g_R35.jpg' },
  { id: 474, name: 'Mountain Honey 500g', price: 40.00, cost: 13.30, category: 'HONEY', stock: 50, image: './images/Mountain Honey 500g_R40.jpg' },
  { id: 475, name: 'MPL Hair Oil', price: 47.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/MPL HairOil_R47.jpg' },
  { id: 476, name: 'Mr Bean', price: 45.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Mr Bean_R40.jpg' },
  { id: 477, name: 'Mug', price: 22.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Mug_R22.jpg' },
  { id: 478, name: 'Muthi Wenyoni Syrup', price: 35.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Muthiwenyoni Syrup_R35.jpg' },
  { id: 479, name: 'Nan 1', price: 135.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nan1_R135.jpg' },
  { id: 480, name: 'Nan 2', price: 135.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nan2_R135.jpg' },
  { id: 481, name: 'Nespray', price: 70.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nespray_R70.jpg' },
  { id: 482, name: 'Nestum Maize', price: 35.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nestum Maize_R35.jpg' },
  { id: 483, name: 'Nestum Regular Wheat 250g', price: 35.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nestum RegularWheat_R35.jpg' },
  { id: 484, name: 'Nestum Regular Wheat 500g', price: 60.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nestum RegularWheat_R60.jpg' },
  { id: 485, name: 'Nestum', price: 35.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nesturm_R35.jpg' },
  { id: 486, name: 'NiceOne 1kg', price: 38.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/NiceOne1kg_R35.jpg' },
  { id: 487, name: 'NiceOne 500g', price: 21.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/NiceOne500g_R21.jpg' },
  { id: 488, name: 'NiceOne 2kg', price: 55.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/NiceOne 2kg_R50.jpg' },
  { id: 489, name: 'Nido 900g', price: 200.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Nido900g_R200.jpg' },
  { id: 490, name: 'Nik Naks', price: 1.50, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Nik Nake_R1.5.jpg' },
  { id: 491, name: 'Nivea Cool Kick 250ml', price: 75.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Nivea Cool Kick_R75.jpg' },
  { id: 492, name: 'Nivea Cool Kick 150ml', price: 32.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Nivea CoolKick_R32.jpg' },
  { id: 493, name: 'Nivea Deep', price: 75.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Nivea Deep_R75.jpg' },
  { id: 494, name: 'Nivea Rich Nourishing', price: 55.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Nivea Rich Nourishing_R55.jpg' },
  { id: 495, name: 'Nivea Spray', price: 48.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Nivea Spray_R48.jpg' },
  { id: 496, name: 'Nola Mayo 750g', price: 35.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/NolaMayo750g_R35.jpg' },
  { id: 497, name: 'Nolla Original 250g', price: 25.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Original_R25.jpg' },
  { id: 498, name: 'Nolla Original 500g', price: 32.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Original_R32.jpg' },
  { id: 499, name: 'Nolla Original 750g', price: 40.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Original_R40.jpg' },
  { id: 500, name: 'Nolla Original 2KG', price: 90.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Original_R90.jpg' },
  { id: 501, name: 'Nolla Original 5KG', price: 165.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Original_R165.jpg' },
  { id: 502, name: 'Nolla Ultra', price: 50.00, cost: 13.30, category: 'MAYONNAISE', stock: 50, image: './images/Nolla Ultra_R50.jpg' },
  { id: 503, name: 'Normal Cable', price: 35.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Normal Cable_R35.jpg' },
  { id: 504, name: 'Nutriday', price: 30.00, cost: 13.30, category: 'YOGHUT', stock: 50, image: './images/Nutriday_R30.jpg' },
  { id: 505, name: 'Oats 500g', price: 35.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/Oats500g_R35.jpg' },
  { id: 506, name: 'Omo 500g', price: 15.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Omo_R15.jpg' },
  { id: 507, name: 'Omo 1kg', price: 25.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Omo_R25.jpg' },
  { id: 508, name: 'Omo 2kg', price: 40.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Omo_R40.jpg' },
  { id: 509, name: 'Orange LiquiFruit 2L', price: 50.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Orange LiquiFruit_R50.jpg' },
  { id: 510, name: 'Oreo', price: 10.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Oreo_R10.jpg' },
  { id: 511, name: 'Origanum', price: 25.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Origanum_R25.jpg' },
  { id: 512, name: 'Oros 2L', price: 40.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Oros 2L_R40.jpg' },
  { id: 513, name: 'Oros 5L', price: 95.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Oros 5L_R95.jpg' },
  { id: 514, name: 'P-S', price: 7.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/P-S_R7.jpg' },
  { id: 515, name: 'Pampers 2', price: 215.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pampers2_R215.jpg' },
  { id: 516, name: 'Pampers 3', price: 215.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pampers3_R215.jpg' },
  { id: 517, name: 'Pampers 4', price: 215.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pampers4_R215.jpg' },
  { id: 518, name: 'Pampers 5', price: 215.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pampers5_R215.jpg' },
  { id: 519, name: 'Pampers', price: 40.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pampers_R40.jpg' },
  { id: 520, name: 'Pan Palm 20L', price: 600.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Pan Palm 20L_R620.jpg' },
  { id: 521, name: 'Panado Syrup', price: 40.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Panado Syrup_R40.jpg' },
  { id: 522, name: 'Panado', price: 3.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Panado_R3.jpg' },
  { id: 523, name: 'Panda Paraffin Stove', price: 175.00, cost: 13.30, category: 'HARDWARE', stock: 50, image: './images/PANDA-PARAFFIN-STOVE_R175.jpg' },
  { id: 524, name: 'Paprika', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Paprika_R25.jpg' },
  { id: 525, name: 'Parmalat Milk 1L', price: 19.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/Parmalat Milk_R19.jpg' },
  { id: 526, name: 'PastaJoy 3kg', price: 90.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/PastaJoy3kg_R90.jpg' },
  { id: 527, name: 'PastaJoy 500g', price: 17.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/PastaJoy500g_R17.jpg' },
  { id: 528, name: 'Peaches & Yoghurt', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Peaches&yoghurt_R17.jpg' },
  { id: 529, name: 'Pelagron 400g', price: 100.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Pelagron400g_R100.jpg' },
  { id: 530, name: 'Pelepele Naks', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Pelepele Naks_R5.jpg' },
  { id: 531, name: 'Pepsi Zero', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Pepsi Zero_R29.jpg' },
  { id: 532, name: 'Pepsi 2L', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Pepsi_R20.jpg' },
  { id: 533, name: 'Peri Peri', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Peri Peri_R3.jpg' },
  { id: 534, name: 'Petroleum Jelly', price: 40.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Petrolium Jelly_R40.jpg' },
  { id: 535, name: 'Pilot Black', price: 4.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/Pilot Black_R4.jpg' },
  { id: 536, name: 'Pilot Blue', price: 4.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/Pilot Blue_R4.jpg' },
  { id: 537, name: 'Pilot Glass', price: 4.00, cost: 13.30, category: 'BOOKS', stock: 50, image: './images/Pilot Glass_R4.jpg' },
  { id: 539, name: 'Pinpop', price: 45.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Pinpop_R45.jpg' },
  { id: 540, name: 'Pitsana 5kg', price: 40.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Pitsana 5kg_R40.jpg' },
  { id: 541, name: 'Pitsana 12.5kg', price: 85.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Pitsana 12.5kg_R80.jpg' },
  { id: 542, name: 'Plastic Cup', price: 5.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Plactic Cup_R5.jpg' },
  { id: 543, name: 'Play', price: 18.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Play_R18.jpg' },
  { id: 544, name: 'Playboy Atlanta', price: 45.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayBoy Atlanta_R45.jpg' },
  { id: 545, name: 'Playboy Cream', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayBoy Cream_R35.jpg' },
  { id: 546, name: 'Playboy Even Tone', price: 45.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayBoy EvenTone_R45.jpg' },
  { id: 547, name: 'Playboy Flirtatious', price: 22.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayBoy Flirtatious_R22.jpg' },
  { id: 548, name: 'Playboy Limitless', price: 22.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayBoy Limitles_R22.jpg' },
  { id: 549, name: 'Playgirl Love', price: 22.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayGirl Love_R22.jpg' },
  { id: 550, name: 'Playgirl Seduction', price: 22.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayGirl Seduction_R22.jpg' },
  { id: 551, name: 'Playgirl ', price: 45.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/PlayGirl_R45.jpg' },
  { id: 552, name: 'Playgirl ', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Playgril_R35.jpg' },
  { id: 553, name: 'Plug Charger', price: 45.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Plug-Charger_R45.jpg' },
  { id: 554, name: 'Plug Small', price: 25.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Plug_R25.jpg' },
  { id: 555, name: 'Plug Large', price: 30.00, cost: 13.30, category: 'ELECTRICALS', stock: 50, image: './images/Plug_R30.jpg' },
  { id: 556, name: 'Polana 3kg', price: 80.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/Polana3kg_R90.jpg' },
  { id: 557, name: 'Popcorn 1kg', price: 30.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Popcorn1kg_R30.jpg' },
  { id: 558, name: 'Popcorn 500g', price: 16.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Popcorn500g_R16.jpg' },
  { id: 559, name: 'Popshot', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Popshot_R5.jpg' },
  { id: 560, name: 'Portuguese Chicken Spice', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Portuguese Chicken_R3.jpg' },
  { id: 561, name: 'Pregnancy Test', price: 10.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Pregnant Test_R10.jpg' },
  { id: 562, name: 'Pride 2.5kg', price: 28.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Pride 2.5kg_R28.jpg' },
  { id: 563, name: 'Pride 12.5kg', price: 87.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Pride 12.5kg_R85.jpg' },
  { id: 564, name: 'Protex Deep Clean', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex DeepClean_R17.jpg' },
  { id: 565, name: 'Protex Fresh', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex Fresh_R17.jpg' },
  { id: 566, name: 'Protex Gentle', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex Gentle_R17.jpg' },
  { id: 567, name: 'Protex Herbal', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex Herbal_R17.jpg' },
  { id: 568, name: 'Protex Odour Control', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex OdourControl_R17.jpg' },
  { id: 569, name: 'Protex Sensitive', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex Sensitive_R17.jpg' },
  { id: 570, name: 'Protex Sports', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex Sports_R17.jpg' },
  { id: 571, name: 'Protex Tissue Oil', price: 17.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Protex TissueOil_R17.jpg' },
  { id: 572, name: 'Purity Apple & Yoghurt', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Apple&yoghurt_R17.jpg' },
  { id: 573, name: 'Purity Banana & Mango', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Banana&Mango_R17.jpg' },
  { id: 574, name: 'Purity Banana', price: 28.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Banana_R28.jpg' },
  { id: 575, name: 'Purity Butternut', price: 20.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Butternut_R20.jpg' },
  { id: 576, name: 'Purity Baby Yogi', price: 22.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity bYogi_R22.jpg' },
  { id: 577, name: 'Purity Carrot', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Carrot_R17.jpg' },
  { id: 578, name: 'Purity Four Fruit', price: 20.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity FourFruit_R20.jpg' },
  { id: 579, name: 'Purity Fruit', price: 18.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Fruit__R18.jpg' },
  { id: 580, name: 'Purity Fruit Custard', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Fruit_Custard_R17.jpg' },
  { id: 582, name: 'Purity Guava', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Guava_R17.jpg' },
  { id: 583, name: 'Purity Mix Vegetable ', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Mix vegetable_R17.jpg' },
  { id: 584, name: 'Purity Mix Vegetable ', price: 28.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity MixVegetable_R28.jpg' },
  { id: 585, name: 'Purity Mix Vegetables ', price: 20.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity MixVegetables_R20.jpg' },
  { id: 587, name: 'Purity Original', price: 28.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Original_R28.jpg' },
  { id: 588, name: 'Purity Pear Banana', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity PearBanana_R17.jpg' },
  { id: 589, name: 'Purity Prunes', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Prunes_R17.jpg' },
  { id: 590, name: 'Purity Sweet Potato', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Sweetpotato_R17.jpg' },
  { id: 591, name: 'Purity Vanilla ', price: 17.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Vanilla_R17.jpg' },
  { id: 592, name: 'Purity Vanilla ', price: 20.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Vanilla_R20.jpg' },
  { id: 593, name: 'Purity Veggie', price: 18.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity Veggi_R18.jpg' },
  { id: 594, name: 'Purity Yoghurt & Fruit', price: 22.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/Purity yoghurt&Fruit_R22.jpg' },
  { id: 595, name: 'Quartz 500', price: 40.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/QUARTZ500_R40.jpg' },
  { id: 596, name: 'Rajah All in One 50g', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah All in one_R3.jpg' },
  { id: 597, name: 'Rajah All in One 200g', price: 28.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah All in one_R28.jpg' },
  { id: 598, name: 'Rajah Curry Powder 50g', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Curry Powder_R3.jpg' },
  { id: 599, name: 'Rajah Curry Powder 200g', price: 28.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Curry Powder_R28.jpg' },
  { id: 600, name: 'Rajah Curry Powder 400g', price: 37.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Curry Powder_R37.jpg' },
  { id: 601, name: 'Rajah Hot 50g', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Hot_R3.jpg' },
  { id: 602, name: 'Rajah Mild & Spicy 200g', price: 28.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Mild&Spicy_R28.jpg' },
  { id: 604, name: 'Rajah Mild & Spicy 50g', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Rajah Mild&spicy_R3.jpg' },
  { id: 605, name: 'Rama 250g', price: 30.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Rama_R30.jpg' },
  { id: 606, name: 'Rama 500g', price: 40.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Rama_R40.jpg' },
  { id: 607, name: 'Real Boss', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Real Boos_R35.jpg' },
  { id: 608, name: 'Reboost Original', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Reboost Original_R10.jpg' },
  { id: 609, name: 'Reboost Watermelon', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Reboost Watermelon_R10.jpg' },
  { id: 610, name: 'Recoffry', price: 150.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Recoffry_R150.jpg' },
  { id: 611, name: 'Red Beans 500g', price: 20.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Red Beans_R20.jpg' },
  { id: 612, name: 'Red Beans 2kg', price: 68.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Red Beans_R68.jpg' },
  { id: 613, name: 'Red Label', price: 25.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Red Label_R25.jpg' },
  { id: 614, name: 'Red Lentils', price: 20.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Red Lentils_R20.jpg' },
  { id: 615, name: 'Red Bean 500g', price: 20.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/RedBean500g_R20.jpg' },
  { id: 616, name: 'Red Beans 1kg', price: 38.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/RedBeans1kg.jpg', note: 'PRICE MISSING' },
  { id: 617, name: 'Red Bull 250ml', price: 20.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/RedBull_R19.jpg' },
  { id: 618, name: 'Red Bull 355ml', price: 28.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/RedBull_R28.jpg' },
  { id: 619, name: 'Red Bull 473ml', price: 35.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/RedBull_R35.jpg' },
  { id: 620, name: 'Rich Man', price: 35.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Rich Man_R35.jpg' },
  { id: 621, name: 'Rich Oxtail Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Rich Oxtail_R6.jpg' },
  { id: 622, name: 'Romany Creams', price: 40.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Romany Creams_R39.jpg' },
  { id: 623, name: 'Romi 1kg', price: 35.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Romi 1kg_R35.jpg' },
  { id: 624, name: 'Romi 500g', price: 16.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Romi 500g_R16.jpg' },
  { id: 625, name: 'Rondo 500g', price: 18.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Rondo 500g_R18.jpg' },
  { id: 626, name: 'Royal 500g', price: 60.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Royal500g_R55.jpg' },
  { id: 627, name: 'Royal 200g', price: 42.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Royal 200g_R42.jpg' },
  { id: 628, name: 'Samp & Beans', price: 18.00, cost: 13.30, category: 'ROW FOODS', stock: 50, image: './images/Samp & Beans_R18.jpg' },
  { id: 629, name: 'Sardines 120g', price: 25.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Sardines 120g_R25.jpg' },
  { id: 630, name: 'Sarine Tissue', price: 25.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Sarine Tissue_R25.jpg' },
  { id: 631, name: 'Sasko Brown', price: 17.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Sasko Brown_R17.jpg' },
  { id: 632, name: 'Sasko White', price: 18.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Sasko White_R19.jpg' },
  { id: 633, name: 'Satiskin', price: 75.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Satiskin_R75.jpg' },
  { id: 634, name: 'Save 1kg', price: 18.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Save 1kg_R18.jpg' },
  { id: 635, name: 'Save 2kg', price: 28.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Save 2kg_R28.jpg' },
  { id: 636, name: 'Save 5kg', price: 58.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Save 5kg_R58.jpg' },
  { id: 637, name: 'Save 10kg', price: 105.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Save 10kg_R105.jpg' },
  { id: 638, name: 'Save 500g', price: 10.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Save 500g_R10.jpg' },
  { id: 639, name: 'Score Original', price: 12.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Score Original_R12.jpg' },
  { id: 640, name: 'Securex Active', price: 15.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Securex Active_R15.jpg' },
  { id: 641, name: 'Securex Care', price: 15.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Securex Care_R15.jpg' },
  { id: 642, name: 'Securex Fresh', price: 15.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Securex Fresh_R15.jpg' },
  { id: 643, name: 'Securex Herbal', price: 15.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Securex Herbal_R15.jpg' },
  { id: 644, name: 'Selati Brown 500g', price: 15.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar Brown_R15.jpg' },
  { id: 645, name: 'Selati Brown 1kg', price: 27.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar Brown_R27.jpg' },
  { id: 646, name: 'Selati Brown 2kg', price: 48.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar Brown_R45.jpg' },
  { id: 647, name: 'Selati Brown 5kg', price: 110.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar Brown_R105.jpg' },
  { id: 648, name: 'Selati White 250g', price: 12.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R10.jpg' },
  { id: 649, name: 'Selati White 500g', price: 18.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R18.jpg' },
  { id: 650, name: 'Selati White 1kg', price: 32.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R30.jpg' },
  { id: 651, name: 'Selati White 2.5kg', price: 63.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R60.jpg' },
  { id: 652, name: 'Selati White 5kg', price: 125.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R125.jpg' },
  { id: 653, name: 'Selati White 10kg', price: 235.00, cost: 13.30, category: 'SUGAR', stock: 50, image: './images/Selati Sugar White_R235.jpg' },
  { id: 654, name: 'Self Raising Flour 1kg', price: 25.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Self Raising_R25.jpg' },
  { id: 655, name: 'Self Raising Flour 2.5kg', price: 55.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Self Raising_R55.jpg' },
  { id: 658, name: 'Sheen Apple', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Apple_R50.jpg' },
  { id: 659, name: 'Sheen Cherry', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen cherry_R50.jpg' },
  { id: 660, name: 'Sheen Fresh Start', price: 75.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen FreshStart_R75.jpg' },
  { id: 661, name: 'Sheen Musk 50ml', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Musk50.jpg' },
  { id: 662, name: 'Sheen Musk 100ml', price: 75.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Musk_R75.jpg' },
  { id: 663, name: 'Sheen Nu-Car', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Nu-car_R50.jpg' },
  { id: 664, name: 'Sheen Strawberry 50ml', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Strawberry_R50.jpg' },
  { id: 665, name: 'Sheen Strawberry 100ml', price: 75.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Sheen Strawberry_R75.jpg' },
  { id: 666, name: 'Shisanyama', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Shisanyama_R3.jpg' },
  { id: 667, name: 'Shower to Shower', price: 22.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Shower to Shower_R22.jpg' },
  { id: 668, name: 'Simba Cheese & Onion', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba Cheese& Onion_R22.jpg' },
  { id: 669, name: 'Simba Chutney', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba Chutney_R22.jpg' },
  { id: 670, name: 'Simba Creamy Cheddar', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba CreamyCheddar_R22.jpg' },
  { id: 671, name: 'Simba KFC', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba KFC_R22.jpg' },
  { id: 672, name: 'Simba Mexican', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba Maxican_R22.jpg' },
  { id: 673, name: 'Simba Salt & Vanilla', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba Salt& Vanilla_R22.jpg' },
  { id: 674, name: 'Simba Smoked Beef', price: 22.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Simba SmokedBeef_R22.jpg' },
  { id: 675, name: 'Six Gun', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Six Gun_R25.jpg' },
  { id: 676, name: 'Sixo Orange 200ml', price: 22.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/Sixo Orange200ml_R24.jpg' },
  { id: 677, name: 'Sixo Cola 200ml', price: 22.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/SixoCola200ml_R24.jpg' },
  { id: 678, name: 'Sixo Raspberry 200ml', price: 22.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/SixoRespberry200ml_R24.jpg' },
  { id: 679, name: 'Smarties', price: 7.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Smarties_R7.jpg' },
  { id: 680, name: 'Smooth Apricot Jam', price: 45.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Smooth Apricotjana_R45.jpg' },
  { id: 681, name: 'Snak Naks', price: 5.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Snak Naks_R5.jpg' },
  { id: 682, name: 'Snappers', price: 7.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Snappers_R7.jpg' },
  { id: 683, name: 'Snow Soft', price: 20.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Snow Soft_R20.jpg' },
  { id: 684, name: 'Snowflake 2.5kg', price: 40.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Snowflake 2.5kg_R40.jpg' },
  { id: 685, name: 'Snowflake 5kg', price: 75.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Snowflake 5kg_R75.jpg' },
  { id: 686, name: 'Snowflake 12.5kg', price: 150.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Snowflake 12.5kg_R150.jpg' },
  { id: 687, name: 'Snowflake Baking Powder 50g', price: 10.00, cost: 13.30, category: 'BAKING', stock: 50, image: './images/SnowFlakeBaking_50g_R10.jpg' },
  { id: 688, name: 'SofnFree 250g', price: 28.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/SofnFree_R28.jpg' },
  { id: 689, name: 'SofnFree 500g', price: 40.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/SofnFree_R40.jpg' },
  { id: 690, name: 'Soup Chilli Beef', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soup Chilli Beef_R20.jpg' },
  { id: 691, name: 'Soup Mutton', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soup Mutton_R20.jpg' },
  { id: 692, name: 'Soup Oxtail', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soup Oxtail_R20.jpg' },
  { id: 693, name: 'Soup Mix', price: 20.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soupmix_R20.jpg' },
  { id: 694, name: 'Soya Mince Chilli Beef 50g', price: 12.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soya Mince Chilli Beef_R12.jpg' },
  { id: 695, name: 'Soya Mince Chilli Beef 200g', price: 30.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soya Mince Chilli Beef_R30.jpg' },
  { id: 696, name: 'Soya Mince Mutton', price: 30.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Soya Mince Mutton_R30.jpg' },
  { id: 697, name: 'Spaghetti', price: 19.00, cost: 13.30, category: 'PASTA', stock: 50, image: './images/Spaghetti_R19.jpg' },
  { id: 698, name: 'Sparletta Apple Rush', price: 22.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sparletta AppleRush_R20.jpg' },
  { id: 699, name: 'Sparletta Cream Soda', price: 22.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sparletta Cream-Soda_R20.jpg' },
  { id: 700, name: 'Sparletta Iron Brew', price: 22.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sparletta IronBrew_R20.jpg' },
  { id: 701, name: 'Sparletta Pine Nut', price: 22.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sparletta PineNut_R20.jpg' },
  { id: 702, name: 'Sparletta Sparberry', price: 22.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sparletta Sparberry_R20.jpg' },
  { id: 703, name: 'Spekko 500g', price: 15.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Spekko_R15.jpg' },
  { id: 704, name: 'Spekko 1kg', price: 25.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Spekko_R25.jpg' },
  { id: 705, name: 'Spekko 2kg', price: 38.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Spekko_R38.jpg' },
  { id: 706, name: 'Spekko 5kg', price: 85.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Spekko_R85.jpg' },
  { id: 707, name: 'Spekko 10kg', price: 140.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Spekko_R140.jpg' },
  { id: 708, name: 'Spice For Rice', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Spice For Rice_R3.jpg' },
  { id: 709, name: 'Spicy Barbecue', price: 3.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Spicy Barbecue_R3.jpg' },
  { id: 710, name: 'Spicy Beef', price: 5.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Spicybeef_R5.jpg' },
  { id: 711, name: 'Sprite 2L', price: 25.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Sprite_R25.jpg' },
  { id: 712, name: 'Sta-Soft Baby', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Baby_R32.jpg' },
  { id: 713, name: 'Sta-Soft Dream', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Dream_R32.jpg' },
  { id: 714, name: 'Sta-Soft Lavender', price: 50.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Lavender_R50.jpg' },
  { id: 715, name: 'Sta-Soft Passion 32s', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Passion_R32.jpg' },
  { id: 716, name: 'Sta-Soft Passion 50s', price: 50.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Passion_R50.jpg' },
  { id: 717, name: 'Sta-Soft Relax', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft Relax_R32.jpg' },
  { id: 718, name: 'Sta-Soft Spring Fresh', price: 50.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft SpringFresh_R50.jpg' },
  { id: 719, name: 'Sta-Soft', price: 32.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sta-Soft_R32.jpg' },
  { id: 720, name: 'Stametta Syrup', price: 40.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Stamatta Syrup_R40.jpg' },
  { id: 722, name: 'Stayfree', price: 20.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Stayfree_R20.jpg' },
  { id: 723, name: 'Stoney 2L', price: 25.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Stoney_R25.jpg' },
  { id: 724, name: 'Stork', price: 55.00, cost: 13.30, category: 'RAMA', stock: 50, image: './images/Stork_R55.jpg' },
  { id: 725, name: 'Stumbo 1', price: 18.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Stumbo1.jpg', note: 'PRICE MISSING' },
  { id: 726, name: 'Stumbo 2.5', price: 35.00, cost: 13.30, category: 'SWEETS', stock: 50, image: './images/Stumbo2.jpg', note: 'PRICE MISSING' },
  { id: 727, name: 'Stylos', price: 7.00, cost: 13.30, category: 'SNACKS', stock: 50, image: './images/Stylos_R7.jpg' },
  { id: 728, name: 'Sunbake Brown', price: 16.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Sunbake Brown_R19.jpg' },
  { id: 729, name: 'Sunbake White', price: 17.00, cost: 13.30, category: 'BREADS', stock: 50, image: './images/Sunbake White_R20.jpg' },
  { id: 730, name: 'Sunlight  500g', price: 25.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sunlight_R25.jpg' },
  { id: 731, name: 'Sunlight  2Kg', price: 60.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sunlight_R65.jpg' },
  { id: 732, name: 'Sunlight Dishwash', price: 35.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sunlight DishWash_R35.jpg' },
  { id: 733, name: 'Sunlight Soap', price: 25.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Sunlight Soap_R25.jpg' },
  { id: 734, name: 'Sunlight Powder', price: 40.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Sunlight_R40.jpg' },
  { id: 735, name: 'Sunstar 2L', price: 60.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar 2L_R60.jpg' },
  { id: 736, name: 'Sunstar 5L', price: 148.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar 5L_R145.jpg' },
  { id: 737, name: 'Sunstar 375ml', price: 18.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar 375ml_R18.jpg' },
  { id: 738, name: 'Sunstar 750ml', price: 30.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar 750ml_R30.jpg' },
  { id: 739, name: 'Sunstar Box 2L', price: 700.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar Box 2L_R700.jpg' },
  { id: 740, name: 'Sunstar Box 5L', price: 590.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar Box 5L_R580.jpg' },
  { id: 741, name: 'Sunstar Box 12x375ml', price: 200.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar Box 12X375ml_R200.jpg' },
  { id: 742, name: 'Sunstar Box 750ml', price: 350.00, cost: 13.30, category: 'OIL', stock: 50, image: './images/Sunstar Box 750ml_R350.jpg' },
  { id: 743, name: 'Super Mabela', price: 48.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/Super Mabela_R48.jpg' },
  { id: 744, name: 'Super-C', price: 12.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Super-C_R12.jpg' },
  { id: 746, name: 'Superem 2.5kg', price: 40.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Superem 2.5kg_R40.jpg' },
  { id: 747, name: 'Superem 5kg', price: 75.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Superem 5kg_R75.jpg' },
  { id: 748, name: 'Superem 12.5kg', price: 136.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Superem 12.5kg_R136.jpg' },
  { id: 749, name: 'Super Mabela 5kg', price: 115.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/SuperMabela5kg_R115.jpg' },
  { id: 750, name: 'SuperMax', price: 3.00, cost: 13.30, category: 'SHAVING', stock: 50, image: './images/SuperMax_R3.jpg' },
  { id: 751, name: 'Surf 250g', price: 15.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Surf_R15.jpg' },
  { id: 752, name: 'Surf 500kg', price: 25.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Surf_R25.jpg' },
  { id: 753, name: 'Surf 1kg', price: 38.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Surf_R38.jpg' },
  { id: 754, name: 'Surf 2kg', price: 58.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Surf_R60.jpg' },
  { id: 755, name: 'Sweet Chilli Sauce', price: 32.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Sweet Chilli_R32.jpg' },
  { id: 756, name: 'Switch Babies', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch Babies_R10.jpg' },
  { id: 757, name: 'Switch Dry Lemon', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch DryLemon_R10.jpg' },
  { id: 758, name: 'Switch Element', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch Element_R10.jpg' },
  { id: 760, name: 'Switch Iron Brew', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch IronBrew_R10.jpg' },
  { id: 761, name: 'Switch Original', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch Original_R10.jpg' },
  { id: 762, name: 'Switch Tropical', price: 10.00, cost: 13.30, category: 'COOL DRINK', stock: 50, image: './images/Switch Tropical_R10.jpg' },
  { id: 763, name: 'Tampon', price: 25.00, cost: 13.30, category: 'FEMALE', stock: 50, image: './images/Tampon_R25.jpg' },
  { id: 764, name: 'Tastic 10kg', price: 145.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Tastic10kg_R145.jpg' },
  { id: 765, name: 'Tastic 1kg', price: 25.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Tastic 1kg_R28.jpg' },
  { id: 766, name: 'Tastic 2kg', price: 40.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Tastic 2kg_R40.jpg' },
  { id: 767, name: 'Tastic 5kg', price: 100.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Tastic 5kg_R100.jpg' },
  { id: 768, name: 'Tastic 500g', price: 18.00, cost: 13.30, category: 'RICE', stock: 50, image: './images/Tastic 500g_R18.jpg' },
  { id: 769, name: 'Tasty 12.5kg', price: 130.00, cost: 13.30, category: 'FLOUR', stock: 50, image: './images/Tasty 12.5kg_R130.jpg' },
  { id: 770, name: 'Tasty Chicken Soup', price: 6.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Tasty Chicken_R6.jpg' },
  { id: 771, name: 'Tennis', price: 28.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Tennis_R28.jpg' },
  { id: 772, name: 'Thokoman 1kg', price: 75.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Thokoman 1kg_R75.jpg' },
  { id: 773, name: 'Thokoman 400g', price: 45.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Thokoman 400g_R45.jpg' },
  { id: 774, name: 'Thyme', price: 25.00, cost: 13.30, category: 'SOUPS', stock: 50, image: './images/Thyme_R25.jpg' },
  { id: 775, name: 'Time', price: 10.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Time_R10.jpg' },
  { id: 776, name: 'Tissue', price: 6.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Tissue_R6.jpg' },
  { id: 777, name: 'Tomato Sauce', price: 60.00, cost: 13.30, category: 'SAUCES', stock: 50, image: './images/Tomato Sauce_R60.jpg' },
  { id: 778, name: 'Toothpick', price: 10.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Toothpick_R10.jpg' },
  { id: 779, name: 'Topper Chocolate ', price: 6.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Chocolate_R6.jpg' },
  { id: 780, name: 'Topper Chocolate ', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Chocolate_R12.jpg' },
  { id: 781, name: 'Topper Custard', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Custard_R12.jpg' },
  { id: 782, name: 'Topper Lemon', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Lemon_R12.jpg' },
  { id: 783, name: 'Topper Mint ', price: 6.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Mint_R6.jpg' },
  { id: 784, name: 'Topper Mint ', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Mint_R12.jpg' },
  { id: 785, name: 'Topper Raspberry', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Raspberry_R12.jpg' },
  { id: 786, name: 'Topper Vanilla', price: 12.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/Topper Vanilla_R12.jpg' },
  { id: 787, name: 'Trekker', price: 22.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Trekker_R22.jpg' },
  { id: 788, name: 'Trinco ', price: 10.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Trinco_R10.jpg' },
  { id: 789, name: 'Trinco ', price: 18.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Trinco_R17.jpg' },
  { id: 790, name: 'Trinco ', price: 27.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Trinco_R25.jpg' },
  { id: 791, name: 'Trinco ', price: 65.00, cost: 13.30, category: 'TEA', stock: 50, image: './images/Trinco_R65.jpg' },
  { id: 792, name: 'Tropical', price: 10.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Tropical_R10.jpg' },
  { id: 793, name: 'Tropika Mango 1L', price: 20.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Tropika Mango_R20.jpg' },
  { id: 794, name: 'Tropika Mango 2L', price: 30.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Tropika Mango_R30.jpg' },
  { id: 795, name: 'Tropika Peach', price: 38.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Tropika Peach_R38.jpg' },
  { id: 796, name: 'Tropika Strawberry', price: 14.00, cost: 13.30, category: 'YOGHUT', stock: 50, image: './images/Tropika Strawberry_R14.jpg' },
  { id: 797, name: 'Tropika Tropical', price: 38.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Tropika Tropical_R38.jpg' },
  { id: 798, name: 'Tsunami', price: 10.00, cost: 13.30, category: 'HOUSEHOLD', stock: 50, image: './images/Tsunami_R10.jpg' },
  { id: 799, name: 'Turmeric', price: 25.00, cost: 13.30, category: 'SPICES', stock: 50, image: './images/Turmeric_R25.jpg' },
  { id: 800, name: 'Twinsaver Tissue', price: 8.00, cost: 13.30, category: 'TISSUE', stock: 50, image: './images/Twinsaver Tissue_R8.jpg' },
  { id: 801, name: 'Tyre Gloss', price: 50.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/Tyre Gloss_R50.jpg' },
  { id: 802, name: 'Ultra Milk Clover', price: 20.00, cost: 13.30, category: 'MILK', stock: 50, image: './images/UltraMilk Clover_R20.jpg' },
  { id: 803, name: 'V7 Multi-Function 650ml', price: 35.00, cost: 13.30, category: 'ITEMS CAR', stock: 50, image: './images/V7-Multi-Function650ml_R35.jpg' },
  { id: 804, name: 'Vanilla Creams', price: 10.00, cost: 13.30, category: 'BISCUITS', stock: 50, image: './images/VanillaCreams_R10.jpg' },
  { id: 805, name: 'Vaseline Aloe Fresh 50ml', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline AloeFresh_R15.jpg' },
  { id: 806, name: 'Vaseline Aloe Fresh 100ml', price: 25.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline AloeFresh_R25.jpg' },
  { id: 807, name: 'Vaseline Aloe Fresh 250ml', price: 48.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline aloeFresh_R40.jpg' },
  { id: 808, name: 'Vaseline Cocoa Butter 100ml', price: 25.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline CocoaButter_R25.jpg' },
  { id: 809, name: 'Vaseline Cocoa Butter 50ml', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Cocoabutter_R15.jpg' },
  { id: 810, name: 'Vaseline Men', price: 48.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Men_R40.jpg' },
  { id: 811, name: 'Vaseline Original 50ml', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Original_R15.jpg' },
  { id: 812, name: 'Vaseline Original 100ml', price: 25.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Original_R25.jpg' },
  { id: 813, name: 'Vaseline Original 250ml', price: 48.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Original_R40.jpg' },
  { id: 814, name: 'Vaseline Small', price: 10.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Small_R10.jpg' },
  { id: 815, name: 'Vaseline Strawberry 50ml', price: 17.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Strawberry_R15.jpg' },
  { id: 816, name: 'Vaseline Strawberry 250ml', price: 48.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Strawberry_R40.jpg' },
  { id: 817, name: 'Vaseline Strawberry 500ml', price: 75.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vaseline Strawberry_R70.jpg' },
  { id: 818, name: 'Vicks Rub', price: 14.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Vicks Rub_R14.jpg' },
  { id: 819, name: 'Vicks Syrup', price: 35.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Vicks Syrup_R35.jpg' },
  { id: 820, name: 'Vimbela Red', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vimbela Red_R20.jpg' },
  { id: 821, name: 'Vimbela White', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vimbela White_R20.jpg' },
  { id: 822, name: 'Vimbela', price: 20.00, cost: 13.30, category: 'PERSONAL CARE', stock: 50, image: './images/Vimbela_R20.jpg' },
  { id: 823, name: 'Weet-Bix 450g', price: 33.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/Weet-Bix_R35.jpg' },
  { id: 824, name: 'Weet-Bix 900g', price: 55.00, cost: 13.30, category: 'BREAK FAST', stock: 50, image: './images/Weet-Bix_R55.jpg' },
  { id: 825, name: 'White Star 5kg', price: 60.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/White Star5kg.jpg', note: 'PRICE MISSING' },
  { id: 826, name: 'White Star Banana', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/White Star Banana_R25.jpg' },
  { id: 827, name: 'White Star Chocolate', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/White Star Chocolate_R25.jpg' },
  { id: 828, name: 'White Star 2.5KG', price: 30.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/White Star Maize_R30.jpg' },
  { id: 829, name: 'White Star Strawberry', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/White Star Strawberry_R25.jpg' },
  { id: 830, name: 'White Star Vanilla', price: 25.00, cost: 13.30, category: 'BABY', stock: 50, image: './images/White Star Vanilla_R25.jpg' },
 { id: 831, name: 'White Star 2kg', price: 60.00, cost: 13.30, category: '', stock: 50, image: '' },
  { id: 832, name: 'White Star 12.5kg', price: 115.00, cost: 13.30, category: 'MAIZE MEAL', stock: 50, image: './images/White Star_R120.jpg' },
  { id: 833, name: 'White Star 12.5kg', price: 0.00, cost: 13.30, category: '', stock: 50, image: './images/WhiteStar12.5kg.jpg', note: 'PRICE MISSING' },
  { id: 834, name: 'Wild Island Orange', price: 18.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Wild Island Orange_R18.jpg' },
  { id: 835, name: 'Wild Island Peach', price: 18.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Wild Island Peach_R18.jpg' },
  { id: 836, name: 'Wild Island Tropical', price: 18.00, cost: 13.30, category: 'JUICE', stock: 50, image: './images/Wild Island Tropical_R18.jpg' },
  { id: 837, name: "Wood's Syrup", price: 35.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Wood\'s Syrup_R35.jpg' },
  { id: 839, name: 'Woods Syrup', price: 35.00, cost: 13.30, category: 'MEDICALS', stock: 50, image: './images/Woods Syrup_R35.jpg' },
  { id: 840, name: 'Yummy 500g', price: 15.00, cost: 13.30, category: '', stock: 50, image: './images/Yummy500g_R15.jpg' },
  { id: 841, name: 'Yumyum 250g', price: 29.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Yumyum_R29.jpg' },
  { id: 842, name: 'Yumyum 500g', price: 40.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Yumyum_R40.jpg' },
  { id: 843, name: 'Yumyum 750kg', price: 80.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Yumyum_R85.jpg' },
  { id: 844, name: 'Yumyum 2kg', price: 76.00, cost: 13.30, category: 'PEANUT', stock: 50, image: './images/Yumyum_R88.jpg' },
  // Kingsley / Refresh — cost set to 0; flag for pricing review
  { id: 845, name: 'Kingsley Apple 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Apple 2_R13.jpg' },
  { id: 846, name: 'Kingsley Coco Pine 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley CocoPine 2L_R13.jpg' },
  { id: 847, name: 'Kingsley Cola 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Cola 2L_R13.jpg' },
  { id: 848, name: 'Kingsley Cream Soda 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley CreamSoda 2L_R13.jpg' },
  { id: 849, name: 'Kingsley Ginger Beer 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley GingerBeer 2L_R13.jpg' },
  { id: 850, name: 'Kingsley Grape 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Grape 2L_R13.jpg' },
  { id: 851, name: 'Kingsley Guava 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Guava 2L_R13.jpg' },
  { id: 852, name: 'Kingsley Iron Brew 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley IronBrew 2L_R13.jpg' },
  { id: 853, name: 'Kingsley Kool 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Kool 2L_R13.jpg' },
  { id: 854, name: 'Kingsley Lemon 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Lemon 2L_R13.jpg' },
  { id: 855, name: 'Kingsley Litchi 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Litchi 2L_R13.jpg' },
  { id: 856, name: 'Kingsley Orange 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Orange 2L_R13.jpg' },
  { id: 857, name: 'Kingsley Pineapple 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley Pineapple 2L_R13.jpg' },
  { id: 858, name: 'Kingsley Berry Crush 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Kingsley-Berry Crush 2L_R13.jpg' },
  { id: 859, name: 'Refresh Apple 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Apple 2L_R13.jpg' },
  { id: 860, name: 'Refresh Cola 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Cola 2L_R13.jpg' },
  { id: 861, name: 'Refresh Granadilla 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Granadilla 2L_R13.jpg' },
  { id: 862, name: 'Refresh Grape 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Grape 2L_R13.jpg' },
  { id: 863, name: 'Refresh Lemon 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Lemon 2L_R13.jpg' },
  { id: 864, name: 'Refresh Lemonade 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Lemonade 2L_R13.jpg' },
  { id: 865, name: 'Refresh Mojito 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Mojito_2L_R13.jpg' },
  { id: 866, name: 'Refresh Orange 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Orange 2L_R13.jpg' },
  { id: 867, name: 'Refresh Strawberry 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Strawberry 2L_R13.jpg' },
  { id: 868, name: 'Refresh Watermelon 2L', price: 13.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Refresh Watermelon2L_R13.png' },
  { id: 869, name: 'Switch Citrus', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Citrus_R10.jpg' },
  { id: 870, name: 'Switch Cranberry', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Cranberry_R10.jpg' },
  { id: 871, name: 'Switch Iron Brew (alt)', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch IronBrew_R10.jpg' },
  { id: 872, name: 'Switch Jelly Babies', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch JellyBabies_R10.jpg' },
  { id: 873, name: 'Switch Mango Peach', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch MangoPeach_R10.jpg' },
  { id: 874, name: 'Switch Original (vape alt)', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Original_R10.jpg' },
  { id: 875, name: 'Switch Tropical (vape alt)', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Trobical_R10.jpg' },
  { id: 876, name: 'Switch Vitamin C Zinc', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Vitamin C Zinc_R10.jpg' },
  { id: 877, name: 'Switch Watermelon', price: 10.00, cost: 0, category: 'COOL DRINK', stock: 50, image: './images/Switch Watermelon_R10.jpg' },
  { id: 878, name: 'Sunlight 250g', price: 15.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Sunlight Soap_R15.jpg' },
  { id: 879, name: 'Sunlight 125g', price: 10.00, cost: 13.30, category: 'SOAP', stock: 50, image: './images/Sunlight Soap_R10.jpg' },
  { id: 856, name: 'Alliclear Lemon 25ML', price: 40.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/All clear Lemon_R28.jpg' },
  { id: 857, name: 'American Feels', price: 28.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/American Feels_R28.jpg' },
  { id: 858, name: 'BBQ Sauce', price: 60.00, cost: 0, category: 'SAUCES', stock: 50, image: './images/BBQ Sauce_R60.jpg' },
  { id: 859, name: 'Blow out', price: 45.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Blow out_R45.jpg' },
  { id: 860, name: 'Blue Ice', price: 18.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Blue Ice_R18.jpg' },
  { id: 861, name: 'Chip Sauce', price: 38.00, cost: 0, category: 'SAUCES', stock: 50, image: './images/Chip Sauce_R38.jpg' },
  { id: 862, name: 'Drums 1.5kg', price: 1.50, cost: 0, category: '', stock: 50, image: './images/Drums-1.5kg.jpg' },
  { id: 863, name: 'Drumsticks', price: 95.00, cost: 0, category: 'CHICKEN', stock: 50, image: './images/Drumsticks_R95.jpg' },
  { id: 864, name: 'Easy Waves Oil', price: 30.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Easy Waves Oil_R30.jpg' },
  { id: 865, name: 'Gentle Magic', price: 15.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Gentle Magic_R15.jpg' },
  { id: 866, name: 'Gentle Magic', price: 18.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Gentle Magic_R18.jpg' },
  { id: 867, name: 'Gentle Magic', price: 20.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Gentle Magic_R20.jpg' },
  { id: 868, name: 'Gentle Magic', price: 35.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Gentle Magic_R35.jpg' },
  { id: 869, name: 'Gentle Magic', price: 40.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Gentle Magic_R40.jpg' },
  { id: 870, name: 'Glade', price: 25.00, cost: 0, category: 'HOUSEHOLD', stock: 50, image: './images/Glade_R25.jpg' },
  { id: 871, name: 'Gold 2kg', price: 90.00, cost: 0, category: 'CHICKEN', stock: 50, image: './images/Gold 2kg_R90.jpg' },
  { id: 872, name: 'Gold 5kg', price: 230.00, cost: 0, category: 'CHICKEN', stock: 50, image: './images/Gold 5kg_R230.jpg' },
  { id: 873, name: "Ingram's", price: 55.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: "./images/Ingram's_R50.jpg" },
  { id: 874, name: "Ingram's Camphor", price: 55.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: "./images/Ingram-s Camphor_R50.jpg" },
  { id: 875, name: 'Iso Plus', price: 25.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Iso Plus_R25.jpg' },
  { id: 876, name: 'Iso Plus', price: 35.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Iso Plus_R35.jpg' },
  { id: 877, name: 'Iso Plus', price: 38.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Iso Plus_R38.jpg' },
  { id: 878, name: 'Palmolive', price: 30.00, cost: 0, category: 'HOUSEHOLD', stock: 50, image: './images/Palmolive_R30.jpg' },
  { id: 879, name: 'Perfect Choice', price: 35.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Perfect Choice_R35.jpg' },
  { id: 880, name: 'Petroleum Jelly', price: 25.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/petroleum jelly_R25.jpg' },
  { id: 881, name: 'Ponds', price: 28.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Ponds_R28.jpg' },
  { id: 882, name: 'Rainbow 2kg', price: 85.00, cost: 0, category: 'CHICKEN', stock: 50, image: './images/Rainbow 2kg_R85.jpg' },
  { id: 883, name: 'Drumsticks (Alt)', price: 95.00, cost: 0, category: '', stock: 50, image: './images/Drumsticks_R93.jpg' },
  { id: 884, name: 'Sarah', price: 18.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Sarah_R18.jpg' },
  { id: 885, name: 'Sofnfree Oil', price: 50.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Sofnfree Oil_R50.jpg' },
  { id: 886, name: 'SofnFree', price: 40.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/SofnFree_R40.jpg' },
  { id: 887, name: 'Sta-Soft Braid', price: 65.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Sta-Soft Braid_R65.jpg' },
  { id: 888, name: 'Stylin Dreds', price: 40.00, cost: 0, category: 'PERSONAL CARE', stock: 50, image: './images/Stylin Dreds_R40.jpg' },
  { id: 889, name: 'TOP BBQ SAUCE 2kg', price: 2.00, cost: 0, category: 'SAUCES', stock: 50, image: './images/TOP BBQ SAUCE 2kg.jpg' },
  { id: 890, name: 'Top Sauce', price: 25.00, cost: 0, category: 'SAUCES', stock: 50, image: './images/Top Sauce_25.jpg' },
  { id: 891, name: 'Wellington 700ml', price: 35.00, cost: 0, category: 'SAUCES', stock: 50, image: './images/Wellington 700ml_R35.jpg' }
  ];
}

/* ============ INITIALIZATION ============ */
function initProducts() {
  const saved = loadJSON('jama_products_v7', null);
  if (saved && saved.length) {
    PRODUCTS = saved;
  } else {
    PRODUCTS = getSeedProducts();
    saveJSON('jama_products_v7', PRODUCTS);
  }
}

/* ============ TOAST ============ */
function showToast(msg, type, duration) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, duration || 2500);
}

/* ============ RENDER ============ */
function renderAll() {
  renderCategories();
  renderNavCategories();
  renderProducts();
  renderCart();
  updateCartCount();
  updateHeroProductCount();
  updateLowStockBanner();
}

function renderCategories() {
  const cats = [...new Set(PRODUCTS.map(p => p.category))].sort();
  const sidebar = document.getElementById('sidebarCategories');
  if (sidebar) {
    sidebar.innerHTML = `<li class="${CURRENT_FILTER.category === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">All Products</li>` +
      cats.map(c => `<li class="${CURRENT_FILTER.category === c ? 'active' : ''}" onclick="filterByCategory('${c.replace(/'/g, "\\'")}')">${c}</li>`).join('');
  }
  const sel = document.getElementById('categorySelect');
  if (sel) {
    sel.innerHTML = `<option value="all">All Categories</option>` +
      cats.map(c => `<option value="${c}" ${CURRENT_FILTER.category === c ? 'selected' : ''}>${c}</option>`).join('');
  }
}

function renderNavCategories() {
  const nav = document.getElementById('navCategories');
  if (!nav) return;
  const cats = [...new Set(PRODUCTS.map(p => p.category))].sort().slice(0, 12);
  nav.innerHTML = cats.map(c => `<a onclick="filterByCategory('${c.replace(/'/g, "\\'")}')" class="${CURRENT_FILTER.category === c ? 'active' : ''}">${c}</a>`).join('');
}

function getFilteredProducts() {
  let list = PRODUCTS.slice();
  if (CURRENT_FILTER.category !== 'all') {
    list = list.filter(p => p.category === CURRENT_FILTER.category);
  }
  if (CURRENT_FILTER.search) {
    const q = CURRENT_FILTER.search.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }
  if (CURRENT_FILTER.min > 0) {
    list = list.filter(p => p.price >= CURRENT_FILTER.min);
  }
  if (CURRENT_FILTER.max < Infinity) {
    list = list.filter(p => p.price <= CURRENT_FILTER.max);
  }
  const sort = CURRENT_FILTER.sort;
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sort === 'promo') {
    const promoIds = new Set(PROMOTIONS.filter(p => p.active).map(p => p.productId));
    list.sort((a, b) => (promoIds.has(b.id) ? 1 : 0) - (promoIds.has(a.id) ? 1 : 0));
  }
  return list;
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const title = document.getElementById('productsTitle');
  const countEl = document.getElementById('resultsCount');
  if (!grid) return;
  const list = getFilteredProducts();
  if (title) title.textContent = CURRENT_FILTER.category === 'all' ? 'All Products' : CURRENT_FILTER.category;
  if (countEl) countEl.textContent = `${list.length} product${list.length !== 1 ? 's' : ''}`;

  grid.innerHTML = list.map(p => {
    const imgHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.querySelector('.no-img').style.display='block'">`
      : '';
    const promo = PROMOTIONS.find(pr => pr.productId === p.id && pr.active);
    const stockClass = p.stock <= 0 ? 'out-stock' : p.stock <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock';
    const stockLabel = p.stock <= 0 ? 'Out of Stock' : p.stock <= LOW_STOCK_THRESHOLD ? `Only ${p.stock} left` : 'In Stock';
    return `
    <div class="product-card" onclick="openProductModal(${p.id})">
      <div class="product-card-img">
        ${imgHtml || '<i class="fas fa-image no-img"></i>'}
        ${promo ? '<span class="product-badge promo">PROMO</span>' : ''}
        ${!promo && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD ? '<span class="product-badge low">LOW</span>' : ''}
        ${p.stock <= 0 ? '<span class="product-badge">SOLD OUT</span>' : ''}
      </div>
      <div class="product-card-body">
        <div class="product-card-cat">${p.category}</div>
        <div class="product-card-name">${p.name}</div>
        <div class="product-card-price">${CURRENCY}${p.price.toFixed(2)}${promo ? `<span class="was">${CURRENCY}${(p.price * 1.2).toFixed(2)}</span>` : ''}</div>
        <div class="product-card-stock ${stockClass}">${stockLabel}</div>
        <button class="product-card-btn" onclick="event.stopPropagation();addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>
          <i class="fas fa-cart-plus"></i> ${p.stock <= 0 ? 'Sold Out' : 'Add to Cart'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function updateHeroProductCount() {
  const el = document.getElementById('heroProductCount');
  if (el) el.textContent = `Shop ${PRODUCTS.length} products · Fresh deals daily · WhatsApp orders welcome`;
}

function updateLowStockBanner() {
  const low = PRODUCTS.filter(p => p.stock <= LOW_STOCK_THRESHOLD && p.stock > 0);
  const banner = document.getElementById('lowStockBanner');
  const text = document.getElementById('lowStockBannerText');
  if (low.length > 0) {
    banner.classList.add('show');
    text.textContent = `⚠️ ${low.length} product${low.length > 1 ? 's' : ''} low on stock — tap to view`;
  } else {
    banner.classList.remove('show');
  }
}

function openLowStockFromBanner() {
  CURRENT_FILTER = { category: 'all', search: '', min: 0, max: Infinity, sort: 'name' };
  renderProducts();
  document.querySelector('.main')?.scrollIntoView({ behavior: 'smooth' });
}

/* ============ CART ============ */
function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product || product.stock <= 0) { showToast('Product out of stock', 'error'); return; }
  const existing = CART.find(c => c.id === id);
  if (existing) {
    if (existing.qty >= product.stock) { showToast('Not enough stock available', 'error'); return; }
    existing.qty++;
  } else {
    CART.push({ id, qty: 1 });
  }
  saveJSON('jama_cart_v7', CART);
  renderCart();
  updateCartCount();
  showToast(`${product.name} added to cart`, 'success');
  const cartBtn = document.getElementById('cartHeaderBtn');
  if (cartBtn) { cartBtn.classList.add('bounce'); setTimeout(() => cartBtn.classList.remove('bounce'), 400); }
}

function removeFromCart(id) {
  CART = CART.filter(c => c.id !== id);
  saveJSON('jama_cart_v7', CART);
  renderCart();
  updateCartCount();
}

function updateQty(id, delta) {
  const item = CART.find(c => c.id === id);
  if (!item) return;
  const product = PRODUCTS.find(p => p.id === id);
  const newQty = item.qty + delta;
  if (newQty <= 0) { removeFromCart(id); return; }
  if (product && newQty > product.stock) { showToast('Not enough stock', 'error'); return; }
  item.qty = newQty;
  saveJSON('jama_cart_v7', CART);
  renderCart();
  updateCartCount();
}

function clearCart() {
  if (CART.length === 0) return;
  if (!confirm('Clear the entire cart?')) return;
  CART = [];
  saveJSON('jama_cart_v7', CART);
  renderCart();
  updateCartCount();
  showToast('Cart cleared', 'success');
}

function getCartTotal() {
  return CART.reduce((sum, item) => {
    const product = PRODUCTS.find(p => p.id === item.id);
    return sum + (product ? product.price * item.qty : 0);
  }, 0);
}

function getCartCount() {
  return CART.reduce((sum, item) => sum + item.qty, 0);
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  const loyaltyBanner = document.getElementById('loyaltyBanner');
  const loyaltyText = document.getElementById('loyaltyText');
  if (!container) return;
  if (CART.length === 0) {
    container.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Your cart is empty</p><p style="font-size:.8rem;margin-top:.5rem">Add items to get started</p></div>`;
    if (totalEl) totalEl.textContent = `${CURRENCY}0.00`;
    if (loyaltyBanner) loyaltyBanner.style.display = 'none';
    return;
  }
  container.innerHTML = CART.map(item => {
    const product = PRODUCTS.find(p => p.id === item.id);
    if (!product) return '';
    const imgHtml = product.image
      ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'">`
      : `<i class="fas fa-image" style="color:#ccc"></i>`;
    return `
    <div class="cart-item">
      <div class="cart-item-img">${imgHtml}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${product.name}</div>
        <div class="cart-item-price">${CURRENCY}${(product.price * item.qty).toFixed(2)}</div>
        <div class="cart-item-qty">
          <button onclick="updateQty(${item.id}, -1)">−</button>
          <span>${item.qty}</span>
          <button onclick="updateQty(${item.id}, 1)">+</button>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('');
  const total = getCartTotal();
  if (totalEl) totalEl.textContent = `${CURRENCY}${total.toFixed(2)}`;
  const count = getCartCount();
  if (loyaltyBanner) {
    if (count >= LOYALTY_THRESHOLD) {
      loyaltyBanner.style.display = 'block';
      if (loyaltyText) loyaltyText.textContent = `You've unlocked a loyalty reward! (${count} items)`;
    } else {
      loyaltyBanner.style.display = 'none';
    }
  }
}

function updateCartCount() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = getCartCount();
}

function openCart() {
  document.getElementById('cartOverlay').classList.add('show');
  document.getElementById('cartDrawer').classList.add('show');
  renderCart();
}

function closeCart() {
  document.getElementById('cartOverlay').classList.remove('show');
  document.getElementById('cartDrawer').classList.remove('show');
}

/* ============ SEARCH & FILTER ============ */
function searchProducts() {
  const input = document.getElementById('searchInput');
  const sel = document.getElementById('categorySelect');
  CURRENT_FILTER.search = input ? input.value.trim() : '';
  CURRENT_FILTER.category = sel ? sel.value : 'all';
  renderProducts();
}

function filterByCategory(cat) {
  CURRENT_FILTER.category = cat;
  renderCategories();
  renderNavCategories();
  renderProducts();
  document.querySelector('.main')?.scrollIntoView({ behavior: 'smooth' });
}

function sortProducts() {
  const sel = document.getElementById('sortSelect');
  CURRENT_FILTER.sort = sel ? sel.value : 'name';
  renderProducts();
}

function applyPriceFilter() {
  const min = parseFloat(document.getElementById('minPrice').value) || 0;
  const max = parseFloat(document.getElementById('maxPrice').value) || Infinity;
  CURRENT_FILTER.min = min;
  CURRENT_FILTER.max = max;
  renderProducts();
}

function resetFilters() {
  CURRENT_FILTER = { category: 'all', search: '', min: 0, max: Infinity, sort: 'name' };
  document.getElementById('searchInput').value = '';
  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.getElementById('sortSelect').value = 'name';
  renderCategories();
  renderNavCategories();
  renderProducts();
}

/* ============ PRODUCT MODAL ============ */
function openProductModal(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  CURRENT_PRODUCT = product;
  const container = document.getElementById('productDetailContent');
  const imgHtml = product.image
    ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<i class=\\'fas fa-image\\' style=\\'font-size:4rem;color:#ccc\\'></i>'">`
    : `<i class="fas fa-image" style="font-size:4rem;color:#ccc"></i>`;
  const promo = PROMOTIONS.find(pr => pr.productId === product.id && pr.active);
  container.innerHTML = `
    <div class="product-detail-img">${imgHtml}</div>
    <div class="product-detail-info">
      <h2>${product.name}</h2>
      <div class="product-detail-cat">${product.category}</div>
      <div class="product-detail-price">${CURRENCY}${product.price.toFixed(2)}${promo ? ` <span style="font-size:1rem;color:#999;text-decoration:line-through">${CURRENCY}${(product.price * 1.2).toFixed(2)}</span>` : ''}</div>
      <div class="product-detail-stock ${product.stock <= 0 ? 'out-stock' : product.stock <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock'}">
        ${product.stock <= 0 ? '❌ Out of Stock' : product.stock <= LOW_STOCK_THRESHOLD ? `⚠️ Only ${product.stock} left in stock` : `✅ In Stock (${product.stock} units)`}
      </div>
      <button class="product-detail-add" onclick="addToCart(${product.id});closeProductModal()" ${product.stock <= 0 ? 'disabled' : ''}>
        <i class="fas fa-cart-plus"></i> ${product.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
      </button>
    </div>`;
  document.getElementById('productModal').classList.add('show');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('show');
  CURRENT_PRODUCT = null;
}

/* ============ CHECKOUT ============ */
function goToCheckout() {
  if (CART.length === 0) { showToast('Your cart is empty', 'error'); return; }
  closeCart();
  renderOrderSummary();
  document.getElementById('checkoutModal').classList.add('show');
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('show');
}

function renderOrderSummary() {
  const container = document.getElementById('orderSummary');
  if (!container) return;
  const zone = document.getElementById('coZone')?.value || 'local';
  const fee = DELIVERY_ZONES[zone]?.fee || 0;
  const subtotal = getCartTotal();
  const total = subtotal + fee;
  container.innerHTML = `
    <div class="order-summary-row"><span>Subtotal (${getCartCount()} items)</span><span>${CURRENCY}${subtotal.toFixed(2)}</span></div>
    <div class="order-summary-row"><span>Delivery (${DELIVERY_ZONES[zone]?.label || 'Standard'})</span><span>${fee === 0 ? 'FREE' : CURRENCY + fee.toFixed(2)}</span></div>
    <div class="order-summary-row total"><span>Total</span><span>${CURRENCY}${total.toFixed(2)}</span></div>`;
}

function submitOrder(e) {
  e.preventDefault();
  const name = document.getElementById('coName').value.trim();
  const phone = document.getElementById('coPhone').value.trim();
  const email = document.getElementById('coEmail').value.trim();
  const address = document.getElementById('coAddress').value.trim();
  const zone = document.getElementById('coZone').value;
  const payment = document.getElementById('coPayment').value;
  if (!name || !phone || !address) { showToast('Please fill in all required fields', 'error'); return; }
  const fee = DELIVERY_ZONES[zone]?.fee || 0;
  const subtotal = getCartTotal();
  const total = subtotal + fee;
  const orderId = 'JAMA-' + Date.now().toString(36).toUpperCase();
  const order = {
    id: orderId,
    name, phone, email, address, zone, payment,
    items: CART.map(c => {
      const p = PRODUCTS.find(pr => pr.id === c.id);
      return { id: c.id, name: p ? p.name : 'Unknown', qty: c.qty, price: p ? p.price : 0 };
    }),
    subtotal, fee, total,
    status: 'pending',
    date: new Date().toISOString()
  };
  const orders = loadJSON('jama_orders_v7', []);
  orders.push(order);
  saveJSON('jama_orders_v7', orders);
  // Reduce stock
  CART.forEach(item => {
    const p = PRODUCTS.find(pr => pr.id === item.id);
    if (p) p.stock = Math.max(0, p.stock - item.qty);
  });
  saveJSON('jama_products_v7', PRODUCTS);
  CART = [];
  saveJSON('jama_cart_v7', CART);
  renderCart();
  updateCartCount();
  closeCheckout();
  showReceipt(order);
  showToast('Order placed successfully!', 'success', 4000);
  renderProducts();
  updateLowStockBanner();
}

function showReceipt(order) {
  const body = document.getElementById('receiptBody');
  if (!body) return;
  const itemsHtml = order.items.map(i => `<div class="tr-row"><span>${i.qty}x ${i.name}</span><span>${CURRENCY}${(i.price * i.qty).toFixed(2)}</span></div>`).join('');
  const waMsg = encodeURIComponent(
    `*JAMA SUPERMARKET — Order ${order.id}*\n\n` +
    `👤 ${order.name}\n📞 ${order.phone}\n📍 ${order.address}\n\n` +
    `Items:\n${order.items.map(i => `• ${i.qty}x ${i.name} — R${(i.price * i.qty).toFixed(2)}`).join('\n')}\n\n` +
    `Subtotal: R${order.subtotal.toFixed(2)}\nDelivery: R${order.fee.toFixed(2)}\n*TOTAL: R${order.total.toFixed(2)}*\n\nPayment: ${order.payment}`
  );
  body.innerHTML = `
    <div class="thermal-receipt">
      <div class="tr-center tr-bold tr-lg">JAMA SUPERMARKET</div>
      <div class="tr-center tr-sm">Fresh & Best Quality</div>
      <div class="tr-center tr-sm">Etwatwa, Thembisile</div>
      <div class="tr-center tr-sm">+27 61 212 6736</div>
      <div class="tr-line">--------------------------------</div>
      <div class="tr-row"><span>Order:</span><span>${order.id}</span></div>
      <div class="tr-row"><span>Date:</span><span>${new Date(order.date).toLocaleString()}</span></div>
      <div class="tr-row"><span>Customer:</span><span>${order.name}</span></div>
      <div class="tr-row"><span>Phone:</span><span>${order.phone}</span></div>
      <div class="tr-line">--------------------------------</div>
      ${itemsHtml}
      <div class="tr-line">--------------------------------</div>
      <div class="tr-row"><span>Subtotal:</span><span>${CURRENCY}${order.subtotal.toFixed(2)}</span></div>
      <div class="tr-row"><span>Delivery:</span><span>${CURRENCY}${order.fee.toFixed(2)}</span></div>
      <div class="tr-row tr-bold tr-lg"><span>TOTAL:</span><span>${CURRENCY}${order.total.toFixed(2)}</span></div>
      <div class="tr-row"><span>Payment:</span><span>${order.payment}</span></div>
      <div class="tr-line">--------------------------------</div>
      <div class="tr-center tr-sm">Thank you for shopping with us!</div>
      <div class="tr-center tr-sm">WhatsApp: +27 61 212 6736</div>
    </div>
    <div class="receipt-actions">
      <button class="receipt-wa" onclick="window.open('https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}','_blank')"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button>
      <button class="receipt-print" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
      <button class="receipt-close" onclick="closeReceipt()"><i class="fas fa-times"></i> Close</button>
    </div>`;
  document.getElementById('receiptModal').classList.add('show');
}

function closeReceipt() {
  document.getElementById('receiptModal').classList.remove('show');
}

/* ============ ACCOUNT ============ */
function showAccount() {
  if (USER) {
    showToast(`Signed in as ${USER.name || USER.phone || 'Customer'}`, 'success');
  } else {
    const name = prompt('Enter your name to sign in:');
    if (name && name.trim()) {
      USER = { name: name.trim(), joined: new Date().toISOString() };
      saveJSON('jama_user_v7', USER);
      const greeting = document.getElementById('accountGreeting');
      const label = document.getElementById('accountLabel');
      if (greeting) greeting.textContent = `Hello, ${USER.name}`;
      if (label) label.textContent = 'My Account';
      showToast(`Welcome, ${USER.name}!`, 'success');
    }
  }
}

/* ============ ADMIN ============ */
function setupLogoSecret() {
  const logo = document.getElementById('jamaLogo');
  if (!logo) return;
  logo.addEventListener('click', () => {
    LOGO_CLICK_COUNT++;
    clearTimeout(LOGO_CLICK_TIMER);
    LOGO_CLICK_TIMER = setTimeout(() => { LOGO_CLICK_COUNT = 0; }, 1500);
    if (LOGO_CLICK_COUNT >= 5) {
      LOGO_CLICK_COUNT = 0;
      document.getElementById('adminLoginModal').classList.add('show');
    }
  });
  logo.addEventListener('keydown', e => { if (e.key === 'Enter') logo.click(); });
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal').classList.remove('show');
}

async function verifyAdmin() {
  const role = document.getElementById('adminRoleSelect').value;
  const pass = document.getElementById('adminPasswordInput').value;
  if (!pass) { showToast('Enter password', 'error'); return; }
  const hashes = await buildPasswordHashes();
  const hash = await sha256(pass);
  if (hashes[role] === hash) {
    ADMIN_UNLOCKED = true;
    CURRENT_ROLE = role;
    closeAdminLogin();
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminCurrentRole').textContent = ROLES[role].label;
    openAdminDashboard();
    showToast(`Welcome, ${ROLES[role].label}`, 'success');
  } else {
    showToast('Invalid credentials', 'error');
    const input = document.getElementById('adminPasswordInput');
    input.style.borderColor = '#e63946';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
  }
}

function openAdminDashboard() {
  document.getElementById('adminDashboardModal').classList.add('show');
  renderAdminStats();
  switchAdminTab('orders');
}

function closeAdminDashboard() {
  document.getElementById('adminDashboardModal').classList.remove('show');
}

function lockAdmin() {
  ADMIN_UNLOCKED = false;
  closeAdminDashboard();
  showToast('Admin locked', 'success');
}

function switchAdminTab(tab) {
  if (!ADMIN_UNLOCKED) return;
  if (tab !== 'orders' && tab !== 'pos' && !hasPerm('admin_' + tab)) {
    showToast('You do not have permission to view this section', 'error');
    return;
  }
  ADMIN_TAB = tab;
  document.querySelectorAll('.admin-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  renderAdminContent();
}

function renderAdminStats() {
  const container = document.getElementById('adminStatsBar');
  if (!container) return;
  const orders = loadJSON('jama_orders_v7', []);
  const pending = orders.filter(o => o.status === 'pending').length;
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const lowStock = PRODUCTS.filter(p => p.stock <= LOW_STOCK_THRESHOLD).length;
  const totalProducts = PRODUCTS.length;
  container.innerHTML = `
    <div class="admin-stat-card"><div class="admin-stat-label">Total Orders</div><div class="admin-stat-value accent">${orders.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Pending</div><div class="admin-stat-value danger">${pending}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Revenue</div><div class="admin-stat-value success">R${totalRevenue.toFixed(2)}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Products</div><div class="admin-stat-value">${totalProducts}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Low Stock</div><div class="admin-stat-value ${lowStock > 0 ? 'danger' : 'success'}">${lowStock}</div></div>`;
}

function renderAdminContent() {
  const container = document.getElementById('adminContent');
  if (!container) return;
  switch (ADMIN_TAB) {
    case 'orders': renderAdminOrders(container); break;
    case 'pos': renderAdminPOS(container); break;
    case 'products': renderAdminProducts(container); break;
    case 'inventory': renderAdminInventory(container); break;
    case 'ledger': renderAdminLedger(container); break;
    case 'suppliers': renderAdminSuppliers(container); break;
    case 'purchasing': renderAdminPurchasing(container); break;
    case 'promotions': renderAdminPromotions(container); break;
    case 'shifts': renderAdminShifts(container); break;
    case 'messages': renderAdminMessages(container); break;
    case 'customers': renderAdminCustomers(container); break;
    case 'analytics': renderAdminAnalytics(container); break;
    case 'settings': renderAdminSettings(container); break;
    default: container.innerHTML = '<div class="admin-empty">Select a tab</div>';
  }
}

function renderAdminOrders(container) {
  const orders = loadJSON('jama_orders_v7', []);
  const filtered = orders.slice().reverse();
  if (filtered.length === 0) {
    container.innerHTML = `<div class="admin-empty"><i class="fas fa-shopping-bag"></i><p>No orders yet</p></div>`;
    return;
  }
  container.innerHTML = filtered.map(o => {
    const itemsHtml = o.items.map(i => `<div>${i.qty}x ${i.name} — R${(i.price * i.qty).toFixed(2)}</div>`).join('');
    return `
    <div class="admin-order-card">
      <div class="admin-order-header">
        <span class="admin-order-id">${o.id}</span>
        <span class="admin-order-meta">${new Date(o.date).toLocaleString()}</span>
      </div>
      <div class="admin-order-customer">
        <strong>${o.name}</strong> · ${o.phone}<br>${o.address}
      </div>
      <div class="admin-order-items">${itemsHtml}</div>
      <div class="admin-order-footer">
        <span class="admin-order-total">R${o.total.toFixed(2)}</span>
        <span class="admin-status-pill status-${o.status}">${o.status}</span>
        <div class="admin-order-actions">
          <button class="admin-btn-wa" onclick="window.open('https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi ' + o.name + ', your order ' + o.id + ' is being processed. Total: R' + o.total.toFixed(2))}','_blank')"><i class="fab fa-whatsapp"></i> Chat</button>
          <button class="admin-btn-paid" onclick="markOrderPaid('${o.id}')"><i class="fas fa-check"></i> Paid</button>
          <button class="admin-btn-del" onclick="markOrderDelivered('${o.id}')"><i class="fas fa-truck"></i> Delivered</button>
          <button class="admin-btn-del" onclick="cancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancel</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function markOrderPaid(id) {
  const orders = loadJSON('jama_orders_v7', []);
  const o = orders.find(x => x.id === id);
  if (o) { o.status = 'paid'; saveJSON('jama_orders_v7', orders); renderAdminStats(); renderAdminContent(); showToast('Order marked as paid', 'success'); }
}

function markOrderDelivered(id) {
  const orders = loadJSON('jama_orders_v7', []);
  const o = orders.find(x => x.id === id);
  if (o) { o.status = 'delivered'; saveJSON('jama_orders_v7', orders); renderAdminStats(); renderAdminContent(); showToast('Order marked as delivered', 'success'); }
}

function cancelOrder(id) {
  const orders = loadJSON('jama_orders_v7', []);
  const o = orders.find(x => x.id === id);
  if (o) {
    o.status = 'cancelled';
    saveJSON('jama_orders_v7', orders);
    // Restore stock
    o.items.forEach(i => {
      const p = PRODUCTS.find(pr => pr.id === i.id);
      if (p) p.stock += i.qty;
    });
    saveJSON('jama_products_v7', PRODUCTS);
    renderAdminStats();
    renderAdminContent();
    showToast('Order cancelled and stock restored', 'success');
  }
}

function renderAdminPOS(container) {
  container.innerHTML = `
    <div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Quick POS — Tap a product to add to a quick sale</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.5rem;">
      ${PRODUCTS.slice(0, 100).map(p => `<button onclick="quickPOSAdd(${p.id})" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:.7rem;color:#dde;text-align:left;cursor:pointer;font-size:.75rem;transition:.2s;" onmouseover="this.style.borderColor='#febd69'" onmouseout="this.style.borderColor='rgba(255,255,255,.1)'">
        <div style="font-weight:700;color:#fff;">${p.name}</div>
        <div style="color:#febd69;font-weight:800;">R${p.price.toFixed(2)}</div>
        <div style="color:#889;font-size:.65rem;">Stock: ${p.stock}</div>
      </button>`).join('')}
    </div>
    <div style="margin-top:1rem;padding:1rem;background:rgba(0,0,0,.2);border-radius:12px;color:#fff;" id="posQuickCart">POS cart empty</div>
    <div style="margin-top:.8rem;display:flex;gap:.5rem;">
      <button onclick="quickPOSClear()" style="flex:1;padding:.8rem;border-radius:12px;border:none;background:rgba(230,57,70,.2);color:#e63946;font-weight:700;cursor:pointer;">Clear</button>
      <button onclick="quickPOSComplete()" style="flex:2;padding:.8rem;border-radius:12px;border:none;background:var(--pos-success);color:#fff;font-weight:700;cursor:pointer;"><i class="fas fa-check"></i> Complete Sale</button>
    </div>`;
  updatePOSQuickCart();
}

let POS_CART = [];
function quickPOSAdd(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p || p.stock <= 0) { showToast('Out of stock', 'error'); return; }
  const existing = POS_CART.find(c => c.id === id);
  if (existing) existing.qty++;
  else POS_CART.push({ id, qty: 1 });
  updatePOSQuickCart();
}
function updatePOSQuickCart() {
  const el = document.getElementById('posQuickCart');
  if (!el) return;
  if (POS_CART.length === 0) { el.textContent = 'POS cart empty'; return; }
  const total = POS_CART.reduce((s, c) => { const p = PRODUCTS.find(x => x.id === c.id); return s + (p ? p.price * c.qty : 0); }, 0);
  el.innerHTML = POS_CART.map(c => {
    const p = PRODUCTS.find(x => x.id === c.id);
    return p ? `<div style="display:flex;justify-content:space-between;padding:.2rem 0;"><span>${c.qty}x ${p.name}</span><span>R${(p.price * c.qty).toFixed(2)}</span></div>` : '';
  }).join('') + `<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-top:1px solid rgba(255,255,255,.1);margin-top:.3rem;font-weight:800;color:#febd69;"><span>Total</span><span>R${total.toFixed(2)}</span></div>`;
}
function quickPOSClear() { POS_CART = []; updatePOSQuickCart(); }
function quickPOSComplete() {
  if (POS_CART.length === 0) { showToast('POS cart empty', 'error'); return; }
  const total = POS_CART.reduce((s, c) => { const p = PRODUCTS.find(x => x.id === c.id); return s + (p ? p.price * c.qty : 0); }, 0);
  POS_CART.forEach(c => { const p = PRODUCTS.find(x => x.id === c.id); if (p) p.stock = Math.max(0, p.stock - c.qty); });
  saveJSON('jama_products_v7', PRODUCTS);
  const sale = { id: 'POS-' + Date.now().toString(36).toUpperCase(), items: POS_CART.map(c => { const p = PRODUCTS.find(x => x.id === c.id); return { id: c.id, name: p ? p.name : '', qty: c.qty, price: p ? p.price : 0 }; }), total, date: new Date().toISOString(), type: 'pos' };
  const orders = loadJSON('jama_orders_v7', []);
  orders.push({ ...sale, name: 'POS Walk-in', phone: '-', address: 'In-store', zone: 'collect', payment: 'cash', subtotal: total, fee: 0, status: 'paid' });
  saveJSON('jama_orders_v7', orders);
  POS_CART = [];
  updatePOSQuickCart();
  showToast(`Sale complete: R${total.toFixed(2)}`, 'success');
  renderAdminStats();
  renderProducts();
}

function renderAdminProducts(container) {
  const subtabs = ['list', 'add'];
  const subtabBtns = subtabs.map(s => `<button class="${ADMIN_SUBTAB.products === s ? 'active' : ''}" onclick="setAdminSubtab('products','${s}')">${s === 'list' ? '📋 List' : '➕ Add'}</button>`).join('');
  if (ADMIN_SUBTAB.products === 'add') {
    container.innerHTML = `<div class="admin-subtab">${subtabBtns}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem;">
        <input class="admin-input" id="npName" placeholder="Product name">
        <input class="admin-input" id="npCategory" placeholder="Category">
        <input class="admin-input" id="npPrice" type="number" step="0.01" placeholder="Price (R)">
        <input class="admin-input" id="npCost" type="number" step="0.01" placeholder="Cost (R)">
        <input class="admin-input" id="npStock" type="number" placeholder="Stock quantity">
        <input class="admin-input" id="npImage" placeholder="Image path (optional)">
      </div>
      <button onclick="addNewProduct()" style="margin-top:.8rem;padding:.8rem 1.5rem;border-radius:12px;border:none;background:var(--accent);color:var(--primary);font-weight:800;cursor:pointer;"><i class="fas fa-plus"></i> Add Product</button>`;
  } else {
    container.innerHTML = `<div class="admin-subtab">${subtabBtns}</div>
      <div style="max-height:400px;overflow-y:auto;">
        <table class="admin-table"><thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th></tr></thead><tbody>
        ${PRODUCTS.map(p => `<tr>
          <td>${p.name}</td>
          <td>${p.category}</td>
          <td>R${p.price.toFixed(2)}</td>
          <td style="color:${p.stock <= LOW_STOCK_THRESHOLD ? '#e63946' : '#0a6'}">${p.stock}</td>
          <td><button onclick="editProductPrompt(${p.id})" style="background:none;border:none;color:#60a5fa;cursor:pointer;"><i class="fas fa-edit"></i></button>
              <button onclick="deleteProduct(${p.id})" style="background:none;border:none;color:#e63946;cursor:pointer;"><i class="fas fa-trash"></i></button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>`;
  }
}

function setAdminSubtab(section, sub) {
  ADMIN_SUBTAB[section] = sub;
  renderAdminContent();
}

function addNewProduct() {
  const name = document.getElementById('npName').value.trim();
  const category = document.getElementById('npCategory').value.trim().toUpperCase();
  const price = parseFloat(document.getElementById('npPrice').value);
  const cost = parseFloat(document.getElementById('npCost').value) || 0;
  const stock = parseInt(document.getElementById('npStock').value) || 0;
  const image = document.getElementById('npImage').value.trim();
  if (!name || !category || !price) { showToast('Name, category and price required', 'error'); return; }
  const newId = Math.max(0, ...PRODUCTS.map(p => p.id)) + 1;
  PRODUCTS.push({ id: newId, name, category, price, cost, stock, image });
  saveJSON('jama_products_v7', PRODUCTS);
  renderProducts();
  renderCategories();
  renderAdminStats();
  renderAdminContent();
  showToast('Product added', 'success');
}

function editProductPrompt(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const newPrice = prompt(`New price for ${p.name}:`, p.price);
  if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
    p.price = parseFloat(newPrice);
    saveJSON('jama_products_v7', PRODUCTS);
    renderProducts();
    renderAdminContent();
    showToast('Price updated', 'success');
  }
}

function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  PRODUCTS = PRODUCTS.filter(p => p.id !== id);
  saveJSON('jama_products_v7', PRODUCTS);
  renderProducts();
  renderCategories();
  renderAdminStats();
  renderAdminContent();
  showToast('Product deleted', 'success');
}

function renderAdminInventory(container) {
  const low = PRODUCTS.filter(p => p.stock <= LOW_STOCK_THRESHOLD);
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Low Stock Items (${low.length})</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.5rem;">
      ${low.map(p => `<div class="admin-order-card" style="padding:.6rem .8rem;">
        <div style="font-weight:700;color:#fff;font-size:.8rem;">${p.name}</div>
        <div style="color:#f4a261;font-size:.75rem;">Stock: ${p.stock}</div>
        <button onclick="restockProduct(${p.id})" style="margin-top:.4rem;padding:.3rem .8rem;border-radius:12px;border:none;background:rgba(0,168,107,.2);color:#0a6;font-size:.7rem;font-weight:700;cursor:pointer;">+ Restock</button>
      </div>`).join('') || '<div class="admin-empty">All stock levels OK</div>'}
    </div>`;
}

function restockProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const qty = parseInt(prompt(`Restock ${p.name} — quantity:`, '50'));
  if (qty && qty > 0) {
    p.stock += qty;
    saveJSON('jama_products_v7', PRODUCTS);
    renderProducts();
    updateLowStockBanner();
    renderAdminStats();
    renderAdminContent();
    showToast(`Restocked ${qty} units`, 'success');
  }
}

function renderAdminLedger(container) {
  const orders = loadJSON('jama_orders_v7', []);
  const entries = orders.slice().reverse().map(o => ({ type: 'sale', id: o.id, name: o.name, total: o.total, date: o.date, status: o.status }));
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Sales Ledger (${entries.length} entries)</div>
    ${entries.map(e => `<div class="ledger-entry ${e.type}">
      <span style="color:#889;font-size:.65rem;">${new Date(e.date).toLocaleDateString()}</span>
      <span>${e.type === 'sale' ? '🛒' : '📦'} ${e.id} — ${e.name}</span>
      <span style="color:#febd69;font-weight:800;">R${e.total.toFixed(2)}</span>
      <span class="admin-status-pill status-${e.status}">${e.status}</span>
    </div>`).join('') || '<div class="admin-empty">No ledger entries</div>'}`;
}

function renderAdminSuppliers(container) {
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Suppliers (${SUPPLIERS.length})</div>
    ${SUPPLIERS.map(s => `<div class="admin-order-card"><strong>${s.name}</strong><br><span style="color:#889;font-size:.75rem;">${s.contact || ''}</span></div>`).join('') || '<div class="admin-empty">No suppliers added</div>'}`;
}

function renderAdminPurchasing(container) {
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;">Purchase Orders (${PURCHASE_ORDERS.length})</div>
    ${PURCHASE_ORDERS.map(po => `<div class="admin-order-card"><strong>${po.id}</strong> — R${(po.total || 0).toFixed(2)}</div>`).join('') || '<div class="admin-empty">No purchase orders</div>'}`;
}

function renderAdminPromotions(container) {
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Active Promotions (${PROMOTIONS.filter(p => p.active).length})</div>
    ${PROMOTIONS.map(pr => { const p = PRODUCTS.find(x => x.id === pr.productId); return p ? `<div class="admin-order-card"><strong>${p.name}</strong> — Promo active</div>` : ''; }).join('') || '<div class="admin-empty">No promotions</div>'}`;
}

function renderAdminShifts(container) {
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;">Shift Management</div>
    <div class="admin-empty"><i class="fas fa-clock"></i><p>Shift tracking available</p></div>`;
}

function renderAdminMessages(container) {
  container.innerHTML = `<div class="admin-empty"><i class="fas fa-comments"></i><p>No messages</p></div>`;
}

function renderAdminCustomers(container) {
  const orders = loadJSON('jama_orders_v7', []);
  const customers = {};
  orders.forEach(o => { if (o.phone) customers[o.phone] = (customers[o.phone] || 0) + 1; });
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">Customers (${Object.keys(customers).length})</div>
    <table class="admin-table"><thead><tr><th>Phone</th><th>Orders</th></tr></thead><tbody>
    ${Object.entries(customers).map(([phone, count]) => `<tr><td>${phone}</td><td>${count}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#556;">No customers yet</td></tr>'}
    </tbody></table>`;
}

function renderAdminAnalytics(container) {
  const orders = loadJSON('jama_orders_v7', []);
  const totalRevenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;
  container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.8rem;">
    <div class="admin-stat-card"><div class="admin-stat-label">Total Revenue</div><div class="admin-stat-value success">R${totalRevenue.toFixed(2)}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Total Orders</div><div class="admin-stat-value accent">${orders.length}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Avg. Order Value</div><div class="admin-stat-value">R${avgOrder.toFixed(2)}</div></div>
    <div class="admin-stat-card"><div class="admin-stat-label">Unique Products</div><div class="admin-stat-value">${PRODUCTS.length}</div></div>
  </div>`;
}

function renderAdminSettings(container) {
  container.innerHTML = `<div style="color:#bbc;font-size:.85rem;margin-bottom:1rem;">System Settings</div>
    <div class="admin-order-card"><strong>Store</strong><br>JAMA SUPERMARKET v${APP_VERSION}</div>
    <div class="admin-order-card"><strong>WhatsApp</strong><br>+${WHATSAPP_NUMBER}</div>
    <div class="admin-order-card"><strong>Delivery Fee (local)</strong><br>R${DELIVERY_ZONES.local.fee}</div>
    <button onclick="exportAllData()" style="margin-top:1rem;padding:.8rem 1.5rem;border-radius:12px;border:none;background:var(--accent);color:var(--primary);font-weight:800;cursor:pointer;"><i class="fas fa-download"></i> Export All Data</button>`;
}

function exportAllData() {
  const data = {
    products: PRODUCTS, orders: loadJSON('jama_orders_v7', []),
    cart: CART, suppliers: SUPPLIERS, exportDate: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `jama-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported', 'success');
}

function openZReport() {
  const orders = loadJSON('jama_orders_v7', []);
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.date).toDateString() === today);
  const total = todayOrders.reduce((s, o) => s + o.total, 0);
  alert(`Z-Report — ${today}\n\nOrders: ${todayOrders.length}\nRevenue: R${total.toFixed(2)}\n\nJAMA SUPERMARKET v${APP_VERSION}`);
}

/* ============ EVENT LISTENERS ============ */
function setupEventListeners() {
  document.getElementById('searchInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchProducts(); });
  document.getElementById('categorySelect')?.addEventListener('change', searchProducts);
  document.getElementById('sortSelect')?.addEventListener('change', sortProducts);
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
    if (e.key === 'Escape') {
      closeCart(); closeProductModal(); closeCheckout(); closeReceipt(); closeAdminDashboard(); closeAdminLogin();
    }
  });
  document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
}

/* ============ BOOT ============ */
document.addEventListener('DOMContentLoaded', () => {
  initProducts();
  if (USER) {
    const g = document.getElementById('accountGreeting');
    const l = document.getElementById('accountLabel');
    if (g) g.textContent = `Hello, ${USER.name}`;
    if (l) l.textContent = 'My Account';
  }
  renderAll();
  setupLogoSecret();
  setupEventListeners();
  console.log(`%cJAMA POS v${APP_VERSION} ready · ${PRODUCTS.length} products loaded`, 'color:#febd69;background:#0b1a2b;padding:4px 8px;border-radius:4px;font-weight:bold');
});

// Expose functions to global scope for inline onclick handlers
window.searchProducts = searchProducts;
window.sortProducts = sortProducts;
window.filterByCategory = filterByCategory;
window.applyPriceFilter = applyPriceFilter;
window.resetFilters = resetFilters;
window.openCart = openCart;
window.closeCart = closeCart;
window.clearCart = clearCart;
window.goToCheckout = goToCheckout;
window.closeCheckout = closeCheckout;
window.submitOrder = submitOrder;
window.closeReceipt = closeReceipt;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;
window.showAccount = showAccount;
window.openLowStockFromBanner = openLowStockFromBanner;
window.renderOrderSummary = renderOrderSummary;
window.openAdminDashboard = openAdminDashboard;
window.closeAdminDashboard = closeAdminDashboard;
window.verifyAdmin = verifyAdmin;
window.closeAdminLogin = closeAdminLogin;
window.lockAdmin = lockAdmin;
window.switchAdminTab = switchAdminTab;
window.exportAllData = exportAllData;
window.openZReport = openZReport;
window.markOrderPaid = markOrderPaid;
window.markOrderDelivered = markOrderDelivered;
window.cancelOrder = cancelOrder;
window.quickPOSAdd = quickPOSAdd;
window.quickPOSClear = quickPOSClear;
window.quickPOSComplete = quickPOSComplete;
window.setAdminSubtab = setAdminSubtab;
window.addNewProduct = addNewProduct;
window.editProductPrompt = editProductPrompt;
window.deleteProduct = deleteProduct;
window.restockProduct = restockProduct;