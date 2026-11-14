export const MAX_IMAGE_BYTES=5*1024*1024;
export const MAX_IMAGE_EDGE=1600;
const ascii=(data,start,length)=>String.fromCharCode(...data.subarray(start,start+length));
const uint24=(data,offset)=>data[offset]+data[offset+1]*256+data[offset+2]*65536;
function frameDimensions(data,kind) {
  if(kind==='VP8 '&&data.length>=10&&!(data[0]&1)&&ascii(data,3,3)==='\x9d\x01\x2a')return {width:(data[6]+data[7]*256)&16383,height:(data[8]+data[9]*256)&16383,alpha:false};
  if(kind==='VP8L'&&data.length>=5&&data[0]===47&&!(data[4]&224))return {width:1+((data[1]+data[2]*256)&16383),height:1+((data[2]>>6)+(data[3]<<2)+((data[4]&15)<<10)),alpha:Boolean(data[4]&16)};
  throw new Error('The image does not contain a supported WebP frame.');
}
// Structural validation of canonical, metadata-free browser output. This is not a codec decoder.
export function validateWebP(input) {
  const data=input instanceof Uint8Array?input:new Uint8Array(input);
  if(data.length<26||data.length>MAX_IMAGE_BYTES||ascii(data,0,4)!=='RIFF'||ascii(data,8,4)!=='WEBP')throw new Error('Upload a valid WebP image under 5 MiB.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(view.getUint32(4,true)+8!==data.length)throw new Error('The image container length is invalid.');
  const chunks=[];let offset=12;
  while(offset<data.length){
    if(offset+8>data.length)throw new Error('The image container is incomplete.');
    const kind=ascii(data,offset,4),size=view.getUint32(offset+4,true),end=offset+8+size,padded=end+(size%2);
    if(!size||padded>data.length||chunks.length>=3||size%2&&data[end]!==0)throw new Error('The image chunks are invalid.');
    if(!['VP8X','ALPH','VP8 ','VP8L'].includes(kind)||chunks.some(chunk=>chunk.kind===kind))throw new Error('Animated images and metadata are not allowed.');
    chunks.push({kind,data:data.subarray(offset+8,end)});offset=padded;
  }
  const extended=chunks[0]?.kind==='VP8X'?chunks.shift():null,alpha=chunks[0]?.kind==='ALPH'?chunks.shift():null;
  if(chunks.length!==1||!['VP8 ','VP8L'].includes(chunks[0].kind)||alpha&&(!extended||chunks[0].kind!=='VP8 '))throw new Error('The image frame layout is invalid.');
  const dimensions=frameDimensions(chunks[0].data,chunks[0].kind);
  if(extended){const x=extended.data;if(x.length!==10||x[0]&~16||x[1]||x[2]||x[3]||uint24(x,4)+1!==dimensions.width||uint24(x,7)+1!==dimensions.height||Boolean(x[0]&16)!==Boolean(alpha||dimensions.alpha))throw new Error('The image dimensions or features are invalid.');}
  if(!dimensions.width||!dimensions.height||dimensions.width>MAX_IMAGE_EDGE||dimensions.height>MAX_IMAGE_EDGE)throw new Error('Images must be resized to at most 1600 pixels per edge.');
  return {width:dimensions.width,height:dimensions.height};
}
// Some browser canvas encoders add an sRGB ICC profile. Strip it, EXIF and XMP
// from freshly decoded/re-encoded output; the server still accepts canonical output only.
export function stripWebPMetadata(input) {
  const data=input instanceof Uint8Array?input:new Uint8Array(input);
  if(data.length<26||data.length>MAX_IMAGE_BYTES||ascii(data,0,4)!=='RIFF'||ascii(data,8,4)!=='WEBP')throw new Error('The browser produced an invalid WebP image.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),chunks=[];let offset=12,count=0;
  if(view.getUint32(4,true)+8!==data.length)throw new Error('The image length is invalid.');
  while(offset<data.length){
    if(offset+8>data.length||count++>8)throw new Error('The image chunks are invalid.');
    const kind=ascii(data,offset,4),size=view.getUint32(offset+4,true),end=offset+8+size+(size%2);
    if(!size||end>data.length||!['VP8X','ALPH','VP8 ','VP8L','ICCP','EXIF','XMP '].includes(kind))throw new Error('Animated or unsupported image output.');
    if(!['ICCP','EXIF','XMP '].includes(kind)){
      const chunk=data.slice(offset,end);if(kind==='VP8X'){if(size!==10||chunk[8]&~60)throw new Error('Unsupported image features.');chunk[8]&=16;}
      chunks.push(chunk);
    }
    offset=end;
  }
  const result=new Uint8Array(12+chunks.reduce((total,chunk)=>total+chunk.length,0));result.set(data.subarray(0,12));new DataView(result.buffer).setUint32(4,result.length-8,true);offset=12;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}validateWebP(result);return result;
}
export function inputDimensions(data,type) {
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(type==='image/png'&&data.length>=24&&ascii(data,0,8)==='\x89PNG\r\n\x1a\n'&&ascii(data,12,4)==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20)};
  if(type==='image/jpeg'&&data[0]===255&&data[1]===216){
    let offset=2;
    while(offset+4<data.length){
      if(data[offset++]!==255)break;while(data[offset]===255)offset++;const marker=data[offset++];if(marker===217||marker===218)break;
      const size=view.getUint16(offset);if(size<2||offset+size>data.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return {height:view.getUint16(offset+3),width:view.getUint16(offset+5)};
      offset+=size;
    }
  }
  if(type==='image/webp'&&data.length>=30&&ascii(data,0,4)==='RIFF'&&ascii(data,8,4)==='WEBP'){
    const kind=ascii(data,12,4);if(kind==='VP8X'&&data.length>=30)return {width:uint24(data,24)+1,height:uint24(data,27)+1};
    return frameDimensions(data.subarray(20),kind);
  }
  throw new Error('Choose a valid JPEG, PNG or WebP photograph.');
}
