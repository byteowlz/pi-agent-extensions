/** No agent data is interpolated into HTML or executable source. */
export function reviewHtml(nonce: string): string {
	return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Selection review</title><style nonce="${nonce}">
body{font:16px system-ui;max-width:980px;margin:32px auto;padding:0 20px;background:#111820;color:#edf2f7}button,input,textarea{font:inherit;padding:10px;margin:5px;border-radius:6px}button{cursor:pointer}article{padding:20px;margin:16px 0;border:1px solid #536172;border-radius:12px}label{display:block;margin:10px 0}textarea{display:block;width:90%}.muted{color:#aab8c8}nav{display:flex;flex-wrap:wrap}h2{font-size:20px}#status{white-space:pre-wrap}
</style><h1 id="title">Selection review</h1><p id="description"></p><nav id="tabs"></nav><input id="search" type="search" placeholder="Search inventory" hidden><main id="content"></main><button id="save">Save draft</button><button id="submit">Submit</button><button id="cancel">Cancel</button><p id="status" role="status"></p><script nonce="${nonce}">${reviewScript()}</script></html>`;
}
export function reviewScript(): string {
	return String.raw`
'use strict';
const slot='pi-selection-token';
const token=location.hash.slice(1)||sessionStorage.getItem(slot)||'';
if(location.hash)sessionStorage.setItem(slot,token);
history.replaceState(null,'',location.pathname);
let record,csrf,answers,epoch=0,busy=false,pendingKind='',tab=0,final=false;
const $=id=>document.getElementById(id);
function el(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;}
function changed(){epoch++;$('status').textContent='Unsaved changes';}
async function api(path,data){const r=await fetch(path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json','X-CSRF-Nonce':csrf}:{})},body:data?JSON.stringify(data):undefined});const v=await r.json();if(!r.ok)throw Error(v.error||'Request failed');return v;}
function draw(){
 $('title').textContent=record.spec.title;$('description').textContent=record.spec.description||'';
 $('content').replaceChildren();$('tabs').replaceChildren();
 const review=record.spec.mode==='review';$('search').hidden=!review;
 if(!review){record.spec.questions.forEach((q,i)=>{const b=el('button',q.header||q.title,$('tabs'));b.onclick=()=>{tab=i;final=false;draw();};});const b=el('button','Final review',$('tabs'));b.onclick=()=>{final=true;draw();};}
 const query=$('search').value.toLowerCase();let group;
 for(const [i,q] of record.spec.questions.entries()){
 if(!review&&!final&&i!==tab)continue;
 if(review&&!((q.title+' '+(q.description||'')).toLowerCase().includes(query)))continue;
 if(q.groupId!==group){group=q.groupId;const g=record.spec.groups.find(g=>g.id===group);if(g)el('h2',g.title,$('content'));}
 const a=answers[q.id],box=el('article',undefined,$('content'));el('h2',q.title+(q.required?' *':''),box);if(q.description)el('p',q.description,box);
 if(final){el('p',a.answered?(a.selectedIds.map(id=>q.options?.find(c=>c.id===id)?.label||id).concat(a.text||[]).join(', ')||(q.kind==='text'?'(blank)':'None selected')):(a.disposition||'Unanswered'),box);if(a.note)el('p','Note: '+a.note,box);continue;}
 for(const [caption,disposition] of [['Mark unanswered',undefined],['Skip','skipped'],['Defer: unsure','unsure']]){const reset=el('button',caption,box);reset.onclick=()=>{a.answered=false;a.selectedIds=[];delete a.text;if(disposition)a.disposition=disposition;else delete a.disposition;changed();draw();};}
 if(q.kind==='multiple'){const none=el('button','Confirm none selected',box);none.onclick=()=>{a.answered=true;a.selectedIds=[];delete a.text;delete a.disposition;changed();draw();};}
 if(q.kind!=='text')for(const c of q.options){const label=el('label',undefined,box),input=el('input',undefined,label);input.type=q.kind==='multiple'?'checkbox':'radio';input.name=q.id;input.checked=a.selectedIds.includes(c.id);el('span',c.label+(c.recommended?' (recommended)':''),label);if(c.description)el('small',' — '+c.description,label);input.onchange=()=>{if(q.kind==='single'){a.selectedIds=[c.id];delete a.text;}else{a.selectedIds=input.checked?[...a.selectedIds,c.id]:a.selectedIds.filter(id=>id!==c.id);}a.answered=q.kind==='multiple'||a.selectedIds.length>0||!!a.text?.trim();delete a.disposition;changed();draw();};}
 if(q.kind==='text'||q.allowOther){el('label',q.kind==='text'?'Answer':'Other',box);const input=el(q.multiline?'textarea':'input',undefined,box);input.value=a.text||'';input.maxLength=q.maxLength??10000;input.oninput=()=>{a.text=input.value;if(q.kind==='single'&&input.value)a.selectedIds=[];a.answered=q.kind==='text'||!!input.value.trim()||a.selectedIds.length>0;delete a.disposition;changed();};}
 if(q.note){el('label',q.note.label||'Notes',box);const input=el(q.note.multiline?'textarea':'input',undefined,box);input.value=a.note||'';input.maxLength=q.note.maxLength??10000;input.oninput=()=>{a.note=input.value;changed();};}
 el('small',a.answered?'Answered':(a.disposition||'Unanswered'),box).className='muted';
 }
 for(const id of ['save','submit','cancel'])$(id).disabled=busy||record.state!=='draft';
 for(const control of $('content').querySelectorAll('input,textarea,button'))control.disabled=record.state!=='draft'||(busy&&pendingKind!=='save');
}
async function action(kind){if(busy)return;if(kind==='submit'&&!confirm('Submit this review?'))return;if(kind==='cancel'&&!confirm('Cancel this review? Current answers will be preserved as cancelled, not submitted.'))return;busy=true;pendingKind=kind;const sentEpoch=epoch;draw();try{const v=await api('/api/'+kind,{revision:record.revision,answers:structuredClone(answers)});record=v.record;if(epoch===sentEpoch)answers=structuredClone(record.answers);$('status').textContent=record.state==='draft'?(epoch===sentEpoch?'Draft saved':'Draft saved; newer changes remain unsaved'):record.state;}catch(e){$('status').textContent=e.message;}finally{busy=false;pendingKind='';draw();}}
$('search').oninput=draw;for(const kind of ['save','submit','cancel'])$(kind).onclick=()=>action(kind);
api('/api/review').then(v=>{record=v.record;csrf=v.csrf;answers=structuredClone(record.answers);draw();}).catch(e=>{$('status').textContent=e.message;});
`;
}
