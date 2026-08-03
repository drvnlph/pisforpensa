// ── Reading settings ──────────────────────
// The shared head script restores preferences before paint. This file only
// owns the article controls that change them.
function writePref(key,value){ window.PFPPreferences?.write(key,value) }

// Mark the control matching `value` as active, within one group.
function syncControls(selector,attr,value){
  document.querySelectorAll(selector).forEach(b=>{
    const active=b.dataset[attr]===value;
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
  });
}

function setColor(c){ document.documentElement.dataset.color=c; syncControls('.ctrl-swatch','c',c); writePref('color',c) }
function setLinks(mode){ document.documentElement.dataset.links=mode; syncControls('.ctrl-linkbtn','links',mode); writePref('links',mode) }

// Reflect the already-restored values without writing storage again.
(function syncRestoredControls(){
  const root=document.documentElement;
  syncControls('.ctrl-swatch','c',root.dataset.color||'slate');
  syncControls('.ctrl-linkbtn','links',root.dataset.links||'quiet');
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
const desktopSidebar=document.querySelector('.sidebar');
const articleHeader=document.querySelector('.article-header');
const mobileLayout=window.matchMedia('(max-width:1120px)');
const SCROLL_DIRECTION_TOLERANCE=5;
const BACK_TO_TOP_VIEWPORT_RATIO=.6;
const PROGRESS_TOP_MARGIN=50;
const FOOTNOTE_EDGE={top:160,right:180,left:140};
const SECTION_TRACKING_MARGIN='-15% 0px -70% 0px';
let lastY=window.scrollY, barVisible=false, dropdownOpen=false;

// Once the introductory header has left the viewport, the persistent desktop
// navigation recedes. Pointer hover and keyboard focus restore it in CSS.
if(desktopSidebar&&articleHeader){
  new IntersectionObserver(([entry])=>{
    desktopSidebar.classList.toggle('is-reading',!entry.isIntersecting);
  }).observe(articleHeader);
}

// Reset scroll tracking when tab/app becomes visible again
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) lastY=window.scrollY; });
window.addEventListener('focus',()=>{ lastY=window.scrollY; });

// Back to top
if(btt) btt.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

function updateBackToTop(){
  if(btt) btt.classList.toggle(
    'visible',window.scrollY>window.innerHeight*BACK_TO_TOP_VIEWPORT_RATIO
  );
}

// Progress bar
function updateProgress(){
  if(!progressBar) return;
  const h=document.documentElement.scrollHeight-window.innerHeight;
  const pct=h>0?Math.min(100,window.scrollY/h*100):0;
  progressBar.style.width=pct+'%';
  progressBar.classList.toggle('at-top',window.scrollY<PROGRESS_TOP_MARGIN);
  if(mobileProgress)mobileProgress.style.width=pct+'%';
}

function hideMobileBar(){
  if(!mobileBar) return;
  mobileBar.classList.remove('visible');
  barVisible=false;
  if(dropdownOpen) closeDropdown();
  mobileBar.setAttribute('aria-hidden','true');
  mobileBar.inert=true;
  progressBar?.classList.remove('bar-hidden');
}

function resetMobileLayout(){
  hideMobileBar();
  lastY=window.scrollY;
}
if(mobileLayout.addEventListener) mobileLayout.addEventListener('change',resetMobileLayout);
else mobileLayout.addListener(resetMobileLayout);

// Scroll handler: back-to-top + mobile bar + progress
window.addEventListener('scroll',()=>{
  // Back to top visibility
  updateBackToTop();
  // Progress
  updateProgress();
  // Mobile bar: show on scroll-up, hide on scroll-down
  const y=window.scrollY;
  if(!mobileBar||!mobileLayout.matches){ lastY=y; return; }
  const scrolledPastHeader=articleHeader?articleHeader.getBoundingClientRect().bottom<0:y>0;
  const scrollingUp=y<lastY-SCROLL_DIRECTION_TOLERANCE;
  const scrollingDown=y>lastY+SCROLL_DIRECTION_TOLERANCE;
  if(scrolledPastHeader&&scrollingUp&&!barVisible){
    mobileBar.classList.add('visible');barVisible=true;
    mobileBar.setAttribute('aria-hidden','false');
    mobileBar.inert=false;
    if(progressBar) progressBar.classList.add('bar-hidden');
  }
  if((scrollingDown||!scrolledPastHeader)&&barVisible){
    hideMobileBar();
  }
  lastY=y;
},{passive:true});
updateProgress();
updateBackToTop();

// Dropdown TOC
let savedChapterText=mobileChapter?.textContent||'Вступление';

function openDropdown(){
  if(!mobileDropdown||!mobileBar||!tocBtn||!mobileChapter) return;
  dropdownOpen=true;
  mobileDropdown.classList.add('open');
  mobileDropdown.setAttribute('aria-hidden','false');
  mobileDropdown.inert=false;
  mobileBar.classList.add('dropdown-open');
  tocBtn.classList.add('open');
  tocBtn.setAttribute('aria-expanded','true');
  savedChapterText=mobileChapter.textContent;
  mobileChapter.textContent='Содержание';
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
  mobileChapter.textContent=sectionNames[mobileChapter.dataset.currentId]||savedChapterText;
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
      copy.querySelectorAll('a').forEach(a=>{
        a.classList.remove('active');
        a.removeAttribute('aria-current');
      });
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
const allTocLinks=document.querySelectorAll('#tocDesktopList a,#tocMobileList a,.toc-inline-list a');

function setCurrentSection(id){
  allTocLinks.forEach(link=>{
    const current=link.getAttribute('href')===`#${id}`;
    link.classList.toggle('active',current&&!!link.closest('#tocDesktopList'));
    link.classList.toggle('current',current&&!!link.closest('#tocMobileList'));
    if(current) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  });
  if(mobileChapter&&sectionNames[id]){
    mobileChapter.dataset.currentId=id;
    if(!dropdownOpen) mobileChapter.textContent=sectionNames[id];
  }
}

setCurrentSection('intro');
const obs=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){
  setCurrentSection(e.target.id);
}})},{rootMargin:SECTION_TRACKING_MARGIN});
sections.forEach(s=>obs.observe(s));

// Footnote popovers - position detection
function updateFnPositions(){
  document.querySelectorAll('.fn-ref').forEach(ref=>{
    const rect=ref.getBoundingClientRect();
    const vw=window.innerWidth;
    ref.classList.toggle('flip',rect.top<FOOTNOTE_EDGE.top);
    ref.classList.toggle('anchor-right',rect.left>vw-FOOTNOTE_EDGE.right);
    ref.classList.toggle('anchor-left',rect.left<FOOTNOTE_EDGE.left);
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
