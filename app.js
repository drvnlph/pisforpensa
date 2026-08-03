// ── Reading settings ──────────────────────
// Colour and link style live on <body> as data attributes and persist
// across visits. Storage can throw (private mode, blocked cookies), so every
// access is guarded — a reader who blocks it still gets a working page.
const PREFS='pfp:prefs';

function readPrefs(){
  try{ return JSON.parse(localStorage.getItem(PREFS))||{} }catch(e){ return {} }
}
function writePref(key,value){
  try{
    const p=readPrefs(); p[key]=value;
    localStorage.setItem(PREFS,JSON.stringify(p));
  }catch(e){ /* storage unavailable — setting still applies for this visit */ }
}

// Mark the control matching `value` as active, within one group.
function syncControls(selector,attr,value){
  document.querySelectorAll(selector).forEach(b=>{
    const active=b.dataset[attr]===value;
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
  });
}

function setColor(c){ document.body.setAttribute('data-color',c); syncControls('.ctrl-swatch','c',c); writePref('color',c) }
function setLinks(mode){ document.body.setAttribute('data-links',mode); syncControls('.ctrl-linkbtn','links',mode); writePref('links',mode) }

// Restore saved choices, falling back to whatever the markup already declares.
(function restorePrefs(){
  const p=readPrefs(), b=document.body;
  setColor(p.color||b.getAttribute('data-color')||'slate');
  setLinks(p.links||b.getAttribute('data-links')||'quiet');
})();

document.querySelectorAll('.ctrl-swatch').forEach(el=>el.addEventListener('click',()=>setColor(el.dataset.c)));
document.querySelectorAll('.ctrl-linkbtn').forEach(el=>el.addEventListener('click',()=>setLinks(el.dataset.links)));

// Elements
const btt=document.getElementById('backToTop');
const progressBar=document.getElementById('progressBar');
const mobileBar=document.getElementById('mobileBar');
const mobileChapter=document.getElementById('mobileChapter');
const mobileProgress=document.getElementById('mobileProgress');
const mobileDropdown=document.getElementById('mobileDropdown');
const tocBtn=document.getElementById('mobileBarToc');
let lastY=window.scrollY, barVisible=false, dropdownOpen=false;

// Reset scroll tracking when tab/app becomes visible again
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) lastY=window.scrollY; });
window.addEventListener('focus',()=>{ lastY=window.scrollY; });

// Back to top
if(btt) btt.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

// Progress bar
function updateProgress(){
  if(!progressBar) return;
  const h=document.documentElement.scrollHeight-window.innerHeight;
  const pct=h>0?Math.min(100,window.scrollY/h*100):0;
  progressBar.style.width=pct+'%';
  progressBar.classList.toggle('at-top',window.scrollY<50);
  if(mobileProgress)mobileProgress.style.width=pct+'%';
}

// Scroll handler: back-to-top + mobile bar + progress
window.addEventListener('scroll',()=>{
  // Back to top visibility
  if(btt) btt.classList.toggle('visible',window.scrollY>window.innerHeight*.6);
  // Progress
  updateProgress();
  // Mobile bar: show on scroll-up, hide on scroll-down
  const y=window.scrollY;
  if(!mobileBar){ lastY=y; return; }
  const scrolledPastHeader=y>300;
  const scrollingUp=y<lastY-5;
  const scrollingDown=y>lastY+5;
  if(scrolledPastHeader&&scrollingUp&&!barVisible){
    mobileBar.classList.add('visible');barVisible=true;
    mobileBar.setAttribute('aria-hidden','false');
    mobileBar.inert=false;
    if(progressBar) progressBar.classList.add('bar-hidden');
  }
  if((scrollingDown||!scrolledPastHeader)&&barVisible){
    mobileBar.classList.remove('visible');barVisible=false;
    if(progressBar) progressBar.classList.remove('bar-hidden');
    if(dropdownOpen) closeDropdown();
    mobileBar.setAttribute('aria-hidden','true');
    mobileBar.inert=true;
  }
  lastY=y;
},{passive:true});
updateProgress();

// Dropdown TOC
let savedChapterText='';

function openDropdown(){
  if(!mobileDropdown||!mobileBar||!tocBtn||!mobileChapter) return;
  dropdownOpen=true;
  mobileDropdown.classList.add('open');
  mobileDropdown.setAttribute('aria-hidden','false');
  mobileDropdown.inert=false;
  mobileBar.classList.add('dropdown-open');
  tocBtn.classList.add('open');
  tocBtn.setAttribute('aria-expanded','true');
  // Crossfade the chapter name into "Содержание".
  savedChapterText=mobileChapter.textContent;
  mobileChapter.classList.add('swapping');
  setTimeout(()=>{
    mobileChapter.textContent='Содержание';
    mobileChapter.style.fontWeight='700';
    mobileChapter.style.color='var(--text-muted)';
    mobileChapter.style.fontSize='11px';
    mobileChapter.style.letterSpacing='1.8px';
    mobileChapter.style.textTransform='uppercase';
    mobileChapter.classList.remove('swapping');
  },120);
  // Highlight current section
  const mobileLinks=document.querySelectorAll('#tocMobileList a');
  mobileLinks.forEach(a=>a.classList.remove('current'));
  const currentId=mobileChapter.dataset.currentId;
  if(currentId){
    const cur=document.querySelector('#tocMobileList a[href="#'+currentId+'"]');
    if(cur)cur.classList.add('current');
  }
}
function closeDropdown(){
  if(!mobileDropdown||!mobileBar||!tocBtn||!mobileChapter) return;
  if(!dropdownOpen) return;
  dropdownOpen=false;
  mobileDropdown.classList.remove('open');
  mobileDropdown.setAttribute('aria-hidden','true');
  mobileDropdown.inert=true;
  mobileBar.classList.remove('dropdown-open');
  tocBtn.classList.remove('open');
  tocBtn.setAttribute('aria-expanded','false');
  // Crossfade back to chapter name
  mobileChapter.classList.add('swapping');
  setTimeout(()=>{
    mobileChapter.textContent=savedChapterText;
    mobileChapter.style.fontWeight='';
    mobileChapter.style.color='';
    mobileChapter.style.fontSize='';
    mobileChapter.style.letterSpacing='';
    mobileChapter.style.textTransform='';
    mobileChapter.classList.remove('swapping');
  },120);
}

if(tocBtn) tocBtn.addEventListener('click',()=>{
  if(dropdownOpen)closeDropdown(); else openDropdown();
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&dropdownOpen){
    closeDropdown();
    tocBtn?.focus();
  }
});

const tocMobileList=document.getElementById('tocMobileList');
if(tocMobileList) tocMobileList.addEventListener('click',e=>{
  if(e.target.tagName==='A'){closeDropdown()}
});

// ── One table of contents, three renderings ──────────────
// The sidebar list is the single source. The mobile dropdown and the inline
// mobile nav are cloned from it at load, so changing the text means editing
// one list instead of three. A hand-written list is left alone.
(function syncTOCs(){
  const source=document.getElementById('tocDesktopList');
  if(!source) return;
  [tocMobileList,document.querySelector('.toc-inline-list')].forEach(target=>{
    if(!target||target.children.length) return;
    Array.from(source.children).forEach(li=>{
      const copy=li.cloneNode(true);
      copy.querySelectorAll('a').forEach(a=>a.classList.remove('active'));
      target.appendChild(copy);
    });
  });
})();

// Track current section: desktop TOC + mobile chapter name + mobile highlight.
// Section names are read out of the mobile TOC rather than kept in a separate
// map here — one list to edit when the text changes, not two.
const sectionNames={};
document.querySelectorAll('#tocMobileList a[href^="#"]').forEach(a=>{
  sectionNames[a.getAttribute('href').slice(1)]=a.textContent.trim();
});
const sections=document.querySelectorAll('section[id]');
const deskLinks=document.querySelectorAll('#tocDesktopList a');
const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){
  const id=e.target.id;
  // Desktop sidebar
  deskLinks.forEach(l=>l.classList.remove('active'));
  const link=document.querySelector('#tocDesktopList a[href="#'+id+'"]');
  if(link)link.classList.add('active');
  // Mobile chapter name
  if(mobileChapter&&sectionNames[id]){mobileChapter.textContent=sectionNames[id];mobileChapter.dataset.currentId=id}
  // Mobile dropdown highlight (if open)
  if(dropdownOpen){
    document.querySelectorAll('#tocMobileList a').forEach(a=>a.classList.remove('current'));
    const cur=document.querySelector('#tocMobileList a[href="#'+id+'"]');
    if(cur)cur.classList.add('current');
  }
}})},{rootMargin:'-15% 0px -70% 0px'});
sections.forEach(s=>obs.observe(s));

// Footnote popovers - position detection
function updateFnPositions(){
  document.querySelectorAll('.fn-ref').forEach(ref=>{
    const rect=ref.getBoundingClientRect();
    const vw=window.innerWidth;
    ref.classList.toggle('flip',rect.top<160);
    ref.classList.toggle('anchor-right',rect.left>vw-180);
    ref.classList.toggle('anchor-left',rect.left<140);
  });
}
window.addEventListener('scroll',updateFnPositions,{passive:true});
window.addEventListener('resize',updateFnPositions,{passive:true});
updateFnPositions();

document.querySelectorAll('.fn-ref a[data-fn]').forEach(a=>{
  const ref=a.closest('.fn-ref');
  const popup=ref?.querySelector('.fn-popup');
  if(popup){
    const popupId=`fn-popup-${a.dataset.fn}`;
    popup.id=popupId;
    popup.setAttribute('role','note');
    popup.setAttribute('aria-hidden','true');
    a.setAttribute('aria-controls',popupId);
    a.setAttribute('aria-expanded','false');
  }
  a.addEventListener('click',e=>{
    e.preventDefault();
    const wasActive=ref.classList.contains('active');
    document.querySelectorAll('.fn-ref.active').forEach(r=>{
      r.classList.remove('active');
      r.querySelector('a[data-fn]')?.setAttribute('aria-expanded','false');
      r.querySelector('.fn-popup')?.setAttribute('aria-hidden','true');
    });
    if(!wasActive){
      ref.classList.add('active');
      a.setAttribute('aria-expanded','true');
      popup?.setAttribute('aria-hidden','false');
    }
  });
});
document.addEventListener('click',e=>{
  if(!e.target.closest('.fn-ref')){
    document.querySelectorAll('.fn-ref.active').forEach(r=>{
      r.classList.remove('active');
      r.querySelector('a[data-fn]')?.setAttribute('aria-expanded','false');
      r.querySelector('.fn-popup')?.setAttribute('aria-hidden','true');
    });
  }
});

// ── Link taxonomy: classify external vs internal ──
// External (http/https) get data-ext + data-host + target/rel; internal anchors get data-int.
// Footnote refs and back-links are left untouched.
document.querySelectorAll('.content a[href]').forEach(a=>{
  if(a.closest('.fn-ref') || a.classList.contains('footnote-back') || a.closest('nav')) return;
  const href=a.getAttribute('href')||'';
  if(/^https?:\/\//i.test(href)){
    a.setAttribute('data-ext','');
    try{
      const host=new URL(href).hostname.replace(/^www\./,'');
      a.setAttribute('data-host',host);
      if(!a.title) a.title=host;
    }catch(e){}
    a.setAttribute('target','_blank');
    a.setAttribute('rel','noopener noreferrer');
  } else if(href.startsWith('#')){
    a.setAttribute('data-int','');
  }
});
