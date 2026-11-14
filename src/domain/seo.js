import {parseOrigin} from '../config/environment.js';
import {readPageNumber} from './discovery.js';
import {verifiedTelephone} from './merchant.js';

export const jsonForHtml=value=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
const summary=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,160);
export const pageNumber=readPageNumber;
export function deploymentSettings(env={},requestUrl='http://127.0.0.1'){
  const url=new URL(requestUrl),configured=parseOrigin(env.SITE_URL||env.VITE_SITE_URL||'');
  const origin=configured||parseOrigin(url.origin)||'http://127.0.0.1';
  return {origin,brandName:(env.VITE_BRAND_NAME||'Rawatbhata One').slice(0,80),
    indexable:env.DEPLOYMENT_ENV==='production'&&env.SITE_INDEXING_ENABLED==='true'&&Boolean(configured?.startsWith('https://'))&&url.origin===configured};
}
export function pageMetadata({url,route,context,merchant,items=[],indexable=false,origin,brandName='Rawatbhata One',page=1}){
  const city=merchant?.city||context?.city,category=context?.categories?.find(c=>c.slug===route.categorySlug);
  const filtered=[...url.searchParams.keys()].some(key=>key!=='page');
  let path=merchant?.canonical_path||('/'+city.slug+(route.kind==='home'?'':route.kind==='category'?'/'+category.slug:route.kind==='search'?'/search':'/explore'));
  if(page>1&&route.kind!=='merchant'&&route.kind!=='home')path+='?page='+page;
  const canonical=origin+path;
  const heading=merchant?.name||(route.kind==='home'?city.name+', rediscovered':route.kind==='category'?category.name+' in '+city.name:route.kind==='search'?'Search local places in '+city.name:'Explore local places in '+city.name);
  const description=summary(merchant?.short_description||merchant?.description||category?.description||'Discover food, shops, stays, services and places to explore in '+city.name+' with '+brandName+'.');
  const real=merchant?!merchant.is_demo:items.some(item=>!item.is_demo);
  const allowed=indexable&&real&&!filtered&&route.kind!=='search'&&route.kind!=='explore';
  const media=merchant?.gallery?.find(image=>image.object_path===merchant.media?.object_path)||merchant?.gallery?.[0];
  const image=merchant&&!merchant.is_demo&&media?.id?origin+'/media/'+media.id:origin+'/images/share-card.png';
  const crumbs=[{name:city.name,url:origin+'/'+city.slug}];
  if(merchant)crumbs.push({name:merchant.category_name,url:origin+'/'+city.slug+'/'+merchant.category_slug},{name:merchant.name,url:canonical});
  else if(route.kind!=='home')crumbs.push({name:category?.name||'Explore',url:canonical});
  const graph=[{'@type':'WebSite','@id':origin+'/#website',name:brandName,url:origin+'/'},
    {'@type':'BreadcrumbList','@id':canonical+'#breadcrumbs',itemListElement:crumbs.map((item,i)=>({'@type':'ListItem',position:i+1,name:item.name,item:item.url}))},
    {'@type':merchant?'WebPage':'CollectionPage','@id':canonical,name:heading,url:canonical,description,isPartOf:{'@id':origin+'/#website'},breadcrumb:{'@id':canonical+'#breadcrumbs'}}];
  if(merchant&&!merchant.is_demo){
    const type={COMMERCE:'Store',RESTAURANT:'Restaurant',HOTEL:'LodgingBusiness',FITNESS:'ExerciseGym',ATTRACTION:'TouristAttraction',INFORMATIONAL:'Organization',SERVICE_PROVIDER:'LocalBusiness',GENERAL_BUSINESS:'LocalBusiness'}[merchant.listing_type]||'LocalBusiness';
    const entity={'@type':type,'@id':canonical+'#business',name:merchant.name,url:canonical,description,image,
      address:{'@type':'PostalAddress',addressLocality:city.name,addressRegion:city.state,addressCountry:'IN',...(merchant.address?{streetAddress:merchant.address}:{})}};
    const phone=verifiedTelephone(merchant);if(phone)entity.telephone=phone;
    if(merchant.latitude!==null&&merchant.longitude!==null&&Number.isFinite(Number(merchant.latitude))&&Number.isFinite(Number(merchant.longitude)))entity.geo={'@type':'GeoCoordinates',latitude:Number(merchant.latitude),longitude:Number(merchant.longitude)};
    if(merchant.status?.source==='weekly'&&merchant.weekly_hours?.length){
      const shifts=merchant.weekly_hours.filter(shift=>!shift.ends_next_day||shift.opens_at.slice(0,5)!==shift.closes_at.slice(0,5)||shift.opens_at.slice(0,5)==='00:00');
      if(shifts.length)entity.openingHoursSpecification=shifts.map(shift=>({'@type':'OpeningHoursSpecification',dayOfWeek:'https://schema.org/'+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][shift.weekday],opens:shift.opens_at.slice(0,5),closes:shift.ends_next_day&&shift.opens_at.slice(0,5)==='00:00'&&shift.closes_at.slice(0,5)==='00:00'?'23:59':shift.closes_at.slice(0,5)}));
    }
    graph.push(entity);graph[2].mainEntity={'@id':entity['@id']};
  }else if(!merchant){
    graph[2].mainEntity={'@type':'ItemList',itemListElement:items.filter(item=>!item.is_demo&&item.slug&&item.category_slug).slice(0,24).map((item,i)=>({'@type':'ListItem',position:(page-1)*12+i+1,name:item.name,url:origin+'/'+city.slug+'/'+item.category_slug+'/'+item.slug}))};
  }
  return {title:heading+(page>1?' · Page '+page:'')+' · '+brandName,description,canonical,image,imageAlt:merchant&&!merchant.is_demo?merchant.media?.alt_text||merchant.name:brandName+' — discover your town',
    type:merchant?'business.business':'website',robots:allowed?'index, follow, max-image-preview:large':'noindex, follow',structuredData:{'@context':'https://schema.org','@graph':graph}};
}
export function applyPageMetadata(meta,doc=document){
  doc.title=meta.title;
  function tag(key,value,attribute='name'){
    let node=doc.head.querySelector('meta['+attribute+'="'+key+'"]');if(!node){node=doc.createElement('meta');node.setAttribute(attribute,key);doc.head.append(node);}node.content=value;
  }
  tag('description',meta.description);tag('robots',meta.robots);
  for(const [key,value] of Object.entries({title:meta.title,description:meta.description,url:meta.canonical,image:meta.image,'image:alt':meta.imageAlt,type:meta.type,locale:'en_IN'}))tag('og:'+key,value,'property');
  tag('twitter:card','summary_large_image');tag('twitter:title',meta.title);tag('twitter:description',meta.description);tag('twitter:image',meta.image);tag('twitter:image:alt',meta.imageAlt);
  let canonical=doc.head.querySelector('link[rel="canonical"]');if(!canonical){canonical=doc.createElement('link');canonical.rel='canonical';doc.head.append(canonical);}canonical.href=meta.canonical;
  let json=doc.getElementById('page-structured-data');if(!json){json=doc.createElement('script');json.type='application/ld+json';json.id='page-structured-data';doc.head.append(json);}json.textContent=jsonForHtml(meta.structuredData);
}

