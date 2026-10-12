const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const babel = require(path.join(root, 'node_modules/@babel/core'));
const Engine = require(path.join(root, 'src/main/agenda/agendaExecutionEngine'));
const {buildTimerAgenda} = require(path.join(root, 'src/App/controller/timerAgenda'));
let now = 0, packets = [];
const engine = new Engine({now:()=>now,syncTimer:p=>packets.push(p)});
engine.ensureTicker = () => {};
const items = [{_id:'a',time:600,agenda:'Ten'}, {_id:'b',time:60,agenda:'One'}];
const saved = {id:'saved', sessions:[{id:'b',durationSec:600,timelineItems:[{id:'cue-b',startSec:900}]},{id:'a',durationSec:60,timelineItems:[]}]};
const doc = buildTimerAgenda(items, saved, 5);
assert.equal(doc.sessions[0].durationSec,600);
assert.equal(doc.sessions[1].durationSec,60);
assert.equal(doc.sessions[1].timelineItems[0].id,'cue-b');
assert.equal(saved.sessions[0].durationSec,600);
engine.loadAgenda(doc);
assert.equal(packets.length,0);
engine.start(0);
now += 12250; engine.tick();
assert.equal(packets.at(-1).remainingSec,588);
engine.pause(); const elapsed = engine.sessionElapsedSec;
now += 100000; engine.tick();
assert.equal(engine.sessionElapsedSec,elapsed);
engine.resume(); now+=750;engine.tick();
assert.equal(packets.at(-1).remainingSec,587);
const added = buildTimerAgenda([{...items[0],time:660},items[1]], saved,5);
engine.updateLiveSchedule(added,647);
assert.equal(packets.at(-1).remainingSec,647);
assert.equal(engine.sessionElapsedSec,13);
engine.pause();
const replaced = buildTimerAgenda([{...items[0],time:120},items[1]],saved,5);
engine.updateLiveSchedule(replaced,120);
assert.equal(engine.status,'paused');assert.equal(packets.at(-1).remainingSec,120);
assert.equal(engine.sessionElapsedSec,0);
engine.resume();now+=120000;engine.tick();
assert.equal(engine.status,'interval');assert.equal(packets.at(-1).remainingSec,5);
now+=1250;engine.tick();assert.equal(packets.at(-1).remainingSec,4);
engine.pause();assert.equal(packets.at(-1).isInterval,true);assert.equal(packets.at(-1).remainingSec,4);
now+=20000;engine.resume();now+=3750;engine.tick();
assert.equal(engine.status,'running');assert.equal(packets.at(-1).sessionId,'b');assert.equal(packets.at(-1).remainingSec,60);
now+=60000;engine.tick();assert.equal(engine.status,'completed');assert.equal(packets.at(-1).completed,true);
engine.updateLiveSchedule(doc);assert.equal(engine.currentSession,null);assert.equal(engine.sessionIndex,-1);
engine.start(1);assert.equal(engine.sessionDurationSec,60);
engine.start(0);assert.equal(engine.sessionDurationSec,600);assert.equal(engine.intervalRemainingSec,0);
assert.throws(()=>engine.start(-1),/Invalid/);
// Reordering and deleting earlier rows must preserve the live session by ID.
engine.start(1);engine.updateLiveSchedule({...doc,sessions:[doc.sessions[1]]});
assert.equal(engine.currentSession.id,'b');assert.equal(engine.sessionIndex,0);
engine.stop();engine.updateLiveSchedule(doc);assert.equal(engine.currentSession,null);assert.equal(engine.sessionDurationSec,0);
engine.start(0);now+=600000;engine.tick();assert.equal(engine.status,'interval');
engine.cancelInterval();assert.equal(engine.status,'paused');assert.equal(engine.intervalRemainingSec,0);assert.equal(packets.at(-1).isInterval,false);
engine.stop();
console.log('PASS engine: duration identity, pause/resume, live add/replace, interval pause, advance, restart, stop, invalid index');

function loadModule(file, stubs, globals={}) {
 const code = babel.transformFileSync(path.join(root,file),{presets:['@babel/preset-env','@babel/preset-react','@babel/preset-typescript'].map(p=>require.resolve(p,{paths:[root]})),babelrc:false,configFile:false}).code;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>Object.hasOwn(stubs,n)?stubs[n]:require(require.resolve(n,{paths:[root]})),console,...globals},{filename:file});
 return module.exports;
}
const redux = loadModule('src/Redux/state.jsx',{});
const utilReducer = redux.default.reducer;
let state = utilReducer(undefined,{type:'init'});
const actions = redux.utilAction;
assert.ok(actions.startTimer);
state=utilReducer(state,actions.startTimer({time:600}));
assert.equal(state.isRunning,true);assert.equal(state.time,600);
const revision=state.timerRevision;
state=utilReducer(state,actions.startTimer({time:600}));assert.equal(state.timerRevision,revision+1);
state=utilReducer(state,actions.startTimer({time:NaN}));assert.equal(state.time,600);
state=utilReducer(state,actions.clearTimer());assert.equal(state.isRunning,false);assert.equal(state.activeId,null);
console.log('PASS Redux: explicit starts, same-duration restart, invalid duration, atomic stop');

// Execute the real controller hooks with deterministic clocks and IPC, without Electron.
let slots=[],cursor=0,effects=[],dirty=true,tree;
let intervals=new Map(),nextInterval=1,localNow=0,syncListener,mobileListener;
const overlays=[];
const react={
 createElement:(type,props,...children)=>({type,props:{...props,children}}),
 useState:(initial)=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,(value)=>{const v=typeof value==='function'?value(slots[i].value):value;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},
 useRef:(initial)=>{const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i];},
 useEffect:(fn,deps)=>{const i=cursor++;const old=slots[i];if(!old||!deps||deps.some((d,j)=>!Object.is(d,old.deps?.[j]))){effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
};
const dispatch=(action)=>{const next=utilReducer(state,action);if(next!==state){state=next;dirty=true;}};
let liveNow=0;
const liveEngine = new Engine({now:()=>liveNow,syncTimer:p=>syncListener?.(p)});
liveEngine.ensureTicker=()=>{};
const ipc = {Agenda:{onTimerSync:fn=>{syncListener=fn;return()=>{syncListener=null;}},getExecutionState:()=>Promise.resolve(liveEngine.getState()),controlExecution:async({command,payload})=>{
 if(payload?.agenda && command!=='update-live-schedule')liveEngine.loadAgenda(payload.agenda);
 if(command==='start')liveEngine.start(payload.sessionIndex);
 if(command==='stop')liveEngine.stop();
 if(command==='pause')liveEngine.pause();
 if(command==='resume')liveEngine.resume();
 if(command==='update-live-schedule'){liveEngine.updateLiveSchedule(payload.agenda,payload.remainingSec);if(payload.cancelInterval)liveEngine.cancelInterval();}
 return {ok:true,state:liveEngine.getState()};
}},Timer:{setTimer:p=>overlays.push(p)},Network:{onMobileAction:fn=>{mobileListener=fn;return()=>{mobileListener=null;}}},Session:{emitTimerLifecycle:()=>{}}};
const iconNames=['PiEmpty','PiPlus','PiPencil','PiPause','PiStop','PiPlay','PiTrash','PiCheck','PiGear','PiClock','PiX','PiCalendarCheck','PiLockKey'];
const stubs={'react':react,'react-redux':{useDispatch:()=>dispatch,useSelector:fn=>fn({util:state})},'./SetTimePage.tsx':{__esModule:true,default:'SetTimePage'},'./timerAgenda':{buildTimerAgenda},'../../Redux/state.jsx':{utilAction:actions},'react-icons/pi':Object.fromEntries(iconNames.map(n=>[n,n])),'../../../components':{Button:'Button',Input:'Input',DisabledContainer:'DisabledContainer'},'../context/AuthContext':{useAuth:()=>({hasPermission:()=>true})},'./AgendaPlannerModal.jsx':{__esModule:true,default:'AgendaPlannerModal'}};
const Controller=loadModule('src/App/controller/TimerController.js',stubs,{window:{electron:ipc},performance:{now:()=>localNow},setInterval:fn=>{const id=nextInterval++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)}).default;
let Current = Controller;
function flush(){let n=0;while(dirty){if(++n>50)throw Error('render loop');dirty=false;cursor=0;effects=[];tree=Current();const pending=effects;effects=[];for(const run of pending)run();}}
function nodes(t=tree,out=[]){if(t&&typeof t==='object'){out.push(t);for(const c of (t.props?.children||[]).flat(Infinity))if(c !== undefined)nodes(c,out);}return out;}
function iconButton(icon){return nodes().find(n=>n.props?.onClick && n.props.children?.some(c=>c?.type===icon));}
state=utilReducer(undefined,{type:'init'});flush();
(async()=>{
 await Promise.resolve();flush();
 let quick=nodes().find(n=>n.type==='SetTimePage').props.onStart;
 await quick(600);flush();assert.equal(state.isRunning,true);
 localNow+=10500;for(const fn of [...intervals.values()])fn();flush();assert.equal(overlays.at(-1).time,590);
 iconButton('PiPause').props.onClick();flush();assert.equal(state.isPaused,true);assert.equal(intervals.size,0);
 localNow+=20000;iconButton('PiPlay').props.onClick();flush();localNow+=500;for(const fn of [...intervals.values()])fn();flush();assert.equal(overlays.at(-1).time,589);
 await nodes().find(n=>n.type==='SetTimePage').props.onStart(600);flush();assert.equal(overlays.at(-1).time,600);
 localNow+=600000;for(const fn of [...intervals.values()])fn();flush();assert.equal(state.isRunning,false);assert.equal(intervals.size,0);assert.equal(overlays.at(-1).time,null);
 await nodes().find(n=>n.type==='SetTimePage').props.onStart(60,true);flush();assert.equal(state.isEventMode,true);assert.equal(state.isRunning,true);
 iconButton('PiStop').props.onClick();flush();assert.equal(state.isEventMode,false);
 dispatch(actions.setAgenda(items[0]));dispatch(actions.setAgenda(items[1]));flush();
 mobileListener({type:'set-timer',payload:{time:600,activeId:'a'}});await Promise.resolve();flush();assert.equal(state.activeId,'a');assert.equal(intervals.size,0);assert.equal(overlays.at(-1).time,600);
 liveNow+=10000;liveEngine.tick();flush();assert.equal(overlays.at(-1).time,590);
 mobileListener({type:'set-paused',payload:{paused:true}});flush();assert.equal(liveEngine.status,'paused');assert.equal(state.isRunning,true);assert.ok(iconButton('PiPlay'));
 mobileListener({type:'edit-agenda',payload:{_id:'a',time:660,mode:'add'}});flush();assert.equal(overlays.at(-1).time,650);
 mobileListener({type:'set-paused',payload:{paused:false}});flush();assert.equal(liveEngine.status,'running');
 mobileListener({type:'stop-timer'});flush();assert.equal(state.isRunning,false);assert.equal(state.time,0);assert.equal(state.isDelayRunning,false);
 // All UI and voice shortcuts share the same action listener.
 const commandEvents=[];
 const commands=loadModule('src/App/controller/timerCommands.js',{}, {window:{dispatchEvent:event=>commandEvents.push(event)},CustomEvent:function(type,props){this.type=type;this.detail=props.detail;}});
 commands.startTimer(300);commands.stopTimer();commands.startTimer(-1);
 assert.equal(commandEvents.length,2);assert.equal(commandEvents[0].detail.payload.time,300);assert.equal(commandEvents[1].detail.type,'stop-timer');

 // Run the actual duration input component, including its editing handlers.
 let requests=[];
 const SetTime=loadModule('src/App/controller/SetTimePage.tsx',{...stubs,'../../Redux/state':{utilAction:actions}}).default;
 Current=()=>SetTime({onStart:(seconds,event)=>requests.push({seconds,event})});
 slots=[];dirty=true;flush();
 function text(n){return (n?.props?.children||[]).flat(Infinity).map(c=>typeof c==='string'?c:text(c)).join('');}
 function button(label){return nodes().find(n=>n.type==='Button' && text(n)===label);}
 nodes().find(n=>n.type==='p' && text(n)==='MM').props.onClick();flush();
 let minuteInput=nodes().find(n=>n.type==='input' && n.props.placeholder==='MM');
 minuteInput.props.onChange({target:{value:'1'}});flush();
 minuteInput=nodes().find(n=>n.type==='input' && n.props.placeholder==='MM');
 minuteInput.props.onChange({target:{value:'10'}});flush();
 assert.equal(nodes().find(n=>n.type==='input' && n.props.placeholder==='MM').props.value,'10');
 button('Quick Start').props.onClick();assert.equal(requests.at(-1).seconds,600);
 button('Add to list').props.onClick();flush();assert.equal(state.agenda.at(-1).time,600);
 nodes().find(n=>n.type==='p' && text(n)==='MM').props.onClick();flush();
 nodes().find(n=>n.type==='input' && n.props.placeholder==='MM').props.onChange({target:{value:'1'}});flush();
 button('Quick Start').props.onClick();assert.equal(requests.at(-1).seconds,60);
 const count=requests.length;
 nodes().find(n=>n.type==='input' && n.props.placeholder==='MM').props.onChange({target:{value:'-1'}});flush();
 button('Quick Start').props.onClick();assert.equal(requests.length,count);
 console.log('PASS input: typing 10/1, minute conversion, list duration, negative duration rejection');
 console.log('PASS controller: quick start, fractional pause, resume, same-duration restart, completion, event mode, list start, remote pause/edit/stop, single clock');
})().catch(e=>{console.error(e);process.exitCode=1;});
