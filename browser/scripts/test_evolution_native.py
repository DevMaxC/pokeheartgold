"""Original, unchanged C eligibility kernels with explicit native-data getter stubs.

This does not emulate encrypted Pokemon storage, a battle/scene, RTC hardware,
NARC allocation or field evolution. --oracle emits deterministic cases for the
TypeScript differential test; ordinary invocation runs source/data self-checks.
"""
import copy
import csv
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FUNCTIONS = {
    'src/pokemon.c': ['GetMonEvolution', 'MonHasMove',
                      'GetGenderBySpeciesAndPersonality_PreloadedPersonal'],
    'src/party.c': ['Party_HasMon'],
    'src/gf_rtc.c': ['IsNighttime', 'GF_RTC_GetTimeOfDayByHour'],
    'src/map_header.c': ['MapHeader_GetMapEvolutionMethod'],
}


def function(path, name):
    source = (ROOT / path).read_text()
    match = re.search(r'\b(?:u16|u8|BOOL|TIMEOFDAY|EvoMethod)\s+' + name
                      + r'\([^;{}]*\)\s*\{', source)
    if not match:
        raise AssertionError('Original function missing: ' + name)
    depth, end = 1, match.end()
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


RAW = json.loads((ROOT / 'files/poketool/personal/evo.json').read_text())
PERSONAL = json.loads((ROOT / 'files/poketool/personal/personal.json').read_text())['baseStats']
ITEMS = list(csv.DictReader((ROOT / 'files/itemtool/itemdata/item_data.csv').open()))
CONSTANTS = json.loads((ROOT / 'browser/public/source/constants.json').read_text())
BODIES = {name: function(path, name) for path, names in FUNCTIONS.items() for name in names}
RTC_ENUM = re.search(r'typedef enum RTC_TimeOfDay\s*\{.*?\}\s*TIMEOFDAY;',
                     (ROOT / 'include/gf_rtc.h').read_text(), re.S).group()
PREFIX = r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef uint8_t u8; typedef uint16_t u16; typedef uint32_t u32;
typedef int32_t s32; typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define HEAP_ID_DEFAULT 0
#define GF_ASSERT assert
#include "constants/pokemon.h"
#include "constants/species.h"
#include "constants/moves.h"
#include "constants/items.h"
struct Evolution {u16 method, param, target;};
#define MAX_EVOS_PER_POKE 7
typedef struct Pokemon {
    u16 species,heldItem,atk,def,moves[4];
    u8 level,friendship,beauty,form,isEgg,checksumFailed;
    u32 personality;
} Pokemon;
typedef struct Party {struct {int curCount;Pokemon mons[6];} core;} Party;
typedef struct BASE_STATS {u8 ratio;} BASE_STATS;
static int hour;
static u32 GetMonData(Pokemon *, int, void *);
static BOOL Party_HasMon(Party *, u16);
static BOOL MonHasMove(Pokemon *, u16);
static BOOL IsNighttime(void);
'''
STUBS = r'''
static u32 GetPersonalAttr(const BASE_STATS *p,int attr) {assert(attr==BASE_GENDER_RATIO);return p->ratio;}
static u8 GetGenderBySpeciesAndPersonality_PreloadedPersonal(const BASE_STATS *,u16,u32);
static u32 GetMonData(Pokemon *p,int attr,void *out) {
    (void)out;
    switch(attr) {
    case MON_DATA_SPECIES:return p->checksumFailed?SPECIES_EGG:p->species;
    case MON_DATA_SPECIES_OR_EGG:return p->species&&(p->isEgg||p->checksumFailed)?SPECIES_EGG:p->species;
    case MON_DATA_HELD_ITEM:return p->heldItem;
    case MON_DATA_PERSONALITY:return p->personality;
    case MON_DATA_BEAUTY:return p->beauty;
    case MON_DATA_FORM:return p->form;
    case MON_DATA_LEVEL:return p->level;
    case MON_DATA_FRIENDSHIP:return p->friendship;
    case MON_DATA_ATK:return p->atk;
    case MON_DATA_DEF:return p->def;
    case MON_DATA_GENDER:return GetGenderBySpeciesAndPersonality_PreloadedPersonal(&personal[p->species],p->species,p->personality);
    default:assert(attr>=MON_DATA_MOVE1&&attr<MON_DATA_MOVE1+4);return p->moves[attr-MON_DATA_MOVE1];
    }
}
static u32 GetItemAttr(u16 item,int attr,int heap) {(void)heap;assert(attr==ITEMATTR_HOLD_EFFECT);assert(item<1024);return effects[item];}
static void *Heap_Alloc(int heap,size_t size) {(void)heap;return malloc(size);}
static void Heap_Free(void *p) {free(p);}
static void LoadMonEvolutionTable(u16 species,struct Evolution *out) {assert(species<494);memcpy(out,tables[species],sizeof(tables[species]));}
'''
MAIN = r'''
int main(void) {
    int count;assert(scanf("%d",&count)==1);printf("[");
    for(int n=0;n<count;n++) {
        long long f[35];for(int i=0;i<35;i++)assert(scanf("%lld",&f[i])==1);
        Pokemon p={0};Party party={0};
        p.species=f[0];p.heldItem=f[1];p.level=f[2];p.friendship=f[3];
        p.personality=f[4];p.beauty=f[5];p.form=f[6];p.atk=f[7];p.def=f[8];
        int context=f[9],used=f[10];hour=f[11];party.core.curCount=f[12];
        for(int j=0;j<4;j++)p.moves[j]=f[13+j];
        for(int j=0;j<6;j++){party.core.mons[j].species=f[17+j*3];party.core.mons[j].isEgg=f[18+j*3];party.core.mons[j].checksumFailed=f[19+j*3];}
        int method=-777;u16 target=GetMonEvolution(f[12]<0?NULL:&party,&p,context,used,&method);
        printf("%s{\"target\":%u,\"methodRet\":%d,\"night\":%d,\"mapMethod\":%d}",n?",":"",target,method,IsNighttime(),MapHeader_GetMapEvolutionMethod(n));
    }
    printf("]\n");return 0;
}
'''


def wrapper():
    # Same designated initializer/zero filling as evo.json.txt; source tokens
    # are compiled against the ORIGINAL headers, not the browser constants.
    tables = 'static struct Evolution tables[494][7] = {\n' + '\n'.join(
        '[' + row['baseSpecies'] + '] = {' + ','.join(
            '{' + ','.join(str(e[k]) for k in ['method', 'param', 'target']) + '}'
            for e in row['evos']) + '},' for row in RAW['evoTable']) + '\n};\n'
    effects = 'static u8 effects[1024] = {' + ','.join('['+r['item']+']='+r['holdEffect'] for r in ITEMS) + '};\n'
    personal = 'static BASE_STATS personal[494] = {' + ','.join(
        '[%d]={GENDER_RATIO(%s)}' % (i, row['genderRatio']) for i, row in enumerate(PERSONAL[:494])) + '};\n'
    return (PREFIX + RTC_ENUM + '\n' + tables + effects + personal + STUBS
            + BODIES['GetGenderBySpeciesAndPersonality_PreloadedPersonal'] + '\n'
            + BODIES['GF_RTC_GetTimeOfDayByHour'] + '\n'
            + 'static TIMEOFDAY GF_RTC_GetTimeOfDay(void){return GF_RTC_GetTimeOfDayByHour(hour);}\n'
            + '\n'.join(BODIES[n] for n in ['IsNighttime', 'MonHasMove', 'Party_HasMon',
                                           'MapHeader_GetMapEvolutionMethod', 'GetMonEvolution']) + MAIN)


def cases():
    result, seen = [], set()

    def add(species, context, **changes):
        mon = dict(species=species,heldItem=None,level=100,friendship=255,
                   personality=0,beauty=255,form=0,stats=dict(atk=120,def_=100),moves=[])
        mon['stats']['def'] = mon['stats'].pop('def_')
        entry=dict(mon=mon,context=copy.deepcopy(context),party=[dict(species=223)],hour=12)
        for key,value in changes.items():
            if key in ['party','hour']:
                entry[key]=value
            else:
                mon[key]=value
        key=json.dumps(entry,sort_keys=True)
        if key not in seen:
            seen.add(key);result.append(entry)

    for row in RAW['evoTable']:
        species=CONSTANTS[row['baseSpecies']]
        for rule in row['evos']:
            method=rule['method'];param=rule['param']
            if isinstance(param,str):param=CONSTANTS[param]
            contexts=[dict(kind='levelup',evolutionLocation=0),dict(kind='trade'),
                      dict(kind='item-check',usedItem=param),dict(kind='item-use',usedItem=param)]
            for context in contexts:
                for hour in [3,12,20]:
                    for held in [None,'ITEM_EVERSTONE']:
                        add(species,context,hour=hour,heldItem=held)
            c=contexts[0]
            for value in [0,255,5<<16,0xffffffff]:add(species,c,personality=value)
            for context in contexts[2:]:
                for value in [0,255]:add(species,context,personality=value)
            for attack,defense in [(99,100),(100,100),(101,100)]:add(species,c,stats={'atk':attack,'def':defense})
            for level in {1,19,20,min(100,max(1,param-1)),min(100,max(1,param))}:add(species,c,level=level)
            for friendship in [219,220]:add(species,c,friendship=friendship)
            if method in ['EVO_TRADE_ITEM','EVO_ITEM_DAY','EVO_ITEM_NIGHT']:
                item=rule['param'];assert isinstance(item,str)
                for context in contexts[:2]:
                    for hour in [3,12,20]:add(species,context,heldItem=item,hour=hour)
            if method=='EVO_HAS_MOVE':add(species,c,moves=[{'id':param}])
            if method=='EVO_BEAUTY':
                for beauty in [169,170]:add(species,c,beauty=beauty)
            if method=='EVO_OTHER_PARTY_MON':
                for party in [None,[],[{'species':param,'isEgg':True}],[{'species':param,'checksumFailed':True}]]:add(species,c,party=party)
            if method in ['EVO_CORONET','EVO_ETERNA','EVO_ROUTE217']:
                for location in [0,24,25,26]:add(species,dict(kind='levelup',evolutionLocation=location))
    for species in range(1,494):add(species,dict(kind='levelup',evolutionLocation=0))
    for hour in range(24):add(133,dict(kind='levelup',evolutionLocation=0),hour=hour)
    for form in [0,1,2,31]:
        for kind in ['levelup','trade','item-use']:
            context={'kind':kind,'evolutionLocation':0} if kind=='levelup' else {'kind':kind,'usedItem':0}
            add(172,context,form=form)
    # Stored gender deliberately irrelevant; native GetMonData derives it.
    for entry in result:entry['mon']['gender']='female' if entry['mon']['personality']&255==255 else 'male'
    return result


def run_oracle():
    vectors=cases();lines=[str(len(vectors))]
    kinds={'levelup':0,'trade':1,'item-check':2,'item-use':3}
    for case in vectors:
        m,c,p=case['mon'],case['context'],case['party']
        used=c.get('evolutionLocation',0) if c['kind']=='levelup' else c.get('usedItem',0)
        fields=[m['species'],CONSTANTS[m['heldItem'] or 'ITEM_NONE'],m['level'],m['friendship'],
                m['personality'],m['beauty'],m['form'],m['stats']['atk'],m['stats']['def'],
                kinds[c['kind']],used,case['hour'],-1 if p is None else len(p)]
        fields += [x['id'] for x in m['moves']] + [0]*(4-len(m['moves']))
        for i in range(6):
            slot=p[i] if p is not None and i<len(p) else {}
            fields += [slot.get('species',0),int(slot.get('isEgg',False)),int(slot.get('checksumFailed',False))]
        assert len(fields)==35
        lines.append(' '.join(map(str,fields)))
    code=wrapper()
    with tempfile.TemporaryDirectory(prefix='hg-evolution-c-') as directory:
        source,executable=Path(directory)/'oracle.c',Path(directory)/'oracle'
        source.write_text(code)
        subprocess.run(['cc','-std=c11','-Werror','-Wno-initializer-overrides','-iquote',str(ROOT/'include'),str(source),'-o',str(executable)],check=True)
        output=json.loads(subprocess.check_output([str(executable)],input='\n'.join(lines)+'\n',text=True))
    assert len(vectors)==len(output)
    for case,expected in zip(vectors,output):case['expected']=expected
    return dict(cases=vectors,wrapperSHA256=hashlib.sha256(code.encode()).hexdigest(),
                functions={name:hashlib.sha256(body.encode()).hexdigest() for name,body in BODIES.items()})


class OriginalEvolution(unittest.TestCase):
    def test_export_matches_original_evolution_and_item_personal_inputs(self):
        self.assertEqual(RAW,json.loads((ROOT/'browser/public/source/evolutions.json').read_text()))
        self.assertEqual(PERSONAL,json.loads((ROOT/'browser/public/source/pokemon.json').read_text())['baseStats'])
        self.assertEqual(ITEMS,json.loads((ROOT/'browser/public/source/items.json').read_text()))
        self.assertEqual(len(RAW['evoTable']),230)
        self.assertEqual(sum(len(r['evos']) for r in RAW['evoTable']),247)

    def test_original_kernels_and_real_table_have_expected_starter_and_special_results(self):
        result=run_oracle()
        def find(species,**values):
            return [c for c in result['cases'] if c['mon']['species']==species and c['context']['kind']=='levelup'
                    and c['mon']['heldItem'] is None and all(c['mon'].get(k)==v for k,v in values.items())]
        self.assertTrue(any(c['expected']['target']==156 for c in find(155,level=14)))
        self.assertTrue(all(c['expected']['target']==0 for c in find(155,level=13)))
        self.assertTrue(any(c['expected']['target']==0 and c['expected']['methodRet']==14 for c in find(290,level=19)))
        self.assertTrue(all(c['expected']['target']==0 for c in find(172,form=1)))
        print(json.dumps({'cases':len(result['cases']),'functions':result['functions'],
                          'wrapperSHA256':result['wrapperSHA256']}))


if __name__=='__main__':
    if '--oracle' in sys.argv:print(json.dumps(run_oracle(),separators=(',',':')))
    else:unittest.main()
