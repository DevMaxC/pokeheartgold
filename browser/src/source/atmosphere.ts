import type {SourceMap,State} from './types.ts';

export type WeatherKind='clear'|'rain'|'snow'|'blizzard'|'diamond-dust'|'mist'|'dark';
export type SkyPalette={zenith:string;horizon:string;cloud:string;cloudShade:string;field:string;stars:number;sun:number;moon:number;period:string};
// Colours extend the source's five clock periods into a freely orbiting 3D sky.
const palettes:[number,SkyPalette][]=[
  [0,{zenith:'#14294e',horizon:'#667f9d',cloud:'#687c9c',cloudShade:'#435b7c',field:'#8a9fbd',stars:1,sun:0,moon:1,period:'night'}],
  [4,{zenith:'#344c7c',horizon:'#d7a7ae',cloud:'#c7b8cf',cloudShade:'#8e91b2',field:'#b4b7ce',stars:.45,sun:0,moon:.45,period:'dawn'}],
  [6,{zenith:'#6cabdf',horizon:'#f8dfb4',cloud:'#fff2d8',cloudShade:'#c3d5e2',field:'#fff2dc',stars:0,sun:1,moon:0,period:'morning'}],
  [10,{zenith:'#4b9edc',horizon:'#c2e9ed',cloud:'#fffdf0',cloudShade:'#c3daeb',field:'#ffffff',stars:0,sun:1,moon:0,period:'day'}],
  [16,{zenith:'#589fd7',horizon:'#d2e9e7',cloud:'#fff8e8',cloudShade:'#c6d7e8',field:'#fffaf1',stars:0,sun:1,moon:0,period:'day'}],
  [18,{zenith:'#727cbb',horizon:'#ffd0a0',cloud:'#ffe4cc',cloudShade:'#b5a7ca',field:'#efc7b8',stars:.06,sun:1,moon:0,period:'sunset'}],
  [20,{zenith:'#2b426d',horizon:'#9a9fbb',cloud:'#a3a6c4',cloudShade:'#6b7c9e',field:'#a6b1cb',stars:.8,sun:0,moon:.8,period:'evening'}],
  [22,{zenith:'#14294e',horizon:'#667f9d',cloud:'#687c9c',cloudShade:'#435b7c',field:'#8a9fbd',stars:1,sun:0,moon:1,period:'night'}],
  [24,{zenith:'#14294e',horizon:'#667f9d',cloud:'#687c9c',cloudShade:'#435b7c',field:'#8a9fbd',stars:1,sun:0,moon:1,period:'night'}],
];
export function skyKeyframes(hour:number){
  const h=((hour%24)+24)%24;let i=0;while(i<palettes.length-2&&h>=palettes[i+1][0])i++;
  const [start,a]=palettes[i],[end,b]=palettes[i+1];const t=(h-start)/(end-start);
  return {a,b,t:t*t*(3-2*t),hour:h};
}
// WeatherTask dispatch in src/field/weather_manager.c is authoritative: ID 4
// runs snow (despite the incomplete header comment), and ID 7 runs Sunny.
export function weatherKind(id:number):WeatherKind{
  if(id>=1&&id<=3)return 'rain';if(id===4||id===5)return 'snow';if(id===6)return 'blizzard';
  if(id===8)return 'diamond-dust';if(id===9||id===10)return 'mist';if(id>=11&&id<=13)return 'dark';return 'clear';
}
export function hasOutdoorSky(map:Pick<SourceMap,'key'|'mapType'>){
  return map.mapType==='MAP_TYPE_ROUTE'||map.mapType==='MAP_TYPE_CITY_TOWN'||map.key==='MAP_MOUNT_SILVER_CAVE_SUMMIT';
}
const diamondDustDates=new Set(['1-1','1-31','2-1','2-29','3-15','10-10','12-3','12-31']);
export function mapWeather(map:Pick<SourceMap,'key'|'fields'>,state:Pick<State,'flags'>,date=new Date()){
  let weather=Number(map.fields.weather)||0;
  // field_system_rtc_weather.c and map_matrix.c: original location/date rules.
  if(map.key==='MAP_MOUNT_SILVER_CAVE_SUMMIT'&&diamondDustDates.has(`${date.getMonth()+1}-${date.getDate()}`))weather=8;
  if(map.key==='MAP_LAKE_OF_RAGE'&&state.flags.FLAG_ROCKET_HIDEOUT_CLEARED&&date.getDay()===3)weather=0;
  if(weather===9&&state.flags.FLAG_SYS_DEFOG)weather=0;
  if(weather===11&&state.flags.FLAG_SYS_FLASH)weather=12;
  return weather;
}
// Fixed visual sampling must never consume the gameplay RNG.
export function skyNoise(n:number){const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);}
