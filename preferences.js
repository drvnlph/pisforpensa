// Shared display preferences are applied from <head> before the stylesheets,
// so article and archive use the same theme without a flash of the default.
(()=>{
  const STORAGE_KEY='pfp:prefs';
  const defaults={color:'slate',links:'quiet'};
  const allowed={
    color:new Set(['slate','olive','charcoal','wine']),
    links:new Set(['host','mark','quiet'])
  };
  const root=document.documentElement;

  function read(){
    try{
      const value=JSON.parse(localStorage.getItem(STORAGE_KEY));
      return value&&typeof value==='object'?value:{};
    }catch(error){ return {} }
  }

  function apply(values=read()){
    for(const key of Object.keys(defaults)){
      const markupValue=root.dataset[key];
      const fallback=allowed[key].has(markupValue)?markupValue:defaults[key];
      root.dataset[key]=allowed[key].has(values[key])?values[key]:fallback;
    }
  }

  function write(key,value){
    if(!allowed[key]?.has(value)) return;
    const values=read();
    values[key]=value;
    root.dataset[key]=value;
    try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(values)) }
    catch(error){ /* The setting still applies for this visit. */ }
  }

  window.PFPPreferences={apply,read,write};
  apply();
})();
