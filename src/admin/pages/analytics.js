import '../../styles/analytics.css';
import {dateRange,clickThroughRate} from '../../domain/analytics.js';
import {e,heading,field,select,check,badge,empty} from '../ui.js';
import {trackingMarkup} from '../components/checkout-tracking.js';
const count=value=>Number(value||0).toLocaleString('en-IN');
function chart(rows){
  const max=Math.max(1,...rows.map(row=>Number(row.views))),step=880/rows.length;
  return '<svg class="analytics-chart" viewBox="0 0 900 180" role="img" aria-labelledby="activity-chart-title activity-chart-description"><title id="activity-chart-title">Daily listing view reports</title><desc id="activity-chart-description">'+e(rows.map(row=>row.date+': '+row.views+' views').join('; '))+'</desc><line x1="10" y1="150" x2="890" y2="150" class="analytics-axis"></line>'+rows.map((row,i)=>'<rect class="analytics-bar" x="'+(10+i*step+1).toFixed(2)+'" y="'+(150-Number(row.views)/max*130).toFixed(2)+'" width="'+Math.max(1,step-2).toFixed(2)+'" height="'+(Number(row.views)/max*130).toFixed(2)+'" rx="2"><title>'+e(row.date+': '+row.views+' reported views')+'</title></rect>').join('')+'<text x="10" y="174">'+e(rows[0]?.date||'')+'</text><text x="890" y="174" text-anchor="end">'+e(rows.at(-1)?.date||'')+'</text></svg>';
}
function resultsMarkup(data){
  const t=data.totals,stats=[['Listing views',t.listing_views,'Reported page views'],['Contact link clicks',Number(t.phone_clicks)+Number(t.directions_clicks)+Number(t.whatsapp_clicks),'Calls, directions & WhatsApp'],['Visible promotion impressions',t.ad_impressions,'Qualified browser reports'],['Promotion clicks',t.ad_clicks,'CTR '+clickThroughRate(t.ad_clicks,t.ad_impressions)],['Checkout initiations',t.checkout_initiations,'Recorded enquiry initiations'],['Handoffs prepared',t.handoffs_prepared,'Links prepared; sending unverified'],['WhatsApp link clicks',t.whatsapp_clicks,'Reported outbound link clicks'],['Calls / directions',count(t.phone_clicks)+' / '+count(t.directions_clicks),'Reported contact-link activity']];
  return '<p class="admin-helper analytics-period" role="status">'+e(data.from)+' – '+e(data.to)+' · '+e(data.timezone)+' · '+(data.include_demo?'Includes fictional demo activity':'Excludes fictional demo activity')+'</p><div class="admin-stat-grid">'+stats.map(([label,value,detail])=>'<article class="admin-stat"><span>'+e(label)+'</span><strong>'+e(typeof value==='string'?value:count(value))+'</strong><small>'+e(detail)+'</small></article>').join('')+'</div><section class="admin-card"><div class="admin-section-heading"><div><p class="eyebrow">A little perspective</p><h2>Discovery through the days</h2></div>'+badge('Daily activity','green')+'</div>'+chart(data.daily)+'<details class="analytics-daily"><summary>View daily figures</summary><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Date</th><th>Views</th><th>Contact clicks</th><th>Ad impressions</th><th>Ad clicks</th><th>Initiations</th><th>Handoffs</th></tr></thead><tbody>'+data.daily.map(row=>'<tr><td>'+e(row.date)+'</td>'+['views','contact_clicks','impressions','ad_clicks','initiations','handoffs'].map(key=>'<td>'+count(row[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details></section><div class="analytics-tables"><section class="admin-card"><h2>Places drawing attention</h2>'+(data.listings.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Merchant</th><th>Views</th><th>Contact clicks</th></tr></thead><tbody>'+data.listings.map(row=>'<tr><td><a href="#merchants/'+e(row.id)+'">'+e(row.name)+'</a></td><td>'+count(row.views)+'</td><td>'+count(row.contact_clicks)+'</td></tr>').join('')+'</tbody></table></div>':empty('No listing activity yet','Counts appear after eligible activity is reported.'))+'</section><section class="admin-card"><h2>Promotions in view</h2>'+(data.advertisements.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Promotion</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead><tbody>'+data.advertisements.map(row=>'<tr><td>'+e(row.title)+'</td><td>'+count(row.impressions)+'</td><td>'+count(row.clicks)+'</td><td>'+clickThroughRate(row.clicks,row.impressions)+'</td></tr>').join('')+'</tbody></table></div>':empty('No promotion activity yet','A banner must be loaded and visible before an impression can qualify.'))+'</section></div><section class="admin-card analytics-note"><h2>What these numbers mean</h2><p>Views and clicks are approximate browser reports, not unique visitors or audited billing figures. Privacy preferences, blockers, bots, navigation and network failures affect reporting. Repeated clicks can make CTR exceed 100%; no impressions are invented to adjust it.</p><p>Enquiry initiation and handoff counts come from the trusted checkout records, independently of browser analytics. No customer identifiers or enquiry notes are included here.</p></section>';
}
export async function analyticsPage(app){
  const trackingReady=app.context.delivery_tracking_ready!==false;
  const city=app.context.cities.find(city=>city.id===app.context.city_id),range=dateRange(30,new Date(),city?.timezone||'Asia/Kolkata');
  const markup=heading('Enquiries & analytics','See what brings people closer.','Merchant checkout initiations and city-wide discovery activity.')+
    '<section class="admin-card"><form class="analytics-filters" data-analytics-form>'+field('From','analytics-from',range.from,{type:'date',required:true})+field('Through','analytics-to',range.to,{type:'date',required:true,max:range.to})+
    select('Merchant/shop','tracking-merchant',[{id:'',name:'All Merchants'}],'')+select('Sort merchant summary','tracking-sort',[{id:'count',name:'Checkout count'},{id:'value',name:'Estimated value'}],'count')+
    check('Include fictional demo activity','include-demo',false)+'<button type="submit" class="button button-primary">Update report</button></form><div class="admin-inline analytics-presets">'+[7,30,90].map(days=>'<button class="button button-secondary" type="button" data-range="'+days+'">Last '+days+' days</button>').join('')+'</div><p class="admin-helper">Choose up to 90 days. The merchant filter applies to Order Tracking; discovery views and promotions below remain city-wide.</p><details><summary>Find more merchants</summary><form class="admin-toolbar" data-tracking-search>'+field('Find a merchant for tracking','tracking-query','',{type:'search',maxlength:100})+'<button type="submit" class="button button-secondary">Search merchants</button><button type="button" class="button button-secondary" data-more-tracking-merchants hidden>More merchant options</button></form><p role="status" data-tracking-options-status></p></details><p data-analytics-error class="admin-form-error" role="alert"></p></section><div data-analytics-results aria-live="polite"><p role="status">Loading activity...</p></div>';
  if(!app.mount(markup))return;
  const form=app.root.querySelector('[data-analytics-form]'),holder=app.root.querySelector('[data-analytics-results]'),error=app.root.querySelector('[data-analytics-error]'),picker=form.elements['tracking-merchant'];
  if(!trackingReady){
    picker.closest('label').hidden=true;form.elements['tracking-sort'].closest('label').hidden=true;
    app.root.querySelector('[data-tracking-search]').closest('details').hidden=true;
    app.root.querySelector('.analytics-presets + .admin-helper').textContent='Choose up to 90 days. Existing city-wide activity is available; merchant-wise tracking requires reviewed migration 10.';
  }
  let sequence=0,loading=false,activityOffset=0,summaryOffset=0,optionsOffset=0,optionsQuery='',optionsVersion=0;
  const options=new Map();
  async function loadOptions(append=false){
    if(!trackingReady)return;
    const version=++optionsVersion;if(!append)optionsOffset=0;
    const result=await app.repo.checkoutMerchants(app.context.city_id,optionsQuery,optionsOffset);
    if(!app.current()||version!==optionsVersion)return;
    const chosen=picker.value,previous=options.get(chosen);if(!append)options.clear();
    for(const row of result.items)options.set(row.id,row);if(chosen&&previous&&!options.has(chosen))options.set(chosen,previous);
    picker.innerHTML='<option value="">All Merchants</option>'+[...options.values()].map(row=>'<option value="'+e(row.id)+'">'+e(row.name)+(row.archived_at||row.publication_status==='archived'?' (archived)':!row.enabled?' (disabled)':'')+'</option>').join('');
    picker.value=chosen;optionsOffset=result.next_offset;
    app.root.querySelector('[data-more-tracking-merchants]').hidden=!result.has_more;
    app.root.querySelector('[data-tracking-options-status]').textContent=result.items.length?'Choose a merchant in the Merchant/shop filter.':'No matching merchants. All Merchants remains available.';
  }
  async function load(reset=true){
    if(loading)return;if(reset){activityOffset=0;summaryOffset=0;}
    const attempt=++sequence;error.textContent='';const from=form.elements['analytics-from'].value,to=form.elements['analytics-to'].value,includeDemo=form.elements['include-demo'].checked;
    if(!from||!to||Date.parse(to)<Date.parse(from)||(Date.parse(to)-Date.parse(from))/86400000>89){error.textContent='Choose a valid range of up to 90 days.';return;}
    loading=true;const controls=app.root.querySelectorAll('[data-analytics-form] input,[data-analytics-form] select,[data-range],[data-tracking-page]');controls.forEach(control=>{control.disabled=true;});
    let rendered=false;
    try{await app.run(form.querySelector('[type=submit]'),()=>Promise.all([
      app.repo.analytics(app.context.city_id,from,to,includeDemo),
      trackingReady?app.repo.checkoutTracking(app.context.city_id,from,to,picker.value,form.elements['tracking-sort'].value,activityOffset,summaryOffset,includeDemo):null,
    ]),([discovery,tracking])=>{if(attempt===sequence&&app.current()){rendered=true;holder.innerHTML=(tracking?trackingMarkup(tracking,{activityOffset,summaryOffset}):'')+'<h2 class="discovery-analytics-heading">City-wide discovery</h2>'+resultsMarkup(discovery);}});
      if(!rendered&&app.current())holder.innerHTML='<p role="alert">This report could not be loaded. Your filters are saved; use Update report to try again.</p>';
    }
    finally{loading=false;if(app.current())controls.forEach(control=>{control.disabled=false;});}
  }
  form.onsubmit=event=>{event.preventDefault();load();};
  picker.onchange=()=>load();form.elements['tracking-sort'].onchange=()=>load();
  app.root.querySelectorAll('[data-range]').forEach(button=>{button.onclick=()=>{const next=dateRange(Number(button.dataset.range),new Date(),city?.timezone||'Asia/Kolkata');form.elements['analytics-from'].value=next.from;form.elements['analytics-to'].value=next.to;load();};});
  app.root.querySelector('[data-tracking-search]').onsubmit=event=>{event.preventDefault();optionsQuery=event.currentTarget.elements['tracking-query'].value.trim();app.run(event.currentTarget.querySelector('[type=submit]'),()=>loadOptions());};
  app.root.querySelector('[data-more-tracking-merchants]').onclick=event=>app.run(event.currentTarget,()=>loadOptions(true));
  holder.addEventListener('click',event=>{const page=event.target.closest('[data-tracking-page]')?.dataset.trackingPage;if(!page||loading)return;const direction=page.endsWith('next')?20:-20;if(page.startsWith('activity'))activityOffset=Math.max(0,activityOffset+direction);else summaryOffset=Math.max(0,summaryOffset+direction);load(false);});
  app.setCleanup(()=>{++sequence;++optionsVersion;});
  await app.run(null,()=>loadOptions());await load();
}
