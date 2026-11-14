export function cityDate(now=new Date(),timezone='Asia/Kolkata'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=type=>parts.find(part=>part.type===type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
export function dateRange(days=30,now=new Date(),timezone='Asia/Kolkata'){
  const to=cityDate(now,timezone),from=new Date(to+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-days+1);
  return {from:from.toISOString().slice(0,10),to};
}
export function clickThroughRate(clicks,impressions){return impressions>0?(clicks/impressions*100).toFixed(1)+'%':'—';}
