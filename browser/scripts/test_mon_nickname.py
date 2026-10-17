"""Original nickname comparison/copy and blank-space kernels, bounded oracle.

The FLAT_COMPARE case and two C function bodies are copied unchanged. Source
species-name storage and the field task's equality-only String_Compare getter
are bounded stubs. This is not the naming screen or encrypted Mon storage.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
import export_nickname_data as names

ROOT=Path(__file__).resolve().parents[2]


def body(path,name):
    source=(ROOT/path).read_text()
    match=re.search(r'(?:static )?BOOL\s+'+name+r'\([^;{}]*\)\s*\{',source)
    if not match:raise AssertionError(name)
    end=match.end();depth=1
    while depth:
        depth+=(source[end]=='{')-(source[end]=='}');end+=1
    return source[match.start():end]


POKEMON=(ROOT/'src/pokemon.c').read_text()
FLAT=POKEMON[POKEMON.index('    case MON_DATA_NICKNAME_FLAT_COMPARE:',POKEMON.index('#define VALUE(type) (*(const type *)value)')):]
FLAT=FLAT[:FLAT.index('    case MON_DATA_NICKNAME_STRING_AND_FLAG:')]
STRING=body('src/string_util.c','StringNotEqual')
SPACES=body('src/naming_screen.c','NamingScreen_PMCharArrayIsAllSpaces')
FIELD=(ROOT/'src/launch_application.c').read_text()
FIELD=FIELD[FIELD.index('        if (args->kind == 1) {'):]
FIELD=FIELD[:FIELD.index(' else if (args->kind == 5) {')]
PREFIX=r'''
#include <stdint.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t u8;typedef uint16_t u16;typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define HEAP_ID_DEFAULT 0
#define VALUE(type) (*(const type *)value)
#include "constants/pokemon.h"
#include "constants/charcode.h"
'''
PREFIX+=re.search(r'^#define\s+POKEMON_NAME_LENGTH\s+10\b.*$',(ROOT/'include/constants/global.h').read_text(),re.M)[0]+'\n'
WRAPPER=r'''
typedef struct {u16 data[11];} String;
typedef struct {int kind,noInput;String *nameInputString;} NamingScreenArgs;
typedef struct {NamingScreenArgs *args;String *defaultName;} NamingScreenData;
static int String_Compare(const String *a,const String *b){return StringNotEqual(a->data,b->data);}
static void GetSpeciesNameIntoArray(u16 species,int heap,u16 *out){(void)heap;assert(species<496);memcpy(out,canonical[species],22);}
static void set_name(u16 species,int *flag,u16 *nickname,const u16 *input){
 struct {u16 species;} a={species},*blockA=&a;
 struct {int hasNickname;} b={*flag},*blockB=&b;
 struct {u16 nickname[11];} c={0},*blockC=&c;
 u16 namebuf[11];const void *value=input;int i;
 switch(MON_DATA_NICKNAME_FLAT_COMPARE){
'''
SUFFIX=r'''
 }
 *flag=blockB->hasNickname;memcpy(nickname,blockC->nickname,22);
}
int main(void){
 int count;assert(scanf("%d",&count)==1);printf("[");
 for(int row=0;row<count;row++){
  int species,flag,mode;assert(scanf("%d%d%d",&species,&flag,&mode)==3);
  String input={0},old={0};for(int i=0;i<11;i++)assert(scanf("%hu",&input.data[i])==1);
  for(int i=0;i<11;i++)assert(scanf("%hu",&old.data[i])==1);
  int noInput=input.data[0]==EOS||NamingScreen_PMCharArrayIsAllSpaces(input.data);
  if(mode){NamingScreenArgs arg={1,noInput,&input},*args=&arg;NamingScreenData datum={args,&old},*data=&datum;
'''
END=r'''
   noInput=args->noInput;
  }
  u16 result[11];memcpy(result,old.data,22);
  if(!noInput)set_name(species,&flag,result,input.data);
  printf("%s{\"noInput\":%d,\"hasNickname\":%s,\"codes\":[",row?",":"",noInput,flag?"true":"false");
  for(int i=0;i<11;i++){printf("%s%u",i?",":"",result[i]);if(result[i]==EOS)break;}printf("]}");
 }printf("]\n");return 0;
}
'''


def vectors():
    canonical,units,glyphs,_=names.inputs();result=[];seen=set()
    def add(species,old,flag,value,mode):
        if len(value)>10 or any(c not in glyphs for c in value):return
        entry=dict(species=species,oldName=old,oldFlag=flag,input=value,mode=mode)
        key=json.dumps(entry,sort_keys=True)
        if key not in seen:seen.add(key);result.append(entry)
    for species in range(1,494):
        for flag in [False,True]:
            for mode in ['field','capture']:
                for value in [canonical[species],canonical[species].lower(),'Cinder','',' ','   ',canonical[species]+' ', ' '+canonical[species],'\u3000']:
                    add(species,canonical[species],flag,value,mode)
                for value in ['Cinder',canonical[species],'cinder']:
                    add(species,'Cinder',flag,value,mode)
    return result


def oracle():
    canonical,units,glyphs,_=names.inputs()
    def encode(text):return [glyphs[c]for c in text]+[65535]
    def padded(text):return encode(text)+[0]*(10-len(text))
    table='static u16 canonical[496][11]={' + ','.join('{'+','.join(map(str,u))+'}'for u in units)+'};\n'
    source=PREFIX+table+STRING+'\n'+SPACES+'\n'+WRAPPER+FLAT+SUFFIX+FIELD+END
    cases=vectors();lines=[str(len(cases))]
    for c in cases:lines.append(' '.join(map(str,[c['species'],int(c['oldFlag']),int(c['mode']=='field')]+padded(c['input'])+padded(c['oldName']))))
    with tempfile.TemporaryDirectory(prefix='hg-mon-nickname-c-')as directory:
        path=Path(directory)/'oracle.c';exe=Path(directory)/'oracle';path.write_text(source)
        subprocess.run(['cc','-std=c11','-Werror','-iquote',str(ROOT/'include'),str(path),'-o',str(exe)],check=True)
        answers=json.loads(subprocess.check_output([str(exe)],input='\n'.join(lines)+'\n',text=True))
    assert len(cases)==len(answers)
    for c,answer in zip(cases,answers):c['expected']=answer
    return dict(cases=cases,wrapperSHA256=hashlib.sha256(source.encode()).hexdigest(),
                kernels={k:hashlib.sha256(v.encode()).hexdigest()for k,v in dict(flatCompareCase=FLAT,StringNotEqual=STRING,AllNativeSpaces=SPACES,fieldTaskNoInput=FIELD).items()})


class OriginalNicknames(unittest.TestCase):
    def test_generation_is_repeatable_and_original_bank_matches(self):
        a=names.render();b=names.render();self.assertEqual(a,b)
        self.assertEqual((ROOT/'browser/src/source/nickname-data.ts').read_text(),a)
        self.assertEqual(len(names.inputs()[0]),496)

    def test_original_setter_no_input_and_charset_boundaries(self):
        result=oracle()
        self.assertTrue(any(c['mode']=='field'and c['oldFlag']and c['input']==c['oldName']and c['expected']['noInput']==1 and c['expected']['hasNickname']for c in result['cases']))
        self.assertTrue(any(c['mode']=='capture'and c['oldFlag']and c['input']==c['oldName']and not c['expected']['hasNickname']for c in result['cases']))
        self.assertTrue(all(c['expected']['noInput']==0 for c in result['cases']if c['input']=='\u3000'))
        print(json.dumps({'cases':len(result['cases']),'wrapperSHA256':result['wrapperSHA256'],'kernels':result['kernels']}))


if __name__=='__main__':
    if '--oracle'in sys.argv:print(json.dumps(oracle(),ensure_ascii=True,separators=(',',':')))
    else:unittest.main()
