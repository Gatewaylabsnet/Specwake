import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
// Original Specwake mark, rendered from the same simple geometry as the application header.
const size=256, pixels=Buffer.alloc(size*size*4);
const lines=[[[50,78],[142,78]],[[142,78],[206,128]],[[206,128],[142,178]],[[142,178],[50,178]],[[50,178],[114,128]],[[114,128],[50,78]],[[50,128],[114,128]]];
function distance(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let coverage=0;
  for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++)if(lines.some(([a,b])=>distance(x+sx/4,y+sy/4,a,b)<9))coverage++;
  const i=(y*size+x)*4,c=coverage/16;pixels[i]=Math.round(255*(1-c)+33*c);pixels[i+1]=Math.round(255*(1-c)+101*c);pixels[i+2]=Math.round(255*(1-c)+196*c);pixels[i+3]=255;
}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc32(Buffer.concat([name,data])),data.length+8);return result;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
const raw=Buffer.alloc(size*(size*4+1));for(let y=0;y<size;y++)pixels.copy(raw,y*(size*4+1)+1,y*size*4,(y+1)*size*4);
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
await mkdir('build',{recursive:true});await writeFile('build/icon.png',png);await writeFile('build/icon.ico',Buffer.concat([header,png]));
