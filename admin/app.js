import {publicConfig,authCallback} from './connection.js';
const $ = (id) => document.getElementById(id);
const subjects = {
  'matematik':'Matematik','turkce':'Türkçe','fen-bilimleri':'Fen Bilimleri','sosyal-bilgiler':'Sosyal Bilgiler',
  'ingilizce':'İngilizce','din-kulturu':'Din Kültürü','turk-dili-ve-edebiyati':'Türk Dili ve Edebiyatı',
  'fizik':'Fizik','kimya':'Kimya','biyoloji':'Biyoloji','tarih':'Tarih','cografya':'Coğrafya',
  'felsefe':'Felsefe','inkilap-tarihi':'İnkılap Tarihi',
};
let items = [], page = 0, editing = null, busy = false, online = false, session = null, config = null, previewMode = true;
const pageSize = 25;
const localKey = 'oyss-admin-preview-v1';

function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function option(value, text) { const el=document.createElement('option'); el.value=value; el.textContent=text; return el; }
for (let grade=5;grade<=12;grade++) {
  $('grade').append(option(grade,`${grade}. sınıf`)); $('filter-grade').append(option(grade,`${grade}. sınıf`));
}
for (const [key,value] of Object.entries(subjects)) $('subject').append(option(key,value));

function render() {
  $('total').textContent=items.length;
  $('published').textContent=items.filter(x=>x.state==='published').length;
  $('drafts').textContent=items.filter(x=>x.state==='draft').length;
  const query=$('search').value.trim().toLocaleLowerCase('tr');
  const filtered=items.filter(x=>(!query||`${x.title} ${x.publisher}`.toLocaleLowerCase('tr').includes(query)) &&
    (!$('filter-grade').value||x.grade===Number($('filter-grade').value)) &&
    (!$('filter-kind').value||x.kind===$('filter-kind').value) && (!$('filter-state').value||x.state===$('filter-state').value));
  page=Math.min(page, Math.max(0,Math.ceil(filtered.length/pageSize)-1));
  $('rows').replaceChildren();
  for (const item of filtered.slice(page*pageSize,(page+1)*pageSize)) {
    const tr=document.createElement('tr');
    const title=document.createElement('td'), strong=document.createElement('strong'), small=document.createElement('small');
    strong.textContent=item.title; small.textContent=`${item.kind.toUpperCase()} · ${item.publisher||'OYSS'}`;
    title.append(strong,small); tr.append(title);
    for (const text of [`${item.grade}. sınıf · ${subjects[item.subject]||item.subject}`,item.exam.replace('-',' / ')]) { const td=document.createElement('td'); td.textContent=text; tr.append(td); }
    const state=document.createElement('td'), badge=document.createElement('span');
    badge.className=`badge ${item.state==='published'?'live':''}`; badge.textContent=item.state==='published'?'Yayında':'Taslak'; state.append(badge); tr.append(state);
    const actions=document.createElement('td'), edit=document.createElement('button'); edit.disabled=!!config&&!online&&!previewMode; edit.textContent='Düzenle'; edit.addEventListener('click',()=>openEditor(item)); actions.append(edit); tr.append(actions); $('rows').append(tr);
  }
  $('empty').hidden=filtered.length>0;
  $('count').textContent=filtered.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,filtered.length)} / ${filtered.length} içerik`:'0 içerik';
  $('previous').disabled=page===0; $('next').disabled=(page+1)*pageSize>=filtered.length;
  $('new').disabled=!!config&&!online&&!previewMode;
  $('mode').textContent=online ? 'Canlı proje · Yayımladığın içerikler mobil katalogdan okunabilir.' : config&&!previewMode ? 'Canlı katalog · Düzenlemek için yönetici hesabınla giriş yap.' : 'Yerel önizleme · Değişiklikler yalnızca bu tarayıcıda saklanır, uygulamaya gönderilmez.';
  $('email-form').hidden=!config||online; $('otp-form').hidden=!config||online||!$('otp-form').dataset.sent;
  $('logout').hidden=!session;
  $('connection-hint').textContent=config?'OYSS yönetici hesabınla e-posta bağlantısını veya giriş kodunu kullanarak giriş yap.':'Bağlantı kurulana kadar yerel önizleme kullanılıyor.';
}
function openEditor(item=null) {
  if(config&&!online&&!previewMode) {message('İçerik düzenlemek için yönetici girişi yap.',true);return;}
  editing=item; $('edit-form').reset(); $('editor-error').textContent='';
  $('edit-heading').textContent=item?'İçeriği düzenle':'Yeni içerik';
  for (const key of ['title','grade','subject','exam','kind','publisher','url']) if (item) $(key).value=item[key]??'';
  $('file').disabled=!online; $('file').accept=$('kind').value==='pdf'?'application/pdf,.pdf':'';
  $('editor').showModal();
}
function setBusy(value) { busy=value; for(const id of ['save','publish','close']) $(id).disabled=value; }

function authHeaders() {
  const headers={apikey:config.key};
  if (session?.access_token) headers.Authorization=`Bearer ${session.access_token}`;
  else if (config.key.startsWith('ey')) headers.Authorization=`Bearer ${config.key}`;
  return headers;
}
async function decodeResponse(response) {
  if (!response.ok) {
    let error; try {error=await response.json();} catch {error={};}
    throw new Error(error.message||error.msg||error.error_description||`İstek tamamlanamadı (${response.status}).`);
  }
  if (response.status===204 || response.headers.get('content-length')==='0') return null;
  const text=await response.text(); return text?JSON.parse(text):null;
}
async function refreshSession() {
  if (!session || session.expires_at>Date.now()/1000+60) return;
  const response=await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  session=await decodeResponse(response); session.expires_at=Date.now()/1000+session.expires_in;
  sessionStorage.setItem('oyss-admin-session',JSON.stringify(session));
}
async function api(path,{method='GET',body,raw=false,headers={}}={}) {
  await refreshSession();
  const response=await fetch(`${config.url}${path}`,{method,headers:{...authHeaders(),...(body&&!raw?{'Content-Type':'application/json'}:{}),...headers},body:body?(raw?body:JSON.stringify(body)):undefined});
  return decodeResponse(response);
}
async function loadPublic() {
  previewMode=false; online=false;
  const result=[];
  for(let offset=0;offset<20000;offset+=1000) {
    const batch=await api(`/rest/v1/content_resources?select=id,kind,grade,subject,exam,title,publisher,url,state,attachments&state=eq.published&order=id.asc&limit=1000&offset=${offset}`);
    result.push(...batch);if(batch.length<1000)break;
  }
  items=result;page=0;render();
}
async function loadLive() {
  const editor=await api('/rest/v1/rpc/is_content_editor',{method:'POST',body:{}});
  if (!editor) throw new Error('Bu hesap içerik yöneticisi olarak yetkilendirilmemiş.');
  const result=[];
  for(let offset=0;offset<20000;offset+=1000) {
    const batch=await api(`/rest/v1/content_resources?select=*&order=updated_at.desc&limit=1000&offset=${offset}`);
    result.push(...batch); if(batch.length<1000) break;
  }
  items=result; previewMode=false; online=true; page=0; render();
}
async function uploadPdf(file) {
  if (file.size>25*1024*1024) throw new Error('PDF dosyası 25 MB sınırını aşıyor.');
  const signature=await file.slice(0,5).text();
  if(signature!=='%PDF-') throw new Error('Seçilen dosya geçerli bir PDF değil.');
  const path=`${crypto.randomUUID()}.pdf`;
  await api(`/storage/v1/object/oyss-drafts/${path}`,{method:'POST',body:file,raw:true,headers:{'Content-Type':'application/pdf'}});
  return path;
}
async function publishedPdf(path) {
  await refreshSession();
  const response=await fetch(`${config.url}/storage/v1/object/oyss-drafts/${encodeURIComponent(path)}`,{headers:authHeaders()});
  if (!response.ok) throw new Error('Taslak PDF okunamadı. Oturumu ve dosya yetkisini kontrol et.');
  const blob=await response.blob(), publicPath=`${crypto.randomUUID()}.pdf`;
  await api(`/storage/v1/object/oyss-published/${publicPath}`,{method:'POST',body:blob,raw:true,headers:{'Content-Type':'application/pdf'}});
  return `${config.url}/storage/v1/object/public/oyss-published/${publicPath}`;
}
async function save(publish) {
  if (busy||!$('edit-form').reportValidity()) return;
  setBusy(true); $('editor-error').textContent='';
  try {
    const record={};
    for(const key of ['title','subject','exam','kind','publisher']) record[key]=$(key).value.trim();
    record.grade=Number($('grade').value); record.url=$('url').value.trim()||null;
    if(record.url && new URL(record.url).protocol!=='https:') throw new Error('İçerik bağlantısı HTTPS ile başlamalı.');
    record.storage_path=editing?.storage_path??null;
    const file=$('file').files[0];
    if(file) {
      if(!online) throw new Error('Dosya yüklemek için canlı projeye bağlanmalısın.');
      if(record.kind!=='pdf') throw new Error('Dosya yüklemesi yalnızca PDF türü için kullanılabilir.');
      record.storage_path=await uploadPdf(file); record.url=null;
    }
    if(!record.url&&!record.storage_path) throw new Error('Bir bağlantı gir veya PDF yükle.');
    if(record.kind!=='pdf') record.storage_path=null;
    record.state=publish?'published':'draft';
    if(publish && record.storage_path && (!record.url || file)) record.url=await publishedPdf(record.storage_path);
    if(online) {
      const saved=await api(`/rest/v1/content_resources${editing?`?id=eq.${editing.id}`:''}`,{method:editing?'PATCH':'POST',body:record,headers:{Prefer:'return=representation'}});
      if(!Array.isArray(saved)||saved.length!==1) throw new Error('İçerik kaydedilemedi. Yetkini kontrol et.');
      await loadLive();
    } else {
      record.id=editing?.id??crypto.randomUUID(); record.updated_at=new Date().toISOString();
      items=[record,...items.filter(x=>x.id!==record.id)]; localStorage.setItem(localKey,JSON.stringify(items)); render();
    }
    $('editor').close(); message(publish?(online?'İçerik yayımlandı.':'Yerel önizlemede yayımlandı. Canlı uygulama değişmedi.'):'Taslak kaydedildi.');
  } catch(error) { $('editor-error').textContent=error.message; }
  finally {setBusy(false);}
}
$('new').addEventListener('click',()=>openEditor());
$('close').addEventListener('click',()=>$('editor').close());
$('editor').addEventListener('cancel',event=>{if(busy) event.preventDefault();});
$('edit-form').addEventListener('submit',event=>{event.preventDefault(); void save(false);});
$('publish').addEventListener('click',()=>void save(true));
for(const id of ['search','filter-grade','filter-kind','filter-state']) $(id).addEventListener('input',()=>{page=0;render();});
$('previous').addEventListener('click',()=>{page--;render();}); $('next').addEventListener('click',()=>{page++;render();});
$('export').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url;link.download='oyss-icerik-yedegi.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('config-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    const validated=publicConfig({url:$('project-url').value,key:$('anon-key').value});
    session=null;online=false;sessionStorage.removeItem('oyss-admin-session');config=validated;localStorage.setItem('oyss-admin-config',JSON.stringify(config));
    await loadPublic();message('Proje hazır. Yetkili e-posta adresinle giriş yap.');
  }catch(error){message(error.message,true);}
});
$('email-form').addEventListener('submit',async event=>{
  event.preventDefault(); const button=event.submitter;button.disabled=true;
  try {
    await api('/auth/v1/otp?redirect_to='+encodeURIComponent(location.origin+location.pathname),{method:'POST',body:{email:$('email').value.trim(),create_user:true}});
    $('otp-form').dataset.sent='yes';render();message('E-postandaki giriş bağlantısını aç. E-postada kod varsa aşağıdaki alana girebilirsin. Düzenleme için hesabına ayrıca yönetici yetkisi verilmiş olmalı.');
  }catch(error){message(error.message,true);}finally{button.disabled=false;}
});
$('otp-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;
  try {
    session=await api('/auth/v1/verify',{method:'POST',body:{email:$('email').value.trim(),token:$('otp').value.trim(),type:'email'}});
    session.expires_at=Date.now()/1000+session.expires_in;sessionStorage.setItem('oyss-admin-session',JSON.stringify(session));
    await loadLive();$('otp').value='';message('İçerik yönetimine giriş yapıldı.');
  }catch(error){message(error.message,true);}finally{button.disabled=false;}
});
async function localPreview() {
  previewMode=true;online=false;session=null;sessionStorage.removeItem('oyss-admin-session');
  const saved=localStorage.getItem(localKey);items=saved?JSON.parse(saved):await(await fetch('seed_resources.json')).json();page=0;render();
}
$('offline').addEventListener('click',()=>void localPreview().catch(e=>message(e.message,true)));
$('logout').addEventListener('click',async()=>{
  try {await api('/auth/v1/logout',{method:'POST'});}catch(error){message(error.message,true);}
  session=null;sessionStorage.removeItem('oyss-admin-session');await loadPublic();message('Bu tarayıcıdaki oturum kapatıldı.');
});
try {
  let defaults=null;
  try {const response=await fetch('config.json',{cache:'no-store'});if(response.ok)defaults=publicConfig(await response.json());} catch {}
  const saved=JSON.parse(localStorage.getItem('oyss-admin-config')||'null');
  config=defaults??(saved?publicConfig(saved):null);
  if(config){$('project-url').value=config.url;$('anon-key').value=config.key;}
  session=JSON.parse(sessionStorage.getItem('oyss-admin-session')||'null');
  if(saved&&config&&saved.url!==config.url){session=null;sessionStorage.removeItem('oyss-admin-session');}
  const callback=authCallback(location.hash);
  if(callback){
    history.replaceState(null,'',location.pathname+location.search);
    if(!config)throw new Error('Giriş için proje bağlantısı bulunamadı.');
    session=callback;
    const user=await api('/auth/v1/user');
    if(!user?.id)throw new Error('Giriş doğrulanamadı.');
    sessionStorage.setItem('oyss-admin-session',JSON.stringify(session));
  }
  if(config&&session) {try {await loadLive();}catch(error){await loadPublic();message(error.message,true);}}
  else if(config) await loadPublic(); else await localPreview();
} catch(error) {
  if(location.hash.includes('access_token')||location.hash.includes('error='))history.replaceState(null,'',location.pathname+location.search);
  session=null;sessionStorage.removeItem('oyss-admin-session');items=[];previewMode=!config;render();message(error.message,true);
}
