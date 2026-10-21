const VAT = 0.15, LOW_STOCK = 5;
// Accepts different column headings from the supplied CSV. Edit aliases to match your file.
const ALIASES = {
  sku: ['code','sku','item code','itemcode','product code'],
  name: ['description','name','product','item','item description'],
  category: ['category','group','type','department'],
  price: ['price','unit price','selling price','price excl','cost'],
  qty: ['qty on hand','qty','quantity','stock','on hand'],
  active: ['active'],
  image: ['image','img','picture','image url'],
  brand: ['brand','manufacturer','make']
};
const $ = s => document.querySelector(s);
const placeholder = (cat,name='') => {
 const label=String(cat||'Product').replace(/&/g,'and'), type=/cable|wire/i.test(`${cat} ${name}`)?'cable':/batter/i.test(cat)?'battery':/panel|module/i.test(`${cat} ${name}`)?'panel':/inverter/i.test(`${cat} ${name}`)?'inverter':'generic';
 const art={
  cable:'<path d="M125 145c0-34 28-62 62-62h26c34 0 62 28 62 62s-28 62-62 62h-26c-34 0-62-28-62-62z"/><path d="M125 145H91v-27m184 27h34v27"/><path d="M91 118h-13m231 54h13"/>',
  battery:'<rect x="135" y="83" width="130" height="132" rx="12"/><path d="M174 69h52v14h-52zm24 42v30h-20l28 37v-30h20l-28-37z"/>',
  panel:'<path d="M119 86h162l-18 115H137zM126 119h150m-155 33h150m-155 33h149m-98-99-10 115m61-115-9 115M198 201v22m-36 0h72"/>',
  inverter:'<rect x="137" y="73" width="126" height="150" rx="12"/><path d="M177 104h46m-46 18h46m-23 25v42m-20-21h40"/>',
  generic:'<rect x="139" y="83" width="122" height="112" rx="12"/><circle cx="200" cy="120" r="14"/><path d="m151 178 35-34 26 22 17-15 20 27"/>'
 };
 return 'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="16" fill="#eef3f8"/><g fill="none" stroke="#327c81" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${art[type]}</g><text x="200" y="250" text-anchor="middle" font-family="Arial" font-size="17" font-weight="bold" fill="#173b59">${label}</text><text x="200" y="273" text-anchor="middle" font-family="Arial" font-size="13" fill="#667085">Product image coming soon</text></svg>`);
};
let products = [], cart = JSON.parse(localStorage.getItem('quoteCart') || '{}');
let selectedCategory = null, selectedStock = null;

// ---------- CSV parsing & cleaning ----------
function parseCSV(text){
  const rows=[]; let row=[], f='', q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'&&text[i+1]==='"'){f+='"';i++} else if(c==='"') q=false; else f+=c }
    else if(c==='"') q=true; else if(c===','){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&text[i+1]==='\n') i++; row.push(f);rows.push(row);row=[];f='' }
    else f+=c }
  if(f||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>x.trim()));
}
const num = v => { const n = parseFloat(String(v??'').replace(/[R\s,]/g,'')); return isNaN(n) ? null : n; };
// Re-categorise vague groups ("Other", blank, "Accessories") from the description.
const RULES = [
  [/pre-?wired box|combiner box|isolation|disconnect box|protection box/i,'Protection & Distribution Boxes'],
  [/\bAC\b.*BTU|kelon/i,'Air Conditioners'],
  [/mounting system/i,'Mounting Systems'],
  [/pv cable|power cable/i,'Cables'],
  [/meter|communication/i,'Monitoring & Accessories']
];
function categorise(cat,name){
  if(cat==='Lead-Acid Batteries') return 'Batteries';
  if(cat && !['Other','Accessories'].includes(cat)) return cat;
  for(const [re,c] of RULES) if(re.test(name)) return c;
  return cat==='Accessories' ? 'Monitoring & Accessories' : 'Other';
}
function inferBrand(name){
  const first=String(name).trim().split(/\s+/)[0]||'';
  return /^(ac|dc|pv|solar|battery|batteries|inverter|panel|module|cable|mounting|lithium|lead-acid|hardware)$/i.test(first) ? '' : first.replace(/[^\p{L}\p{N}&-]/gu,'');
}
function clean(rows){
  const head = rows[0].map(h=>h.trim().toLowerCase()), idx={};
  for(const k in ALIASES) idx[k]=head.findIndex(h=>ALIASES[k].includes(h));
  const seen=new Set(), out=[];
  rows.slice(1).forEach((r,i)=>{
    const g=k=>idx[k]>=0?(r[idx[k]]||'').trim():'';
    let name=g('name'), sku=g('sku');
    if(!sku || !name) return;                                       // drops blank rows and the report's total row
    if(idx.active>=0 && g('active').toLowerCase()==='no') return;   // hide inactive items
    if(seen.has(sku)) sku+='-'+(i+1); seen.add(sku);                // keep SKUs unique
    const rawCat=g('category'), price=num(g('price')), qty=num(g('qty'));
    const placeholderName = name.toLowerCase()===rawCat.toLowerCase(); // e.g. description just says "Hardware Tools"
    out.push({sku, name: placeholderName ? name+' ('+sku+')' : name,
      needsDesc: placeholderName,
      brand: g('brand') || inferBrand(name),
      searchText: r.join(' ').toLowerCase(), // Include specifications and any other source columns.
      category: categorise(rawCat,name),
      price: price>0 ? price : null,                                // no price column / blank => request price
      qty: qty===null ? null : Math.max(0,Math.floor(qty)),         // missing qty stays null and is never shown
      image: g('image') || 'images/'+sku.replace(/[^A-Za-z0-9-]/g,'_')+'.jpg'});
  });
  return out;
}

// ---------- helpers ----------
const rand = n => 'R ' + n.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stock(p){
  if(p.qty===null) return {cls:'req',txt:'Availability on request',rank:2};
  if(p.qty===0) return {cls:'out',txt:'Out of stock – order on request',rank:3};
  if(p.qty<=LOW_STOCK) return {cls:'low',txt:'Low stock',rank:1};
  if(p.qty<=10) return {cls:'limited',txt:'Limited stock',rank:1};
  return {cls:'in',txt:'In stock',rank:0};
}
const img = p => `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder(p.category,p.name).replace(/'/g,'%27')}'">`;
const priceHTML = p => p.price
  ? `<div class="price">${rand(p.price)}<small>excl. VAT · ${rand(p.price*(1+VAT))} incl. VAT</small></div>`
  : `<div class="price" style="font-size:15px">Price on request</div>`;
const productSpecs = name => [...new Set((String(name).match(/\b\d[\d,.]*\s?(?:kWh|kW|W|V|Ah|A|BTU|kVA|Hz|mm|cm|MPPT)\b|\bR\d{3}\b|\bWi-?Fi\b/gi)||[]).map(s=>s.trim()))].slice(0,4);
const save = () => { localStorage.setItem('quoteCart',JSON.stringify(cart)); $('#cartCount').textContent=Object.values(cart).reduce((a,b)=>a+b,0); };

// ---------- catalogue ----------
function render(){
  const q=$('#search').value.toLowerCase().trim(), brand=$('#brand').value;
  const stockClass=p=>p.qty===null?'req':p.qty===0?'out':p.qty<=LOW_STOCK?'low':p.qty<=10?'limited':'in';
  let list=products.filter(p=>(!q||p.searchText.includes(q)||(p.name+' '+p.sku+' '+p.brand).toLowerCase().includes(q))&&(!selectedCategory||selectedCategory==='All'||p.category===selectedCategory)&&(brand==='all'||p.brand===brand)&&(!selectedStock||selectedStock==='all'||stockClass(p)===selectedStock));
  list.sort((a,b)=>a.name.localeCompare(b.name));
  const categories=['All',...new Set(products.map(p=>p.category))].sort((a,b)=>a==='All'?-1:b==='All'?1:a.localeCompare(b));
  $('#categoryChips').innerHTML=categories.map(c=>`<button type="button" class="category-chip ${selectedCategory===c?'selected':''}" data-category="${esc(c)}">${esc(c)} <span>${c==='All'?products.length:products.filter(p=>p.category===c).length}</span></button>`).join('');
  $('#categoryChips').querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{selectedCategory=b.dataset.category;render()});
  $('#grid').innerHTML=list.map(p=>{const st=stock(p);return `<article class="card">
    <div onclick="openProduct('${esc(p.sku)}')">${img(p)}</div>
    <div class="body"><span class="cat">${esc(p.category)}</span>
    <div class="name" onclick="openProduct('${esc(p.sku)}')"><span class="model-label">Model / product</span>${esc(p.name)}</div>
    <div class="product-specs" aria-label="Specifications">${productSpecs(p.name).length?productSpecs(p.name).map(spec=>`<span>${esc(spec)}</span>`).join(''):'<span class="specs-pending">Specifications on request</span>'}</div>
    <span class="sku">SKU: ${esc(p.sku)}</span>${priceHTML(p)}
    <span class="badge ${st.cls}">${st.txt}</span>
    <button class="btn" onclick="${p.price?`addToCart('${esc(p.sku)}')`:`requestPrice('${esc(p.sku)}')`}">${p.price?'Add to quote':'Request price'}</button></div></article>`}).join('');
  $('#resultCount').textContent=`${list.length} product${list.length===1?'':'s'}`;
  document.querySelectorAll('.stock-chip').forEach(b=>b.classList.toggle('selected',b.dataset.stock===selectedStock));
}
function openProduct(sku){
  const p=products.find(x=>x.sku===sku), st=stock(p), d=$('#productDlg');
  d.innerHTML=`<div class="dlg"><button class="close" onclick="productDlg.close()" aria-label="Close">×</button>
  <div class="detail">${img(p)}<div><span class="cat">${esc(p.category)}</span><h2>${esc(p.name)}</h2>
  <p class="sku">SKU: ${esc(p.sku)}</p>${priceHTML(p)}<span class="badge ${st.cls}">${st.txt}</span>
  <p class="muted">Quoted pricing and delivery lead times are confirmed by our sales team.</p>
  <button class="btn" onclick="${p.price?`addToCart('${esc(p.sku)}');productDlg.close()`:`requestPrice('${esc(p.sku)}')`}">${p.price?'Add to quote':'Request price'}</button></div></div></div>`;
  d.showModal();
}
function addToCart(sku){ cart[sku]=(cart[sku]||0)+1; save(); }
function requestPrice(sku){ addToCart(sku); location.href='request-price.html'; }

// ---------- quote list & request ----------
function openCart(){
  const items=Object.keys(cart).map(s=>products.find(p=>p.sku===s)).filter(Boolean), d=$('#cartDlg');
  const known=items.filter(p=>p.price).reduce((t,p)=>t+p.price*cart[p.sku],0), unpriced=items.some(p=>!p.price);
  d.innerHTML=`<div class="dlg"><button class="close" onclick="cartDlg.close()" aria-label="Close">×</button><h2>Your quote list</h2>
  ${items.length?`<table><tr><th>Item</th><th>Qty</th><th>Unit (excl.)</th><th></th></tr>${items.map(p=>`<tr>
   <td>${esc(p.name)}<br><span class="sku">${esc(p.sku)}</span></td>
   <td><input type="number" min="1" value="${cart[p.sku]}" onchange="setQty('${esc(p.sku)}',this.value)"></td>
   <td>${p.price?rand(p.price):'On request'}</td><td><button class="btn ghost" onclick="setQty('${esc(p.sku)}',0)">Remove</button></td></tr>`).join('')}</table>
   ${known?`<p><strong>Indicative total: ${rand(known)} excl. VAT</strong> (${rand(known*(1+VAT))} incl.)${unpriced?'<br><span class="muted">Excludes items marked "On request".</span>':''}</p>`:'<p class="note">Pricing for these items is confirmed by our sales team in your quote.</p>'}
   <a class="btn form-link" href="request-price.html">Continue to request price</a>`
   :'<p class="muted">Your quote list is empty.</p>'}</div>`;
  d.showModal();
}
function setQty(sku,v){ v=parseInt(v)||0; v>0?cart[sku]=v:delete cart[sku]; save(); openCart(); }
function submitQuote(fd,items){
  const lines=items.map(p=>`- ${p.sku} | ${p.name} | Qty: ${cart[p.sku]}`).join('\n');
  const body=`Company: ${fd.get('company')}\nVAT: ${fd.get('vat')}\nContact: ${fd.get('contact')}\nPhone: ${fd.get('phone')}\nEmail: ${fd.get('email')}\nNotes: ${fd.get('notes')}\n\nItems:\n${lines}`;
  // Replace with your backend / Formspree / EmailJS endpoint for production.
  location.href=`mailto:sales@vukapowertrade.com?subject=${encodeURIComponent('Quote request – '+fd.get('company'))}&body=${encodeURIComponent(body)}`;
  cart={}; save();
  $('#cartDlg').innerHTML='<div class="dlg"><button class="close" onclick="cartDlg.close()">×</button><h2>Thank you</h2><p>Your quote request has been prepared. Our team will respond within one business day.</p></div>';
}

// ---------- init ----------
fetch(new URL('data/inventory.csv',document.baseURI)).then(r=>{
  if(!r.ok) throw new Error(`Inventory CSV returned HTTP ${r.status}`);
  return r.text();
}).then(t=>{
  products=clean(parseCSV(t.replace(/^\uFEFF/,'').replace(/^sep=.*\r?\n/i,'')));
  if(!products.length) throw new Error('Inventory CSV contains no usable products');
  const brands=[...new Set(products.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  $('#brand').innerHTML='<option value="all">All brands</option>'+brands.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join('');
  render(); save();
}).catch(error=>{
  console.error('Could not load data/inventory.csv:',error);
  $('#grid').innerHTML='<p class="muted">The product catalogue could not be loaded. Check that data/inventory.csv is included in the deployment.</p>';
});
$('#search').addEventListener('input',render);
$('#brand').addEventListener('change',render);
document.querySelectorAll('.stock-chip').forEach(b=>b.addEventListener('click',()=>{selectedStock=b.dataset.stock;render()}));
$('#filterToggle').onclick=()=>{const open=$('#filterPanel').hidden;$('#filterPanel').hidden=!open;$('#filterToggle').setAttribute('aria-expanded',String(open));$('#filterChevron').textContent=open?'⌃':'⌄'};
$('#cartBtn').onclick=openCart;
$('#reset').onclick=()=>{$('#search').value='';$('#brand').value='all';selectedCategory=null;selectedStock=null;render()};
