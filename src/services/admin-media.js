import {MAX_IMAGE_BYTES,MAX_IMAGE_EDGE,inputDimensions,stripWebPMetadata} from '../domain/admin-media.js';
export async function prepareAdminImage(file) {
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<24||file.size>MAX_IMAGE_BYTES)throw new Error('Choose a JPEG, PNG or WebP image under 5 MiB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),size=inputDimensions(bytes,file.type);
  if(!size.width||!size.height||size.width>8192||size.height>8192||size.width*size.height>16000000)throw new Error('Choose an image under 16 megapixels and 8192 pixels per edge.');
  let image;
  try {image=await createImageBitmap(file);}catch{throw new Error('This image could not be decoded. Try another photograph.');}
  try {
    if(image.width*image.height>16000000)throw new Error('Choose an image under 16 megapixels.');
    const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
    if(!blob||blob.type!=='image/webp')throw new Error('This browser cannot create WebP images. Use a current Chrome, Edge, Firefox or Safari browser.');
    return new Blob([stripWebPMetadata(await blob.arrayBuffer())],{type:'image/webp'});
  }finally{image.close();}
}
export async function adminMediaRequest(session,body) {
  const headers={Authorization:'Bearer '+await session.token()};
  if(!(body instanceof FormData))headers['Content-Type']='application/json';
  const response=await fetch('/api/admin/media',{method:'POST',headers,body:body instanceof FormData?body:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||'The media request could not be completed.'),{code:data.code});return data;
}
