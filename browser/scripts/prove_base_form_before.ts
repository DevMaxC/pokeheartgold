/** Reproduce the actual pinned old browser factory's missing-form defect. */
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMon,calculateStats,speciesName} from '../src/source/data.ts';
import {nativeMonGender} from '../src/source/gender.ts';
import type {GameData} from '../src/source/types.ts';
const source=await readFile(new URL('../reviews/base-form-admission/old-factory-data.ts.txt',import.meta.url),'utf8'),pin=JSON.parse(await readFile(new URL('../reviews/base-form-admission/old-factory.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(source).digest('hex'),pin.sha256);
const start=source.indexOf('export function createMon(');let at=source.indexOf('{',start),depth=1;for(at++;depth;at++){if(source[at]==='{')depth++;if(source[at]==='}')depth--;}
const oldFactory=Function('nativeMonGender','calculateStats','speciesName',stripTypeScriptTypes(source.slice(start,at).replace('export function','function'),{mode:'transform'})+';return createMon;')(nativeMonGender,calculateStats,speciesName)as typeof createMon;
const[personal,moves,learnsets,growth,names]=await Promise.all(['pokemon.json','moves.json','learnsets.json','growth.json','names.json'].map(async p=>JSON.parse(await readFile(new URL('../public/source/'+p,import.meta.url),'utf8'))));
const data={personal:personal.baseStats,moves,learnsets,growth,names}as GameData,old=oldFactory(data,155,13,'Any OT label',()=>.5),fresh=createMon(data,155,13,'Any OT label',()=>.5);
console.log(JSON.stringify({oldFactoryCommit:pin.commit,oldHasForm:Object.hasOwn(old,'form'),newForm:fresh.form}));
if(process.argv.includes('--expect-native-form'))assert.equal(old.form,0,'Actual old factory omitted the native initial form0');
