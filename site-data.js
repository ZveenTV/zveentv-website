(function(){
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function updateSocials(s){
    if(!s)return;
    const map={twitch:s.twitch,discord:s.discord,youtube:s.youtube,instagram:s.instagram,tiktok:s.tiktok};
    document.querySelectorAll('a[href]').forEach(a=>{
      const h=a.getAttribute('href')||'';
      if(h.includes('twitch.tv/zveentv')&&map.twitch)a.href=map.twitch;
      else if(h.includes('discord.com/invite')&&map.discord)a.href=map.discord;
      else if(h.includes('youtube.com/@zveentv')&&map.youtube)a.href=map.youtube;
      else if(h.includes('instagram.com/zveentv')&&map.instagram)a.href=map.instagram;
      else if(h.includes('tiktok.com/@zveen.tv')&&map.tiktok)a.href=map.tiktok;
    });
  }
  function renderEquipment(target,rows){
    if(!target||!Array.isArray(rows))return;
    target.querySelectorAll('.equip-item').forEach(x=>x.remove());
    rows.forEach(r=>{
      const [label,value,url]=r;
      const el=document.createElement(url?'a':'div');
      el.className='equip-item';
      if(url){el.href=url;el.target='_blank';el.rel='noopener';}
      el.innerHTML=`<div><div class="label">${esc(label)}</div><div class="value${url?'':' unavailable'}">${esc(value)}${url?'':'<span class="tag-unavail">Nicht mehr erhältlich</span>'}</div></div><span class="ext">${url?'↗':'⊘'}</span>`;
      target.appendChild(el);
    });
  }
  async function boot(){
    let data;
    try{const r=await fetch('/site-data.json',{cache:'no-store'});if(!r.ok)return;data=await r.json();}catch(_){return;}
    window.ZVEEN_SITE_DATA=data;
    updateSocials(data.socials);
    const tagline=document.querySelector('.hero-home .tagline');if(tagline&&data.home?.tagline)tagline.textContent=data.home.tagline;
    const stats=document.getElementById('aboutSteckbrief');if(stats&&Array.isArray(data.about?.stats))stats.innerHTML=data.about.stats.map((r,i)=>`<div class="stat-row"><span class="label">${esc(r[0])}</span><span class="value${i===6?' accent':''}">${esc(r[1])}</span></div>`).join('');
    const lede=document.getElementById('aboutLede');if(lede&&data.about?.lede)lede.textContent=data.about.lede;
    const paras=document.getElementById('aboutParagraphs');if(paras&&Array.isArray(data.about?.paragraphs))paras.innerHTML=data.about.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('');
    renderEquipment(document.querySelector('[data-equip="pc"]'),data.equipment?.pc);
    renderEquipment(document.querySelector('[data-equip="audio"]'),data.equipment?.audio);
    renderEquipment(document.querySelector('[data-equip="accessories"]'),data.equipment?.accessories);
    document.dispatchEvent(new CustomEvent('zveen:data',{detail:data}));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();