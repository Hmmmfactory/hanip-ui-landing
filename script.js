const designBase = location.pathname.includes('/story/') ? '../' : '';
if (!document.querySelector('link[href$="architect.css"]')) { const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = designBase + 'architect.css'; document.head.append(sheet); }
if (!document.querySelector('link[href$="pop.css"]')) { const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = designBase + 'pop.css'; document.head.append(sheet); }
const button = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');
const replay = document.querySelector('.play-button');
const furniture = document.querySelectorAll('.furniture');
const SITE_URL = 'https://runday0829.vercel.app';
function addJsonLd(id, data) { let node = document.getElementById(id); if (!node) { node = document.createElement('script'); node.type = 'application/ld+json'; node.id = id; document.head.append(node); } node.textContent = JSON.stringify(data); }
function ensureCanonical() { const existing = document.querySelector('link[rel="canonical"]'); const canonical = existing || document.createElement('link'); canonical.rel = 'canonical'; canonical.href = SITE_URL + location.pathname + location.search; if (!existing) document.head.append(canonical); }
ensureCanonical();
if (button && nav) { button.addEventListener('click', () => { const open = nav.classList.toggle('open'); button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'CLOSE −' : 'MENU +'; }); nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => { nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); button.textContent = 'MENU +'; })); }
if (replay) replay.addEventListener('click', () => { furniture.forEach((piece) => { piece.style.animation = 'none'; void piece.offsetWidth; piece.style.animation = ''; }); });
const counterNodes = document.querySelectorAll('[data-counter]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const formatCounter = (value, decimals) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
function runCounter(node) {
  const target = Number(node.dataset.counter);
  const decimals = String(node.dataset.counter).includes('.') ? String(node.dataset.counter).split('.')[1].length : 0;
  if (!Number.isFinite(target) || reducedMotion) { node.textContent = formatCounter(target, decimals); return; }
  const started = performance.now();
  const draw = (now) => { const progress = Math.min((now - started) / 850, 1); node.textContent = formatCounter(target * (1 - Math.pow(1 - progress, 3)), decimals); if (progress < 1) requestAnimationFrame(draw); };
  requestAnimationFrame(draw);
}
if (counterNodes.length) {
  if (reducedMotion || !('IntersectionObserver' in window)) counterNodes.forEach(runCounter);
  else { const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { runCounter(entry.target); observer.unobserve(entry.target); } }), { threshold: .45 }); counterNodes.forEach((node) => observer.observe(node)); }
}
const formatPrice = (price) => new Intl.NumberFormat('ko-KR').format(price) + '원';
function productCard(product, index) { const card = document.createElement('article'); card.className = 'item-card product-card'; const number = document.createElement('div'); number.className = 'item-number'; number.textContent = String(index + 1).padStart(2, '0'); const imageBox = document.createElement('div'); imageBox.className = 'item-drawing product-image'; const image = document.createElement('img'); image.src = product.image; image.alt = product.name; image.loading = 'lazy'; image.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply'; imageBox.append(image); const title = document.createElement('div'); title.className = 'item-title'; const label = document.createElement('p'); label.textContent = '직접 구매한 물건'; const heading = document.createElement('h3'); heading.textContent = product.name; title.append(label, heading); const details = document.createElement('dl'); const priceRow = document.createElement('div'); const priceLabel = document.createElement('dt'); priceLabel.textContent = '가격'; const price = document.createElement('dd'); price.textContent = formatPrice(product.price); priceRow.append(priceLabel, price); const sourceRow = document.createElement('div'); const sourceLabel = document.createElement('dt'); sourceLabel.textContent = '출처'; const source = document.createElement('dd'); source.textContent = product.source || '스마트스토어'; sourceRow.append(sourceLabel, source); details.append(priceRow, sourceRow); const buy = document.createElement('a'); buy.className = 'buy-button'; buy.href = product.url; buy.target = '_blank'; buy.rel = 'noopener noreferrer'; buy.textContent = '구매하기 ↗'; card.append(number, imageBox, title, details, buy); return card; }
async function renderProducts() { const homeList = document.querySelector('[data-home-products]') || document.querySelector('.items .item-list'); const productList = document.querySelector('[data-products-list]'); if (!homeList && !productList) return; try { const response = await fetch('products.json'); if (!response.ok) throw new Error('제품 데이터를 불러오지 못했습니다.'); const data = await response.json(); const products = Array.isArray(data.products) ? data.products : []; const render = (target, list) => target.replaceChildren(...list.map(productCard)); if (homeList) render(homeList, products.slice(0, 3)); if (productList) render(productList, products); addJsonLd('b01-products-schema', { '@context': 'https://schema.org', '@type': 'ItemList', name: 'B01호 실제로 구매한 제품', itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, item: { '@type': 'Product', name: product.name, image: product.image, offers: { '@type': 'Offer', price: String(product.price), priceCurrency: 'KRW', url: product.url } } })) }); } catch (error) { [homeList, productList].filter(Boolean).forEach((target) => { target.textContent = '제품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; }); } }
document.querySelectorAll('.nav a[href="#items"], .nav a[href="index.html#items"]').forEach((link) => { link.href = 'products.html'; });
renderProducts();
document.querySelectorAll('.nav a[href="#stories"]').forEach((link) => { link.href = 'story/'; });
document.querySelectorAll('.stories .underline-link').forEach((link) => { link.href = 'story/'; });

async function renderLatestStories() {
  const list = document.querySelector('.stories .story-list');
  if (!list) return;
  try {
    const response = await fetch('story/posts.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('이야기를 불러오지 못했습니다.');
    const posts = await response.json();
    const latest = Array.isArray(posts) ? posts.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3) : [];
    const dateText = (value) => { const date = new Date(value + 'T00:00:00'); return isNaN(date) ? value : `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}`; };
    const cards = latest.map((post, index) => { const link = document.createElement('a'); link.href = post.url || `story/post.html?id=${encodeURIComponent(post.id || '')}`; const number = document.createElement('span'); number.className = 'story-index'; number.textContent = String(index + 1).padStart(2, '0'); const date = document.createElement('span'); date.className = 'story-date'; date.textContent = dateText(post.date || ''); const title = document.createElement('strong'); title.textContent = post.title || '제목 없음'; const arrow = document.createElement('span'); arrow.textContent = '↗'; link.append(number, date, title, arrow); return link; });
    list.replaceChildren(...cards);
    document.querySelectorAll('.nav a[href="#stories"]').forEach((link) => { link.href = 'story/'; });
    document.querySelectorAll('.stories .underline-link').forEach((link) => { link.href = 'story/'; });
  } catch (error) { list.textContent = '이야기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
}

renderLatestStories();

const contactHref = location.pathname.includes('/story/') ? '../contact.html' : 'contact.html';
document.querySelectorAll('.nav a[href="#contact"], .nav a[href="index.html#contact"]').forEach((link) => { link.href = contactHref; });

document.querySelectorAll('footer').forEach((footer) => {
  if (footer.querySelector('.footer-contact')) return;
  const links = document.createElement('div');
  links.className = 'footer-contact';
  links.style.cssText = 'display:flex;gap:1rem;font:.56rem var(--mono)';
  const email = document.createElement('a'); email.href = 'mailto:heum.factory@gmail.com'; email.target = '_blank'; email.rel = 'noopener noreferrer'; email.textContent = 'EMAIL'; email.style.borderBottom = '1px solid currentColor';
  const instagram = document.createElement('a'); instagram.href = 'https://www.instagram.com/growup.b01/?utm_source=ig_web_button_share_sheet'; instagram.target = '_blank'; instagram.rel = 'noopener noreferrer'; instagram.textContent = 'INSTAGRAM'; instagram.style.borderBottom = '1px solid currentColor';
  links.append(email, instagram);
  footer.append(links);
});
