let deadline=0,pending:Promise<void>|null=null,channel:MessageChannel|null=null,resume:(()=>void)|null=null;
/** Streamed cells share one short main-thread work budget. A queued message
 * yields to input/rendering without depending on foreground animation frames. */
export function terrainPause():Promise<void>|null{
 if(typeof window==='undefined'||performance.now()<deadline)return null;
 if(!channel){channel=new MessageChannel();channel.port1.onmessage=()=>{deadline=performance.now()+6;pending=null;const next=resume;resume=null;next?.();};}
 if(!pending)pending=new Promise(resolve=>{resume=resolve;channel!.port2.postMessage(0);});
 return pending;
}
