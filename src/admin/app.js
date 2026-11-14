import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/admin.css';
import {readEnvironment} from '../config/environment.js';
import {createSupabaseClient} from '../data/supabase-client.js';
import {createAdminRepository} from '../data/admin-repository.js';
import {createAdminSession} from '../services/admin-session.js';
import {createMediaService} from '../services/media-service.js';
import {adminError} from '../domain/admin.js';
import {icon} from '../components/icons.js';
import {e,field,heading,badge,empty,button} from './ui.js';
import {merchantsPage} from './pages/merchants.js';
import {taxonomyPage} from './pages/taxonomy.js';
import {advertisementsPage} from './pages/advertisements.js';
import {rankingPage} from './pages/ranking.js';
import {hoursPage} from './pages/hours.js';
import {mediaPage} from './pages/media.js';
import {dateRange} from '../domain/analytics.js';

const config=readEnvironment(import.meta.env),client=createSupabaseClient(config,{admin:true});
const repo=client?createAdminRepository(client):null,media=client?createMediaService(client,config.supabaseUrl):null;
const root=document.querySelector('#admin-root');
const nav=[['overview','Overview','grid'],['merchants','Merchants','home'],['catalog','Products & imports','grid'],['categories','Categories','leaf'],['locations','Locations','pin'],['advertisements','Advertisements','spark'],['ranking','Homepage ranking','menu'],['hours','Business hours','clock'],['analytics','Enquiries & analytics','spark'],['media','Media library','grid']];
let user,context,dirty=false,epoch=0,cleanup,activeHash='',toastTimer,session,switchingCity=false;
const brand=`<span class="brand-mark" aria-hidden="true">r<span>1</span></span><span>${e(config.brandName)}<small>ADMIN WORKSPACE</small></span>`;
function toast(message,error=false) {
  const element=document.querySelector('.admin-toast');element.textContent=message;element.dataset.error=String(error);element.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{element.hidden=true;},6500);
}
function confirm(title,detail,accept='Continue') {
  const dialog=document.querySelector('#admin-confirm');if(dialog.open)return Promise.resolve(false);
  dialog.querySelector('h2').textContent=title;dialog.querySelector('[data-confirm-detail]').textContent=detail;dialog.querySelector('[data-confirm-accept]').textContent=accept;
  return new Promise(resolve=>{
    let accepted=false;dialog.querySelector('[data-confirm-accept]').onclick=()=>{accepted=true;dialog.close();};dialog.querySelector('[data-confirm-cancel]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>resolve(accepted),{once:true});dialog.showModal();dialog.querySelector('[data-confirm-cancel]').focus();
  });
}
function login(message='') {
  cleanup?.();++epoch;dirty=false;context=null;activeHash='';
  root.innerHTML=`<header class="admin-login-header"><a class="brand" href="/">${brand}</a><a href="/" class="text-link">Visit public site ${icon('arrow')}</a></header><main class="admin-login" id="main" tabindex="-1"><section class="admin-login-story"><p class="eyebrow">A little town. A lot of possibility.</p><p class="admin-login-title">Good things<br> start <em>locally.</em></p><p>One place to look after the businesses, stories and everyday discoveries that bring your town together.</p><div class="admin-town" aria-hidden="true"><span></span><i></i><i></i><i></i><i></i></div><p class="admin-login-caption">Thoughtfully local. Simply managed.</p></section><section class="admin-login-card"><span class="admin-lock">${icon('home')}</span><p class="eyebrow">Welcome back</p><h1>Sign in to your workspace</h1><p>Private access for the platform administrator.</p><form id="admin-login-form">${field('Email address','email','',{type:'email',required:true,autocomplete:'username',maxlength:254})}${field('Password','password','',{type:'password',required:true,autocomplete:'current-password',maxlength:256})}<p class="admin-form-error" role="alert" data-login-feedback>${e(message||(!client?'Supabase is not configured. Complete the project environment setup to sign in.':''))}</p><button class="button button-primary" type="submit"${client?'':' disabled'}>Sign in ${icon('arrow')}</button></form><p class="admin-login-note">Access is limited to your admin account. Closing this tab ends the saved session.</p></section></main><footer class="admin-login-footer">© ${new Date().getFullYear()} ${e(config.brandName)} · Built around your community</footer>`;
  document.querySelector('#admin-login-form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button'),feedback=form.querySelector('[data-login-feedback]');submit.disabled=true;feedback.textContent='Signing in…';
    try {await session.signIn(form.elements.email.value,form.elements.password.value);form.reset();}
    catch(error){const active=root.querySelector('[data-login-feedback]');if(active)active.textContent=adminError(error);submit.disabled=false;form.elements.password.value='';}
  };
}
function shell() {
  root.innerHTML=`<div class="admin-workspace"><aside class="admin-sidebar"><a class="brand" href="#overview">${brand}</a><p class="admin-nav-label">MANAGE YOUR PLATFORM</p><nav aria-label="Administration">${nav.map(([key,label,graphic])=>`<a href="#${key}" data-nav="${key}">${icon(graphic)}<span>${label}</span></a>`).join('')}</nav><div class="admin-sidebar-note">${icon('leaf')}<p>A small place.<br><strong>A connected community.</strong></p><a href="/" target="_blank" rel="noopener">Open public site ↗</a></div></aside><div class="admin-work"><header class="admin-topbar"><div class="admin-inline"><span class="admin-workspace-label">Your workspace</span><label class="admin-city">${icon('pin')}<span class="sr-only">Manage city</span><select aria-label="Manage city" id="admin-city">${context.cities.map(city=>`<option value="${e(city.id)}"${city.id===context.city_id?' selected':''}>${e(city.name)}${city.enabled?'':' · Disabled'}</option>`).join('')}</select></label></div><div class="admin-account"><span class="admin-avatar" aria-hidden="true">A</span><span class="admin-account-email">${e(user.email||'Administrator')}<small>Platform administrator</small></span><button class="button button-secondary" type="button" id="admin-sign-out">Sign out</button></div></header><main id="main" class="admin-content" tabindex="-1"></main><footer class="admin-work-footer">${e(config.brandName)} <span>Made for the neighbourhood.</span></footer></div></div>`;
  root.querySelector('#admin-sign-out').onclick=async()=>{if(dirty&&!await confirm('Discard unsaved changes?','Your form changes have not been saved.','Discard & sign out'))return;await session.signOut().catch(error=>toast(error.message,true));};
  root.querySelector('#admin-city').onchange=async event=>{
    const choice=event.target.value;
    if(dirty&&!await confirm('Change city?','Unsaved form changes will be discarded.','Change city')){event.target.value=context.city_id;return;}
    const attempt=++epoch;
    switchingCity=true;event.target.disabled=true;root.querySelector('.admin-sidebar nav').inert=true;
    cleanup?.();cleanup=null;root.querySelector('#main').innerHTML='<div class="admin-loading" role="status">Changing city…</div>';
    try{const selected=await repo.context(choice);if(attempt!==epoch||!user)return;context=selected;try{sessionStorage.setItem('rawatbhata-one-admin-city',context.city_id);}catch{/* Optional preference. */}dirty=false;history.replaceState(null,'','#overview');shell();}
    catch(error){if(user){dirty=false;shell();toast(adminError(error),true);}}
    finally{switchingCity=false;if(user&&context)await render();}
  };
}
root.addEventListener('click',async event=>{
  const link=event.target.closest('a[href^="#"]');if(!link)return;const hash=link.getAttribute('href');if(hash==='#main')return;event.preventDefault();await navigate(hash);
});
async function navigate(hash) {
  if(switchingCity)return false;
  if(dirty&&!await confirm('Discard unsaved changes?','Your changes have not been saved.','Discard changes'))return false;
  dirty=false;if(location.hash===hash)await render();else location.hash=hash;return true;
}
async function render() {
  if(!user||!context)return;
  cleanup?.();cleanup=null;const version=++epoch;
  activeHash=location.hash||'#overview';const [route,id]=activeHash.slice(1).split('/');const page=nav.some(item=>item[0]===route)?route:'overview';
  root.querySelectorAll('[data-nav]').forEach(link=>{if(link.dataset.nav===page)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  const main=root.querySelector('#main');main.innerHTML='<div class="admin-loading" role="status">Getting things ready…</div>';
  const app={repo,client,session,context,config,media,root:main,id,route:page,
    mount(html){if(version!==epoch||!user)return false;main.innerHTML=html;return true;},
    setDirty(value){if(version===epoch)dirty=value;},navigate,confirm,toast,current:()=>version===epoch&&Boolean(user),
    setCleanup(fn){if(version===epoch){cleanup?.();cleanup=fn;}else fn?.();},
    async refreshContext(){
      const updated=await repo.context(context.city_id);
      if(version===epoch){context=updated;app.context=updated;const selector=root.querySelector('#admin-city');if(selector)selector.innerHTML=updated.cities.map(city=>`<option value="${e(city.id)}"${city.id===updated.city_id?' selected':''}>${e(city.name)}${city.enabled?'':' · Disabled'}</option>`).join('');}
      return updated;
    },
    async run(element,fn,success){
      // A dialog can resolve after browser history or sign-out has replaced this page.
      if(version!==epoch||!user||element?.disabled)return;if(element)element.disabled=true;
      const feedback=element?.closest('form')?.querySelector('[data-form-feedback]');if(feedback){feedback.textContent='Saving…';feedback.classList.remove('admin-form-error');}
      try{const result=await fn();if(version!==epoch)return result;if(success)await success(result);return result;}
      catch(error){if(version!==epoch)return;if(feedback){feedback.textContent=adminError(error);feedback.classList.add('admin-form-error');}else toast(adminError(error),true);if(error.code==='42501')await session.verify();}
      finally{if(element?.isConnected)element.disabled=false;}
    },
  };
  try {
    if(page==='overview')await overview(app);
    else if(page==='merchants')await merchantsPage(app,id);
    else if(page==='catalog'){const {catalogPage}=await import('./pages/catalog.js');await catalogPage(app,id);}
    else if(page==='categories'||page==='locations')await taxonomyPage(app,id);
    else if(page==='advertisements')await advertisementsPage(app,id);
    else if(page==='ranking')await rankingPage(app,id);
    else if(page==='hours')await hoursPage(app,id);
    else if(page==='analytics'){const {analyticsPage}=await import('./pages/analytics.js');await analyticsPage(app);}
    else await mediaPage(app,id);
    if(version===epoch){document.title=`${nav.find(item=>item[0]===page)[1]} · ${config.brandName}`;main.focus({preventScroll:true});}
  }catch(error){if(app.mount(heading('Workspace','Unable to load this page')+empty(adminError(error))+button('Try again','retry')))main.querySelector('[data-action="retry"]').onclick=render;if(error.code==='42501')await session.verify();}
}
async function overview(app) {
  const city=context.cities.find(c=>c.id===context.city_id),range=dateRange(30,new Date(),city?.timezone||'Asia/Kolkata');
  const [data,activity]=await Promise.all([repo.overview(context.city_id),repo.analytics(context.city_id,range.from,range.to,false)]);
  const cards=[['All merchants',data.listings,'In your city','home'],['Discoverable listings',data.discoverable,'Published, enabled & visible','leaf'],['Active advertisements',data.active_ads,'Currently eligible to appear','spark'],['Checkout initiations',data.checkout_initiations,'Enquiries, not confirmed orders','arrow'],['Listing views',activity.totals.listing_views,'Last 30 days · excludes demos','home'],['WhatsApp link clicks',activity.totals.whatsapp_clicks,'Last 30 days · reported clicks','arrow']];
  app.mount(heading('Your city, at a glance','A good day to grow locally.',`Here’s what’s happening in ${city?.name||'your city'}.`,`<a class="button button-primary" href="#merchants/new">+ Add merchant</a>`)+`<div class="admin-stat-grid">${cards.map(([title,count,detail,graphic])=>`<article class="admin-stat">${icon(graphic)}<span>${e(title)}</span><strong>${Number(count).toLocaleString('en-IN')}</strong><small>${e(detail)}</small></article>`).join('')}</div><div class="admin-overview-grid"><section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">Keep things moving</p><h2>Your next steps</h2></div>${badge('Quick access','green')}</div><div class="admin-quick-links"><a href="#merchants">${icon('home')}<span><strong>Look after your listings</strong><small>${e(data.drafts)} drafts · ${e(data.disabled)} disabled · ${e(data.published)} published</small></span>${icon('chevron')}</a><a href="#ranking">${icon('menu')}<span><strong>Curate the homepage</strong><small>Choose the four places that lead each section</small></span>${icon('chevron')}</a><a href="#hours">${icon('clock')}<span><strong>Keep business hours useful</strong><small>Weekly schedules, holidays and temporary closures</small></span>${icon('chevron')}</a></div></section><section class="admin-card admin-community-card"><span class="admin-orbit" aria-hidden="true">${icon('leaf')}</span><p class="eyebrow">Room to discover</p><h2>Small businesses.<br>Endless possibilities.</h2><p>${e(data.categories)} enabled categories and ${e(data.products)} active products, ready for your community to explore.</p><a class="text-link" href="/${e(city?.slug||'')}" target="_blank" rel="noopener">Take a look outside ${icon('arrow')}</a></section></div><section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">Recently updated</p><h2>Fresh from your workspace</h2></div><a href="#merchants" class="text-link">All merchants ${icon('arrow')}</a></div>${data.recent.length?`<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Merchant</th><th>Publication</th><th>Listing</th><th>Last updated</th></tr></thead><tbody>${data.recent.map(item=>`<tr><td><a href="#merchants/${e(item.id)}">${e(item.name)}</a></td><td>${badge(item.publication_status,item.publication_status==='published'?'green':'neutral')}</td><td>${badge(item.enabled?'Enabled':'Disabled')}</td><td>${e(new Date(item.updated_at).toLocaleDateString('en-IN'))}</td></tr>`).join('')}</tbody></table></div>`:empty('Your first listing starts here','Add a merchant to begin building your local discovery experience.')}</section>`);
}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',async()=>{
  if(!user||switchingCity)return;
  if(dirty&&!await confirm('Discard unsaved changes?','Your form changes have not been saved.','Discard changes')){history.replaceState(null,'',activeHash||'#overview');return;}
  dirty=false;await render();
});
if(client){
  session=createAdminSession(client,async state=>{
    if(!state.user){user=null;login(state.message);return;}
    if(user?.id===state.user.id&&context)return;
    user=state.user;const version=++epoch;
    try{let preferred;try{preferred=sessionStorage.getItem('rawatbhata-one-admin-city');}catch{/* Optional preference. */}const loaded=await repo.context(/^[a-f0-9-]{36}$/i.test(preferred||'')?preferred:null);if(version!==epoch||!user)return;context=loaded;dirty=false;shell();await render();}
    catch(error){if(version===epoch){user=null;login(adminError(error));}}
  });
  await session.start();
}else login();
