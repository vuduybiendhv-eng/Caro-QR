// Small built-in sound effects; no external audio files or downloads required.
(function(){
 let enabled=true, ctx=null;
 function tone(freq,start,duration,type='sine',gain=.055){
   if(!enabled)return;
   try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,ctx.currentTime+start);g.gain.setValueAtTime(.0001,ctx.currentTime+start);g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+start+.015);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+start+duration);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+start);o.stop(ctx.currentTime+start+duration+.03);
   }catch(e){}
 }
 window.CaroSound={
  toggle(){enabled=!enabled;return enabled},isEnabled(){return enabled},
  move(){tone(620,0,.09,'triangle');tone(880,.07,.11,'sine')},
  join(){tone(523,0,.12);tone(659,.12,.13);tone(784,.24,.18)},
  win(){tone(523,0,.16);tone(659,.16,.16);tone(784,.32,.16);tone(1047,.48,.32)},
  reset(){tone(440,0,.12,'triangle');tone(330,.12,.18,'triangle')}
 };
})();
