(function(){
  const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG']);
  function pageName(){const p=location.pathname.split('/').pop()||'index.html';return p||'index.html'}
  function elementPath(el){const parts=[];while(el&&el.nodeType===1&&el!==document.documentElement){let seg=el.tagName.toLowerCase();if(el.id){seg+='#'+el.id;parts.unshift(seg);break}const parent=el.parentElement;if(parent){const same=[...parent.children].filter(x=>x.tagName===el.tagName);if(same.length>1)seg+=`:nth-of-type(${same.indexOf(el)+1})`}parts.unshift(seg);el=parent}return parts.join('>')}
  function keyFor(page,node){const p=node.parentElement;if(!p)return'';const texts=[...p.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE);return page+'|'+elementPath(p)+'|t'+Math.max(0,texts.indexOf(node))}
  function nodes(root=document.body){const out=[];if(!root)return out;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(n){const p=n.parentElement;if(!p||SKIP.has(p.tagName)||p.closest('[data-cms-ignore]'))return NodeFilter.FILTER_REJECT;return n.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});let n;while(n=w.nextNode())out.push(n);return out}
  function replaceTrimmed(node,value){const raw=node.nodeValue,trim=raw.trim();if(!trim)return;const start=raw.indexOf(trim);node.nodeValue=raw.slice(0,start)+value+raw.slice(start+trim.length)}
  function apply(data){const page=pageName();const map=data?.textOverrides?.[page];if(!map||typeof map!=='object')return;for(const n of nodes()){const k=keyFor(page,n);if(Object.prototype.hasOwnProperty.call(map,k)&&typeof map[k]==='string'&&n.nodeValue.trim()!==map[k])replaceTrimmed(n,map[k])}}
  function watch(data){if(window.__zveenTextCmsObserver)return;let queued=false;const obs=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply(data)})});obs.observe(document.body,{subtree:true,childList:true,characterData:true});window.__zveenTextCmsObserver=obs}
  function activate(data){if(!data)return;apply(data);watch(data)}
  window.ZVEEN_TEXT_CMS={apply,watch,keyFor,nodes,pageName,activate};
  document.addEventListener('zveen:data',e=>activate(e.detail));
  if(window.ZVEEN_SITE_DATA){if(document.body)activate(window.ZVEEN_SITE_DATA);else document.addEventListener('DOMContentLoaded',()=>activate(window.ZVEEN_SITE_DATA),{once:true})}
})();
