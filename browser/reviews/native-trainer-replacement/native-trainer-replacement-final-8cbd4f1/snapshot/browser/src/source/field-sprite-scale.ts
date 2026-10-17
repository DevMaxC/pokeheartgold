import type {SpriteInfo} from './types.ts';
/** Only the original item-ball family is calibrated here. It is a16px prop
 * beside a32px hero; other short NPCs/followers keep their existing scale. */
export function fieldSpriteHeight(key:string,sprites:Readonly<Record<string,SpriteInfo>>,height=2){
 if(key!=='SPRITE_MONSTARBALL')return height;
 const ball=sprites[key],hero=sprites.SPRITE_HERO;
 return ball&&hero&&ball.height>0&&hero.height>0?height*ball.height/hero.height:height;
}
