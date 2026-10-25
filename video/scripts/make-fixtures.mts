import {fragment} from '/workspace/Gallery-Arcana-video-source/web/src/lib/fragments.ts';
import sharp from '/workspace/Gallery-Arcana-video-source/node_modules/sharp/dist/index.cjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='/workspace/Gallery-Arcana-video/fixtures';mkdirSync(dir,{recursive:true});
for(let i=0;i<8;i++){const f=fragment(i);writeFileSync(`${dir}/fragment-${i}.svg`,f.svg);await sharp(Buffer.from(f.svg)).png().toFile(`${dir}/fragment-${i}.png`);}
